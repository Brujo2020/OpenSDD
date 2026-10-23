/**
 * Propose · probe · compose — or keep the base (REQ-PB-016, REQ-PB-017).
 *
 * Harness²'s task-level recursion without a model in the loop:
 *   PROPOSE  candidates come from promoted lessons that carry a structured `proposal`
 *            (`add`/`skip`), and from HIL threshold proposals (a trigger whose escalations are
 *            answered "recommended, no change" above `maxUselessEscalationRate`);
 *   PROBE    each candidate must pass `playbook check`, then is replayed against the RECORDED
 *            evidence of past runs (engine audit logs + decision cards): gates passed, rework
 *            (rejections), escalations and the useless-escalation share — executable signals only;
 *   COMPOSE  keep a candidate only if it improves at least one metric and degrades none; when none
 *            qualifies the answer is `KEEP_BASE`, which is a result, not a failure.
 * Every decision is written as an evidence line, probes are counted against the playbook budget,
 * and nothing changes until a named person runs `playbook save`.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readAudit } from './engine.js';
import { listCards, thresholdProposals, triggerStats } from './hilCards.js';
import { HITL_DEFAULTS } from './hitl.js';
import { listLessons } from './memoryStore.js';
import { checkPlaybook, type Playbook } from './playbook.js';
import type { SignalValue } from './profile.js';

export interface Candidate {
  id: string;
  source: string;
  /** A playbook customization (`add`/`skip`), or… */
  customize?: NonNullable<Playbook['customize']>[number];
  /** …a HIL trigger whose useless escalations would stop. Saved to `.sdd/settings/hitl.json`. */
  relaxTrigger?: string;
}

export interface Metrics {
  gatesPassed: number;
  rework: number;
  escalations: number;
  uselessShare: number;
  /** Rejections caught by steps a candidate removes: risk nobody will observe any more (REQ-V37-004). */
  unobservedRisk: number;
}

export interface ProbeResult {
  candidate: Candidate;
  valid: boolean;
  issues: string[];
  before: Metrics;
  after: Metrics;
  verdict: 'kept' | 'dropped';
  evidence: string;
}

export interface ImproveResult {
  probes: ProbeResult[];
  composed: Playbook | null;
  thresholds: string[];
  decision: 'COMPOSE' | 'KEEP_BASE';
  budget: { used: number; max: number };
  runs: number;
}

interface RunRecord {
  feature: string;
  gatesPassed: number;
  rework: number;
  escalations: { trigger: string; step: string; useless: boolean }[];
  stepEvents: Map<string, { passed: number; rework: number }>;
}

const features = async (cwd: string): Promise<string[]> =>
  (await readdir(path.join(cwd, '.sdd', 'engine')).catch(() => [])).filter((n) => n.endsWith('.audit.jsonl')).map((n) => n.replace(/\.audit\.jsonl$/, '')).sort();

export const recordedRuns = async (cwd: string): Promise<RunRecord[]> => {
  const out: RunRecord[] = [];
  for (const feature of await features(cwd)) {
    const events = await readAudit(cwd, feature);
    const stepEvents = new Map<string, { passed: number; rework: number }>();
    for (const e of events) {
      if (!e.step) continue;
      const s = stepEvents.get(e.step) ?? { passed: 0, rework: 0 };
      if (['STEP_COMPLETED', 'GATE_APPROVED', 'GATE_ACCEPTED_AS_IS'].includes(e.event)) s.passed += 1;
      if (e.event === 'STEP_REJECTED') s.rework += 1;
      stepEvents.set(e.step, s);
    }
    const cards = await listCards(cwd, feature);
    out.push({
      feature,
      gatesPassed: [...stepEvents.values()].reduce((a, s) => a + s.passed, 0),
      rework: [...stepEvents.values()].reduce((a, s) => a + s.rework, 0),
      escalations: cards.filter((c) => c.answer).map((c) => ({ trigger: c.card.trigger, step: c.card.step, useless: Boolean(c.answer?.recommended && !c.answer.changed && (c.answer.effect === 'approve' || c.answer.effect === 'accept-as-is')) })),
      stepEvents,
    });
  }
  return out;
};

const metrics = (runs: RunRecord[], drop: { steps: Set<string>; trigger?: string }): Metrics => {
  let gatesPassed = 0;
  let rework = 0;
  let escalations = 0;
  let useless = 0;
  let unobservedRisk = 0;
  for (const r of runs) {
    for (const [step, s] of r.stepEvents) {
      if (drop.steps.has(step)) {
        unobservedRisk += s.rework;
        continue;
      }
      gatesPassed += s.passed;
      rework += s.rework;
    }
    for (const e of r.escalations) {
      if (drop.steps.has(e.step)) continue;
      if (drop.trigger && e.trigger === drop.trigger && e.useless) continue;
      escalations += 1;
      if (e.useless) useless += 1;
    }
  }
  return { gatesPassed, rework, escalations, uselessShare: escalations ? useless / escalations : 0, unobservedRisk };
};

