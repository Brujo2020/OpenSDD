/**
 * Playbooks: a per-case SDD flow as validated data (REQ-PB-003).
 *
 * A playbook is `.sdd/playbooks/<name>.playbook.json`: phases of steps, each step a registered
 * STEP TYPE (an open-sdd flow, module, skill, command or gate, or an AI-DLC stage slug) with
 * declared `consumes` / `produces`. The format is JSON on purpose: the repository has no YAML
 * dependency and `C-STACK-FACT` forbids adding one; people edit playbooks through the
 * `sdd-playbook` skill, not by hand.
 *
 * The checker is the authority:
 *   - unknown keys, unknown step types and duplicate step ids exit 1;
 *   - `extends` is resolved, then `customize` (only `add` and `skip`: additive by construction);
 *   - every `when` is evaluated here, against the project profile — AI-DLC parses `when:` but does
 *     not act on it, so the AI-DLC target only ever receives plain membership;
 *   - a step that will run and requires an artifact whose producer is in the plan but skipped is
 *     STARVED (the AI-DLC `validate-grid` rule) and exits 1 naming both steps.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS, MODULE_IDS } from './sddModes.js';
import type { SignalValue } from './profile.js';

export const TEMPLATES_PLAYBOOKS = fileURLToPath(new URL('../../templates/playbooks', import.meta.url));
const SHARED_SKILLS = fileURLToPath(new URL('../../templates/agents/_shared/skills', import.meta.url));

// ── Step types ────────────────────────────────────────────────────────────────────────────────

export interface Consume {
  artifact: string;
  required: boolean;
}

export interface StepType {
  use: string;
  kind: 'flow' | 'module' | 'skill' | 'command' | 'gate' | 'check' | 'aidlc-stage';
  consumes: Consume[];
  produces: string[];
  /** Planning prior 1–5: how much ceremony the step costs. */
  cost: number;
  /** The uncertainty component that justifies the step's cost. */
  component: Component;
  phase?: string;
}

export type Component = 'IAE' | 'CSU' | 'VE' | 'R' | 'UA';

const c = (artifact: string, required = true): Consume => ({ artifact, required });

/** open-sdd skill contracts. Artifacts of the open-sdd triad are namespaced `sdd:`. */
const SKILL_CONTRACTS: Record<string, { consumes: Consume[]; produces: string[]; cost: number; component: Component }> = {
  'sdd-discovery': { consumes: [], produces: ['sdd:brief'], cost: 3, component: 'IAE' },
  'sdd-steering': { consumes: [], produces: ['sdd:steering'], cost: 2, component: 'CSU' },
  'sdd-steering-custom': { consumes: [c('sdd:steering')], produces: ['sdd:steering'], cost: 2, component: 'CSU' },
  'sdd-getspecs': { consumes: [], produces: ['sdd:steering', 'sdd:requirements'], cost: 3, component: 'CSU' },
  'sdd-spec-init': { consumes: [], produces: ['sdd:spec'], cost: 1, component: 'IAE' },
  'sdd-spec-requirements': { consumes: [c('sdd:spec', false)], produces: ['sdd:requirements'], cost: 1, component: 'IAE' },
  'sdd-validate-gap': { consumes: [c('sdd:requirements')], produces: ['sdd:gap'], cost: 2, component: 'CSU' },
  'sdd-spec-design': { consumes: [c('sdd:requirements')], produces: ['sdd:design'], cost: 2, component: 'CSU' },
  'sdd-validate-design': { consumes: [c('sdd:design')], produces: [], cost: 2, component: 'R' },
  'sdd-spec-tasks': { consumes: [c('sdd:design')], produces: ['sdd:tasks'], cost: 1, component: 'IAE' },
  'sdd-spec-quick': { consumes: [], produces: ['sdd:requirements', 'sdd:design', 'sdd:tasks'], cost: 1, component: 'IAE' },
  'sdd-spec-batch': { consumes: [c('sdd:roadmap', false)], produces: ['sdd:requirements', 'sdd:design', 'sdd:tasks'], cost: 2, component: 'CSU' },
  'sdd-impl': { consumes: [c('sdd:tasks')], produces: ['sdd:code'], cost: 1, component: 'VE' },
  'sdd-validate-impl': { consumes: [c('sdd:code')], produces: ['sdd:verification'], cost: 2, component: 'VE' },
  'sdd-verify-completion': { consumes: [c('sdd:code')], produces: [], cost: 1, component: 'VE' },
  'sdd-audit': { consumes: [c('sdd:verification', false)], produces: ['sdd:audit'], cost: 2, component: 'R' },
  'sdd-bugfix': { consumes: [], produces: ['sdd:code'], cost: 1, component: 'VE' },
  'sdd-tiny': { consumes: [], produces: ['sdd:code'], cost: 1, component: 'IAE' },
  'sdd-promote': { consumes: [], produces: ['sdd:spec'], cost: 1, component: 'IAE' },
  'sdd-refactor': { consumes: [c('sdd:characterization', false)], produces: ['sdd:code'], cost: 1, component: 'VE' },
  'sdd-characterize': { consumes: [], produces: ['sdd:characterization'], cost: 2, component: 'VE' },
  'sdd-plan-only': { consumes: [], produces: ['sdd:design'], cost: 1, component: 'IAE' },
  'sdd-playbook': { consumes: [], produces: ['sdd:playbook'], cost: 1, component: 'IAE' },
};

