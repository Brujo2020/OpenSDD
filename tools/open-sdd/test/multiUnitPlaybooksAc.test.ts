/**
 * One fixture per acceptance criterion of `.sdd/specs/multi-unit-playbooks` (AC-01…AC-17).
 * AC-10 needs the AI-DLC runtime and validator: reported as not run (see the skipped test).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { DIRECTIVE_SCHEMA, validateDirective, readAudit, startRun, report, phaseTrace } from '../src/core/engine.js';
import { writePack } from '../src/core/handoff.js';
import { validateCard, prepareCard, recordAnswer, triggerStats, thresholdProposals, type DecisionCard } from '../src/core/hilCards.js';
import { reflect, promote } from '../src/core/memoryStore.js';
import { checkPlaybook, findPlaybook } from '../src/core/playbook.js';
import { improvePlaybook } from '../src/core/playbookImprove.js';
import { buildFor, skillsHosts } from '../src/core/playbookBuild.js';
import { detectProfile, profileValues } from '../src/core/profile.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const w = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), text);
};
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const vals = async () => profileValues(await detectProfile(cwd));
const tree = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name)));
  };
  walk(cwd);
  return out.sort();
};
const baseCard = (over: Partial<DecisionCard> = {}): Omit<DecisionCard, 'id' | 'createdAt'> => ({
  feature: 'f',
  step: 's',
  trigger: 'phase-gate',
  question: 'Accept?',
  options: [
    { key: 'A', label: 'Approve', consequence: 'done', effect: 'approve' },
    { key: 'B', label: 'Park', consequence: 'stops', effect: 'park' },
  ],
  recommend: 'A',
  default: 'B',
  evidence: ['kept -> change -> 2 of 2 runs'],
  deadlineHours: 24,
  ...over,
});
const lesson = (cue: string, origin: string, proposal?: unknown) => ({
  rows: [{ component: 'VE', change: cue, observed: 'fewer reworks', verdict: 'helped', runs: 3 }],
  lesson: { cue, lesson: `do ${cue}`, evidence: [0], confidence: 'medium', kind: 'invariant', stepType: 'opensdd:skill/sdd-bugfix', origins: [origin], ...(proposal ? { proposal } : {}) },
});

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'muac-'));
  w('package.json', '{"name":"x"}');
});

describe('multi-unit-playbooks acceptance', () => {
  it('AC-01 modes --projects --json contains multi-unit', async () => {
    expect((await run('modes', '--projects', '--json')).out).toContain('multi-unit');
  });

  it('AC-02 two-repo fixture: profile prints repos=2 with its source', async () => {
    mkdirSync(path.join(cwd, 'api', '.git'), { recursive: true });
    mkdirSync(path.join(cwd, 'web', '.git'), { recursive: true });
    const r = await run('playbook', 'profile');
    expect(r.out).toMatch(/repos\s+2/);
    const p = await detectProfile(cwd);
    expect(p.signals.find((s) => s.id === 'repos')?.source).toContain('api, web');
    expect(p.type).toBe('multi-unit');
  });

  it('AC-03 skipping units-generation while delivery-planning consumes it exits 1', async () => {
    w('pb.playbook.json', JSON.stringify({
      name: 'starve',
      lead: 'aidlc',
      phases: [{ id: 'inception', steps: [{ use: 'aidlc:stage/requirements-analysis' }, { use: 'aidlc:stage/units-generation' }, { use: 'aidlc:stage/delivery-planning' }] }],
      customize: [{ skip: ['units-generation'] }],
    }));
    const r = await run('playbook', 'check', path.join(cwd, 'pb.playbook.json'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('STARVED_STEP');
  });

  it('AC-04 plan twice: identical stdout; tree unchanged', async () => {
    const before = tree();
    const a = await run('playbook', 'plan', 'fix the crash in login');
    const b = await run('playbook', 'plan', 'fix the crash in login');
    expect(a.out).toBe(b.out);
    expect(tree()).toEqual(before);
  });

  it('AC-05 directive kinds validate; a forged key fails; report appends one event', async () => {
    for (const [kind, keys] of Object.entries(DIRECTIVE_SCHEMA)) {
      const d = Object.fromEntries(keys.map((k) => [k, k === 'kind' ? kind : null]));
      expect(validateDirective(d)).toEqual([]);
      expect(validateDirective({ ...d, forged: 1 }).length).toBeGreaterThan(0);
    }
    await startRun(cwd, 'f', 'bug', await vals());
    const n = (await readAudit(cwd, 'f')).length;
    expect((await report(cwd, 'f', 'sdd-bugfix', 'started')).ok).toBe(true);
    expect((await readAudit(cwd, 'f')).length).toBe(n + 1);
  });

  it('AC-06 a failing unit is not merged; editing a protected test blocks the merge', async () => {
    w('oracle.test.ts', 'a');
    await run('waves', 'f', '--baseline', '1', '--protect', 'oracle.test.ts');
    const failing = await run('waves', 'f', '--verify', '1', '--check', 'test "$OPEN_SDD_UNIT" != b', '--units', 'a,b');
    expect(failing.code).toBe(1);
    expect(failing.out).toMatch(/b exit [1-9]/);
    w('oracle.test.ts', 'b');
    expect((await run('waves', 'f', '--verify', '1', '--check', 'true')).out).toContain('TAMPERED');
  });

  it('AC-07 goal and ids at both ends of the pack; wrong recall; edited input is stale', async () => {
    w('.sdd/specs/f/requirements.md', '### REQ-F-001\nThe system shall work.\n| AC-01 | 001 | x |\n');
    const { markdown } = await writePack(cwd, { feature: 'f', step: 'design', use: 'opensdd:skill/sdd-spec-design', consumes: ['sdd:requirements'], goal: 'design: plan the feature', budget: 8000 });
    const tenth = Math.ceil(markdown.length / 10);
    for (const needle of ['design: plan the feature', 'REQ-F-001', 'AC-01']) {
      expect(markdown.slice(0, tenth + 200)).toContain(needle);
      expect(markdown.slice(-tenth - 200)).toContain(needle);
    }
    expect((await run('handoff', 'recall', 'f', 'design', '--text', 'design REQ-F-001')).out).toContain('RECALL_MISMATCH');
    w('.sdd/specs/f/requirements.md', '### REQ-F-001\nchanged\n');
    expect((await run('handoff', 'check', 'f', 'design')).out).toContain('STALE');
  });

  it('AC-08 a missing produces blocks the gate; a reviewed artifact edit is refused', async () => {
    w('pb.playbook.json', JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'f', path.join(cwd, 'pb.playbook.json'), await vals());
    expect(s.ok).toBe(true);
    const step = s.state!.steps[0].id;
    await report(cwd, 'f', step, 'started');
    const r = await report(cwd, 'f', step, 'completed');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('ARTIFACT_MISSING');
    w('spec.md', 'v1');
    await run('review', 'record', 'f', step, '--by', 'Ana', '--artifact', 'spec.md');
    w('spec.md', 'v2');
    expect((await run('review', 'freeze-check', 'spec.md')).code).toBe(1);
  });

  it('AC-09 an orphan requirement fails the phase gate', async () => {
    w('.sdd/specs/f/requirements.md', '# Requirements\n\n### REQ-F-001 — A\n- Statement: WHEN x the system shall y.\n\n### REQ-F-002 — B\n- Statement: WHEN a the system shall b.\n');
    w('.sdd/specs/f/plan.md', '# Plan\n\nCovers REQ-F-001 and REQ-F-002.\n');
    w('.sdd/specs/f/tasks.md', '# Tasks\n\n- [ ] 1. Do A — _Requirements: REQ-F-001_\n');
    const t = await phaseTrace(cwd, 'f');
    expect(t.inspected).toBe(true);
    expect(t.problems.join('\n')).toContain('REQ-F-002');
  });

  it.skip('AC-10 AI-DLC validator — NOT RUN: requires the AI-DLC runtime (bun) and checkout', () => {});

  it('AC-11 cards: one question, 2–4 options, evidence; a card without evidence is refused', async () => {
    for (const trigger of ['phase-gate', 'irreversible-damage', 'low-confidence']) {
      const card = baseCard({ trigger });
      expect(validateCard(card)).toEqual([]);
      expect((await prepareCard(cwd, card)).ok).toBe(true);
    }
    expect(validateCard(baseCard({ evidence: [] })).join()).toContain('without evidence');
    expect(validateCard(baseCard({ question: 'A? B?' })).length).toBeGreaterThan(0);
  });

  it('AC-12 empty answer exits 1; accept-as-is from revision 3; autonomous override refused', async () => {
    w('.sdd/questions/f/s.md', '## Q1 — Scope?\nA. small\nX. Other\n[Answer]:\n');
    expect((await run('questions', 'check', 'f', 's')).code).toBe(1);
    const asIs = baseCard({ options: [...baseCard().options, { key: 'C', label: 'As is', consequence: 'kept', effect: 'accept-as-is' }] });
    expect(validateCard(asIs, { revisions: 2 }).join()).toContain('third revision');
    expect(validateCard(asIs, { revisions: 3 })).toEqual([]);
    const ov = await prepareCard(cwd, baseCard({ options: [...baseCard().options, { key: 'C', label: 'Override', consequence: 'gate bypassed', effect: 'override' }] }));
    const r = await recordAnswer(cwd, 'f', ov.card!.id, 'C', 'Ana', { autonomous: true });
    expect(r.ok).toBe(false);
  });

  it('AC-13 confounded-only lesson is quarantined; NO_ENTRY accepted', async () => {
    const r = await reflect(cwd, { rows: [{ component: 'VE', change: 'x', observed: 'y', runs: 1 }], lesson: lesson('c', 'o').lesson as never });
    expect(r.outcome).toBe('quarantined');
    expect(r.issues.map((i) => i.code)).toContain('ONLY_CONFOUNDED');
    expect((await reflect(cwd, { rows: [], lesson: 'NO_ENTRY' })).outcome).toBe('NO_ENTRY');
  });

  it('AC-14 unpromoted lessons never reach a pack; withdraw removes derived lessons', async () => {
    const r = await reflect(cwd, lesson('flaky', 'HIL-0009') as never);
    const pack = () => writePack(cwd, { feature: 'f', step: 'fix', use: 'opensdd:skill/sdd-bugfix', consumes: [], goal: 'fix', budget: 8000 });
    expect((await pack()).pack.lessons).toEqual([]);
    await promote(cwd, r.id!, 'Ana');
    expect((await pack()).pack.lessons.map((l) => l.id)).toEqual([r.id]);
    expect((await run('memory', 'withdraw', '--origin', 'HIL-0009')).out).toContain(r.id!);
    expect((await pack()).pack.lessons).toEqual([]);
  });

  it('AC-15 ten recommended-unchanged decisions yield one proposal; thresholds unchanged', async () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      card: { ...baseCard(), id: `HIL-${i}`, createdAt: '' } as DecisionCard,
      answer: { id: `HIL-${i}`, option: 'A' as const, effect: 'approve' as const, by: 'Ana', at: '', recommended: true, changed: false },
    }));
    const proposals = thresholdProposals(triggerStats(records), 0.5);
    expect(proposals).toHaveLength(1);
    expect(tree().some((f) => f.includes('hitl.json'))).toBe(false);
  });

  it('AC-16 improve --k 3: at most 3 probes with metrics, COMPOSE or KEEP_BASE, playbook unchanged', async () => {
    for (const [i, cue] of ['a', 'b', 'c'].entries()) {
      const r = await reflect(cwd, lesson(`cue-${cue}`, `o${i}`, { skip: ['sdd-verify-completion'] }) as never);
      await promote(cwd, r.id!, 'Ana');
    }
    const found = (await findPlaybook(cwd, 'bug'))!;
    const hash = createHash('sha256').update(readFileSync(found.file)).digest('hex');
    const r = await improvePlaybook(cwd, found.playbook, await vals(), { k: 3 });
    expect(r.budget.used).toBeLessThanOrEqual(3);
    expect(r.probes.length).toBe(3);
    for (const p of r.probes) expect(p.before).toBeDefined();
    expect(['COMPOSE', 'KEEP_BASE']).toContain(r.decision);
    expect(createHash('sha256').update(readFileSync(found.file)).digest('hex')).toBe(hash);
  });

  it('AC-17 one playbook builds for every skills host and MCP within the always-on budget', async () => {
    const found = (await findPlaybook(cwd, 'multi-unit'))!;
    const checked = await checkPlaybook(cwd, found.playbook, await vals());
    for (const target of [...skillsHosts().map((h) => h.id), 'mcp']) {
      const b = buildFor(target, checked);
      expect(b.errors, target).toEqual([]);
      expect(b.files.length, target).toBeGreaterThan(0);
    }
  });
});