const better = (b: Metrics, a: Metrics): { improved: string[]; degraded: string[] } => {
  const improved: string[] = [];
  const degraded: string[] = [];
  const cmp = (name: string, before: number, after: number, higherIsBetter: boolean) => {
    if (after === before) return;
    ((after > before) === higherIsBetter ? improved : degraded).push(`${name} ${before}→${after}`);
  };
  cmp('rework', b.rework, a.rework, false);
  cmp('escalations', b.escalations, a.escalations, false);
  cmp('unobserved risk', b.unobservedRisk, a.unobservedRisk, false);
  cmp('useless share', Number(b.uselessShare.toFixed(2)), Number(a.uselessShare.toFixed(2)), false);
  // Removing a step removes its passed gates too; that is not a degradation of quality.
  return { improved, degraded };
};

export const proposeCandidates = async (cwd: string): Promise<Candidate[]> => {
  const out: Candidate[] = [];
  for (const l of await listLessons(cwd)) {
    if (!l.withdrawn && l.promotedBy && l.proposal) out.push({ id: `lesson:${l.id}`, source: `lesson ${l.id} (${l.confidence}) — ${l.cue}`, customize: l.proposal });
  }
  const records = [];
  for (const f of await features(cwd)) records.push(...(await listCards(cwd, f)));
  for (const p of thresholdProposals(triggerStats(records), HITL_DEFAULTS.maxUselessEscalationRate)) {
    out.push({ id: `threshold:${p.trigger}`, source: p.evidence, relaxTrigger: p.trigger });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
};

const CONTROL = /security|gate|verify|review|audit/i;

export const improvePlaybook = async (
  cwd: string,
  base: Playbook,
  values: Record<string, SignalValue | 'unknown'>,
  opts: { k: number },
): Promise<ImproveResult> => {
  const checkedBase = await checkPlaybook(cwd, base, values);
  const max = Math.min(opts.k, checkedBase.budget.improve_probes);
  const runs = await recordedRuns(cwd);
  const before = metrics(runs, { steps: new Set() });
  const candidates = (await proposeCandidates(cwd)).slice(0, max);
  const probes: ProbeResult[] = [];
  for (const candidate of candidates) {
    const relax = candidate.relaxTrigger;
    const trial: Playbook = { ...base, customize: [...(base.customize ?? []), ...(candidate.customize ? [candidate.customize] : [])] };
    const checked = await checkPlaybook(cwd, trial, values);
    const dropped = new Set(checked.steps.filter((s) => s.decision === 'SKIP').map((s) => s.id).filter((id) => checkedBase.steps.find((b) => b.id === id)?.decision === 'EXECUTE'));
    const after = metrics(runs, { steps: dropped, trigger: relax });
    const { improved, degraded } = better(before, after);
    const valid = checked.ok;
    // A removed human gate or check is never a free improvement (REQ-V37-004).
    const controls = checkedBase.steps.filter((b) => dropped.has(b.id) && (b.review === 'human' || CONTROL.test(b.use) || (b.type?.kind === 'gate' || b.type?.kind === 'check')));
    const removesControl = controls.length > 0;
    const keep = valid && !removesControl && improved.length > 0 && degraded.length === 0;
    probes.push({
      candidate,
      valid,
      issues: checked.issues.map((i) => `${i.code}: ${i.message}`),
      before,
      after,
      verdict: keep ? 'kept' : 'dropped',
      evidence: `${keep ? 'kept' : 'dropped'} -> ${candidate.id} -> ${removesControl ? `removes a human/security control (${controls.map((c) => c.id).join(', ')}); needs a person, not a probe` : !valid ? `fails playbook check (${checked.issues.length} issue(s))` : improved.length ? `improves ${improved.join(', ')}${degraded.length ? `; degrades ${degraded.join(', ')}` : ''}` : 'no metric moved'} over ${runs.length} recorded run(s)`,
    });
  }
  const kept = probes.filter((p) => p.verdict === 'kept');
  const keptCustomize = kept.filter((p) => p.candidate.customize).map((p) => p.candidate.customize as NonNullable<Playbook['customize']>[number]);
  const composed: Playbook | null = keptCustomize.length ? { ...base, customize: [...(base.customize ?? []), ...keptCustomize] } : null;
  const thresholds = kept.filter((p) => p.candidate.relaxTrigger).map((p) => p.candidate.relaxTrigger as string);
  return { probes, composed, thresholds, decision: kept.length ? 'COMPOSE' : 'KEEP_BASE', budget: { used: probes.length, max }, runs: runs.length };
};