const COMMANDS: StepType[] = [
  { use: 'opensdd:command/import-aidlc', kind: 'command', consumes: [c('unit-of-work'), c('requirements')], produces: ['sdd:requirements', 'sdd:design', 'sdd:tasks'], cost: 1, component: 'CSU' },
  { use: 'opensdd:command/waves', kind: 'command', consumes: [c('sdd:tasks')], produces: ['sdd:waves'], cost: 1, component: 'CSU' },
  { use: 'opensdd:command/delta-init', kind: 'command', consumes: [], produces: ['sdd:delta'], cost: 2, component: 'CSU' },
  { use: 'opensdd:command/brownfield-constitution', kind: 'command', consumes: [], produces: ['sdd:constitution'], cost: 2, component: 'R' },
  { use: 'opensdd:command/brownfield-contracts', kind: 'command', consumes: [c('sdd:tasks')], produces: [], cost: 2, component: 'VE' },
  { use: 'opensdd:command/gherkin', kind: 'command', consumes: [c('sdd:requirements')], produces: ['sdd:acceptance'], cost: 2, component: 'VE' },
  { use: 'opensdd:command/requirements-review', kind: 'command', consumes: [c('sdd:requirements')], produces: [], cost: 1, component: 'IAE' },
  { use: 'opensdd:command/discovery-lint', kind: 'command', consumes: [c('sdd:brief')], produces: [], cost: 1, component: 'IAE' },
  { use: 'opensdd:command/consistency', kind: 'command', consumes: [c('sdd:tasks')], produces: [], cost: 1, component: 'CSU' },
  { use: 'opensdd:command/audit-bundle', kind: 'command', consumes: [], produces: ['sdd:audit'], cost: 1, component: 'R' },
  { use: 'opensdd:command/archive', kind: 'command', consumes: [c('sdd:verification', false)], produces: [], cost: 1, component: 'R' },
];

/** Checks a step can carry (`checks: [...]`); they map to executable open-sdd commands. */
export const CHECKS: Record<string, string> = {
  'opensdd:ears': 'open-sdd requirements review <feature>',
  'opensdd:clarify': 'open-sdd requirements review <feature>',
  'opensdd:constitution': 'open-sdd govern constitution',
  'opensdd:boundaries': 'open-sdd waves <feature>',
  'opensdd:gates-c1-c3': 'open-sdd gates run C1 C2 C3',
  'opensdd:trace': 'open-sdd next <feature> (phase boundary trace)',
};
for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']) CHECKS[`opensdd:gate/${id}`] = `open-sdd gates run ${id}`;

interface AidlcSnapshot {
  aidlcVersion: string;
  stages: { slug: string; phase: string; produces: string[]; consumes: Consume[]; cost: number; component: Component }[];
}

let cachedCatalogue: Map<string, StepType> | null = null;
export const aidlcSnapshot = (): AidlcSnapshot => JSON.parse(readFileSync(path.join(TEMPLATES_PLAYBOOKS, 'aidlc-stages.json'), 'utf8')) as AidlcSnapshot;

/** Every registered step type, built from data that already ships. */
export const stepCatalogue = (): Map<string, StepType> => {
  if (cachedCatalogue) return cachedCatalogue;
  const map = new Map<string, StepType>();
  const skills = existsSync(SHARED_SKILLS) ? readdirSync(SHARED_SKILLS).filter((d) => d.startsWith('sdd-')).sort() : Object.keys(SKILL_CONTRACTS);
  for (const name of new Set([...skills, ...Object.keys(SKILL_CONTRACTS)])) {
    const k = SKILL_CONTRACTS[name] ?? { consumes: [], produces: [], cost: 1, component: 'IAE' as Component };
    map.set(`opensdd:skill/${name}`, { use: `opensdd:skill/${name}`, kind: 'skill', ...k });
  }
  for (const flow of FLOWS) {
    const skill = map.get(`opensdd:skill/${flow.skill.replace(/^\//, '')}`);
    map.set(`opensdd:flow/${flow.id}`, { use: `opensdd:flow/${flow.id}`, kind: 'flow', consumes: [], produces: skill?.produces ?? [], cost: skill?.cost ?? 1, component: skill?.component ?? 'IAE' });
  }
  for (const id of MODULE_IDS) map.set(`opensdd:module/${id}`, { use: `opensdd:module/${id}`, kind: 'module', consumes: [], produces: [], cost: 1, component: 'R' });
  for (const cmd of COMMANDS) map.set(cmd.use, cmd);
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'])
    map.set(`opensdd:gate/${id}`, { use: `opensdd:gate/${id}`, kind: 'gate', consumes: [], produces: [], cost: 1, component: 'R' });
  for (const s of aidlcSnapshot().stages)
    map.set(`aidlc:stage/${s.slug}`, { use: `aidlc:stage/${s.slug}`, kind: 'aidlc-stage', consumes: s.consumes, produces: s.produces, cost: s.cost, component: s.component, phase: s.phase });
  cachedCatalogue = map;
  return map;
};

// ── `when` expressions ────────────────────────────────────────────────────────────────────────

/**
 * Grammar: `term ( '|' term )*`, term = `atom ( '&' atom )*`, atom = `signal op value` or `signal`.
 * Operators: == != >= <= > <. Values: numbers, true/false, bare words. `unknown` never satisfies a
 * comparison, so an undecided signal can never switch a gate on or off by accident.
 */
export const evaluateWhen = (expr: string, values: Record<string, SignalValue | 'unknown'>): { ok: boolean; error?: string } => {
  const atom = (raw: string): boolean => {
    const m = raw.trim().match(/^([a-z][a-z0-9_-]*)\s*(==|!=|>=|<=|>|<)\s*([^\s]+)$/i);
    if (!m) {
      const name = raw.trim();
      if (!/^[a-z][a-z0-9_-]*$/i.test(name)) throw new Error(`cannot parse «${raw.trim()}»`);
      const v = values[name];
      return v !== undefined && v !== 'unknown' && v !== false && v !== 0 && v !== 'absent';
    }
    const [, name, op, rawValue] = m;
    if (!(name in values)) throw new Error(`unknown signal «${name}»`);
    const left = values[name];
    if (left === 'unknown') return false;
    const right: SignalValue = /^-?\d+(\.\d+)?$/.test(rawValue) ? Number(rawValue) : rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
    switch (op) {
      case '==': return String(left) === String(right);
      case '!=': return String(left) !== String(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
      case '>': return Number(left) > Number(right);
      default: return Number(left) < Number(right);
    }
  };
  try {
    return { ok: expr.split('|').some((term) => term.split('&').every(atom)) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

// ── Playbook data ─────────────────────────────────────────────────────────────────────────────

export interface PlaybookStep {
  id?: string;
  use: string;
  checks?: string[];
  when?: string;
  review?: 'human' | 'auto';
}

export interface Playbook {
  name: string;
  description?: string;
  extends?: string;
  lead?: 'opensdd' | 'aidlc';
  profile?: Record<string, string>;
  budget?: { handoff_tokens?: number; improve_probes?: number; always_on_chars?: number };
  phases: { id: string; steps: PlaybookStep[] }[];
  customize?: { when?: string; add?: (PlaybookStep & { phase: string; after?: string })[]; skip?: string[] }[];
}

const KEYS = {
  playbook: ['name', 'description', 'extends', 'lead', 'profile', 'budget', 'phases', 'customize'],
  budget: ['handoff_tokens', 'improve_probes', 'always_on_chars'],
  phase: ['id', 'steps'],
  step: ['id', 'use', 'checks', 'when', 'review'],
  add: ['id', 'use', 'checks', 'when', 'review', 'phase', 'after'],
  customize: ['when', 'add', 'skip'],
};

export const DEFAULT_BUDGET = { handoff_tokens: 8000, improve_probes: 6, always_on_chars: 6000 };

export interface CheckIssue {
  code: 'UNKNOWN_KEY' | 'UNKNOWN_STEP_TYPE' | 'UNKNOWN_CHECK' | 'DUPLICATE_STEP' | 'BAD_WHEN' | 'STARVED_STEP' | 'BAD_EXTENDS' | 'BAD_SHAPE' | 'UNKNOWN_ANCHOR';
  message: string;
}

export interface ResolvedStep {
  id: string;
  phase: string;
  use: string;
  type: StepType | null;
  checks: string[];
  review: 'human' | 'auto';
  decision: 'EXECUTE' | 'SKIP';
  reason: string;
}

export interface CheckResult {
  ok: boolean;
  name: string;
  lead: 'opensdd' | 'aidlc';
  budget: typeof DEFAULT_BUDGET;
  steps: ResolvedStep[];
  issues: CheckIssue[];
  extendsChain: string[];
}

const stepId = (s: PlaybookStep): string => s.id ?? s.use.split('/').pop() ?? s.use;

const shapeIssues = (pb: Record<string, unknown>, where: string): CheckIssue[] => {
  const issues: CheckIssue[] = [];
  const unknown = (obj: unknown, allowed: string[], at: string) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj))
      for (const key of Object.keys(obj)) if (!allowed.includes(key)) issues.push({ code: 'UNKNOWN_KEY', message: `${where}: unknown key «${key}» at ${at}` });
  };
  unknown(pb, KEYS.playbook, 'playbook');
  unknown(pb.budget, KEYS.budget, 'budget');
  if (!Array.isArray(pb.phases)) issues.push({ code: 'BAD_SHAPE', message: `${where}: \`phases\` must be a list` });
  for (const [i, ph] of ((pb.phases as unknown[]) ?? []).entries()) {
    unknown(ph, KEYS.phase, `phases[${i}]`);
    for (const [j, st] of (((ph as { steps?: unknown[] }).steps ?? []) as unknown[]).entries()) unknown(st, KEYS.step, `phases[${i}].steps[${j}]`);
  }
  for (const [i, cu] of ((pb.customize as unknown[]) ?? []).entries()) {
    unknown(cu, KEYS.customize, `customize[${i}]`);
    for (const [j, ad] of (((cu as { add?: unknown[] }).add ?? []) as unknown[]).entries()) unknown(ad, KEYS.add, `customize[${i}].add[${j}]`);
  }
  return issues;
};

/** Where a playbook name resolves: the project first, then the shipped library. */
export const playbookPaths = (cwd: string, name: string): string[] => [
  path.join(cwd, '.sdd', 'playbooks', `${name}.playbook.json`),
  path.join(cwd, '.sdd', 'playbooks', 'library', `${name}.playbook.json`),
  path.join(TEMPLATES_PLAYBOOKS, `${name}.playbook.json`),
];

export const loadPlaybookFile = async (file: string): Promise<Playbook> => JSON.parse(await readFile(file, 'utf8')) as Playbook;

export const findPlaybook = async (cwd: string, nameOrPath: string): Promise<{ file: string; playbook: Playbook } | null> => {
  const candidates = nameOrPath.endsWith('.json') ? [path.resolve(cwd, nameOrPath)] : playbookPaths(cwd, nameOrPath);
  for (const file of candidates) if (existsSync(file)) return { file, playbook: await loadPlaybookFile(file) };
  return null;
};

/** Shipped library playbook names (for the planner). */
export const libraryNames = (cwd: string): string[] => {
  const names = new Set<string>();
  const scan = (dir: string, prefix = '') => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) scan(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.playbook.json')) names.add(prefix + entry.name.replace(/\.playbook\.json$/, ''));
    }
  };
  scan(TEMPLATES_PLAYBOOKS);
  scan(path.join(cwd, '.sdd', 'playbooks', 'library'));
  return [...names].sort();
};

const mergeExtends = (base: Playbook, child: Playbook): Playbook => {
  const phases = base.phases.map((p) => ({ id: p.id, steps: [...p.steps] }));
  for (const ph of child.phases ?? []) {
    const target = phases.find((p) => p.id === ph.id);
    if (!target) phases.push({ id: ph.id, steps: [...ph.steps] });
    else for (const st of ph.steps) if (!target.steps.some((s) => stepId(s) === stepId(st))) target.steps.push(st);
  }
  return {
    ...base,
    ...child,
    budget: { ...base.budget, ...child.budget },
    profile: { ...base.profile, ...child.profile },
    phases,
    customize: [...(base.customize ?? []), ...(child.customize ?? [])],
    extends: base.extends,
  };
};

/**
 * Resolve and check a playbook against a profile. Pure apart from reading `extends` targets.
 */
export const checkPlaybook = async (cwd: string, input: Playbook, values: Record<string, SignalValue | 'unknown'>): Promise<CheckResult> => {
  const issues: CheckIssue[] = [...shapeIssues(input as unknown as Record<string, unknown>, input.name ?? 'playbook')];
  let pb = input;
  const chain: string[] = [];
  for (let depth = 0; pb.extends && depth < 8; depth++) {
    const target = pb.extends;
    if (chain.includes(target)) {
      issues.push({ code: 'BAD_EXTENDS', message: `extends cycle at «${target}»` });
      break;
    }
    chain.push(target);
    const found = await findPlaybook(cwd, target);
    if (!found) {
      issues.push({ code: 'BAD_EXTENDS', message: `extends «${target}» not found (looked in .sdd/playbooks/ and the shipped library)` });
      break;
    }
    issues.push(...shapeIssues(found.playbook as unknown as Record<string, unknown>, target));
    pb = mergeExtends(found.playbook, { ...pb, extends: undefined } as Playbook);
    pb.extends = found.playbook.extends;
  }

  const catalogue = stepCatalogue();
  const phases = (Array.isArray(pb.phases) ? pb.phases : []).map((p) => ({ id: p.id, steps: [...(p.steps ?? [])] }));
  const skipped = new Map<string, string>();
  for (const [i, cu] of (pb.customize ?? []).entries()) {
    if (cu.when) {
      const r = evaluateWhen(cu.when, values);
      if (r.error) issues.push({ code: 'BAD_WHEN', message: `customize[${i}].when: ${r.error}` });
      if (!r.ok) continue;
    }
    for (const add of cu.add ?? []) {
      const phase = phases.find((p) => p.id === add.phase) ?? (() => {
        const created = { id: add.phase, steps: [] as PlaybookStep[] };
        phases.push(created);
        return created;
      })();
      const step: PlaybookStep = { id: add.id, use: add.use, checks: add.checks, when: add.when, review: add.review };
      const at = add.after ? phase.steps.findIndex((s) => stepId(s) === add.after) : -1;
      if (add.after && at < 0) issues.push({ code: 'UNKNOWN_ANCHOR', message: `customize[${i}]: no step «${add.after}» in phase «${add.phase}»` });
      phase.steps.splice(at >= 0 ? at + 1 : phase.steps.length, 0, step);
    }
    for (const id of cu.skip ?? []) skipped.set(id, `skipped by customize[${i}]${cu.when ? ` (${cu.when})` : ''}`);
  }

  const steps: ResolvedStep[] = [];
  const seen = new Set<string>();
  for (const ph of phases) {
    for (const st of ph.steps) {
      const id = stepId(st);
      if (seen.has(id)) issues.push({ code: 'DUPLICATE_STEP', message: `step id «${id}» appears twice; give one an explicit \`id\`` });
      seen.add(id);
      const type = catalogue.get(st.use) ?? null;
      if (!type) issues.push({ code: 'UNKNOWN_STEP_TYPE', message: `step «${id}»: «${st.use}» is not a registered step type` });
      for (const chk of st.checks ?? []) if (!(chk in CHECKS)) issues.push({ code: 'UNKNOWN_CHECK', message: `step «${id}»: unknown check «${chk}»` });
      let decision: ResolvedStep['decision'] = 'EXECUTE';
      let reason = 'in the playbook';
      if (skipped.has(id)) {
        decision = 'SKIP';
        reason = skipped.get(id) as string;
      } else if (st.when) {
        const r = evaluateWhen(st.when, values);
        if (r.error) issues.push({ code: 'BAD_WHEN', message: `step «${id}».when: ${r.error}` });
        decision = r.ok ? 'EXECUTE' : 'SKIP';
        reason = `${st.when} → ${r.ok}`;
      }
      steps.push({ id, phase: ph.id, use: st.use, type, checks: st.checks ?? [], review: st.review ?? 'auto', decision, reason });
    }
  }

  // Starvation: a running step needs an artifact whose producer is in the plan but will not run.
  for (const [i, s] of steps.entries()) {
    if (s.decision !== 'EXECUTE' || !s.type) continue;
    for (const need of s.type.consumes.filter((x) => x.required)) {
      const producers = steps.filter((p) => p.type?.produces.includes(need.artifact));
      if (producers.length === 0) continue;
      if (!producers.some((p) => p.decision === 'EXECUTE' && steps.indexOf(p) < i)) {
        const skippedProducer = producers.find((p) => p.decision === 'SKIP');
        issues.push({
          code: 'STARVED_STEP',
          message: `step «${s.id}» requires «${need.artifact}», but its producer «${(skippedProducer ?? producers[0]).id}» ${skippedProducer ? 'is skipped' : 'runs after it'}`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    name: pb.name,
    lead: pb.lead ?? 'opensdd',
    budget: { ...DEFAULT_BUDGET, ...pb.budget },
    steps,
    issues,
    extendsChain: chain,
  };
};
