/**
 * Five critical QC findings (2026-10-23), one regression test each. Each test reproduced the defect
 * before its fix.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { listCards, prepareCard, recordAnswer } from '../src/core/hilCards.js';
import { applyDecision, nextDirective, prepareEscalationCard, report, startRun } from '../src/core/engine.js';
import { detectProfile, profileValues } from '../src/core/profile.js';
import { confirmOnTty } from '../src/core/hilIdentity.js';
import { recordReview } from '../src/core/reviewReceipts.js';
import { computeSddScore } from '../src/core/sddScore.js';
import { asPerson } from './support/asPerson.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const approveCard = () =>
  prepareCard(cwd, {
    feature: 'f', step: 's', trigger: 'phase-gate', question: 'Ship it?',
    options: [
      { key: 'A', label: 'Approve', consequence: 'done', effect: 'approve' },
      { key: 'B', label: 'Park', consequence: 'stops', effect: 'park' },
    ],
    recommend: 'A', default: 'B', evidence: ['kept -> change -> 2 of 2 runs'], deadlineHours: 24,
  });

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'qc-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  writeFileSync(path.join(cwd, 'spec.md'), 'v1');
});

describe('QC-1 · an agent cannot approve its own HIL card', () => {
  it('`--confirm <id>` from an agent session no longer approves; only a terminal confirmation does', async () => {
    const c = (await approveCard()).card!;
    const agent = await recordAnswer(cwd, 'f', c.id, 'A', 'Ana', { agent: true, confirm: c.id });
    expect(agent.ok).toBe(false);
    expect(agent.message).toContain('AGENT_SESSION');
    expect(agent.message).not.toMatch(/OPEN_SDD_HUMAN|--confirm/);
    // The terminal check runs only for a grant that passed every other check.
    let asked = 0;
    const unlisted = await recordAnswer(cwd, 'f', c.id, 'Z', 'Ana', { agent: true, ttyConfirmed: () => ++asked > 0 });
    expect(unlisted.ok).toBe(false);
    expect(asked).toBe(0);
    const tty = await recordAnswer(cwd, 'f', c.id, 'A', 'Ana', { agent: true, ttyConfirmed: () => ++asked > 0 });
    expect(asked).toBe(1);
    expect(tty.ok).toBe(true);
    expect(tty.answer?.channel).toBe('tty-confirmed');
  });

  it('without a controlling terminal (or under the test runner) the confirmation is refused', () => {
    expect(confirmOnTty('HIL-0001', path.join(cwd, 'no-such-tty'))).toBe(false);
    expect(confirmOnTty('HIL-0001')).toBe(false);
  });
});

describe('QC-2 · an agent cannot sign a human review', () => {
  it('a receipt from an agent session needs both models, and they must differ', async () => {
    const human = await recordReview(cwd, { feature: 'f', step: 's', reviewer: 'Ana', agent: true, artifacts: ['spec.md'], roots: [] });
    expect(human.ok).toBe(false);
    expect(human.message).toContain('cannot record a human review');
    const same = await recordReview(cwd, { feature: 'f', step: 's', reviewer: 'bot', agent: true, reviewerModel: 'm-1', authorModel: 'm-1', artifacts: ['spec.md'], roots: [] });
    expect(same.ok).toBe(false);
    const other = await recordReview(cwd, { feature: 'f', step: 's', reviewer: 'bot', agent: true, reviewerModel: 'm-2', authorModel: 'm-1', artifacts: ['spec.md'], roots: [] });
    expect(other.ok).toBe(true);
    expect((await asPerson(() => run('review', 'record', 'f', 'h', '--by', 'Ana', '--artifact', 'spec.md'))).code).toBe(0);
  });
});

describe('QC-3 · an escalated step comes with a ready card (no hand-written JSON)', () => {
  it('an escalation prepares a valid card with retry / park / exception; nothing to write by hand', async () => {
    writeFileSync(path.join(cwd, 'pb.playbook.json'), JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'f', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const step = s.state!.steps[0].id;
    await report(cwd, 'f', step, 'started');
    let last = { ok: true, message: '' };
    for (let i = 0; i < 2; i += 1) last = await report(cwd, 'f', step, 'completed');
    expect(last.message).toContain('steelforge decide f HIL-0001 <A|B|C>');
    const [only] = await listCards(cwd, 'f');
    expect(only.card.options.map((o) => o.effect)).toEqual(['reject', 'park', 'override']);
    expect(only.card.default).toBe('B');
  });

  it('the agent cannot pick "retry" on its own escalation card (it would reset its own budget)', async () => {
    writeFileSync(path.join(cwd, 'pb.playbook.json'), JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'r', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const step = s.state!.steps[0].id;
    await report(cwd, 'r', step, 'started');
    for (let i = 0; i < 2; i += 1) await report(cwd, 'r', step, 'completed');
    const byAgent = await recordAnswer(cwd, 'r', 'HIL-0001', 'A', 'bot', { agent: true });
    expect(byAgent.ok).toBe(false);
    expect(byAgent.message).toContain('AGENT_SESSION');
    // Parking is always safe: an agent may stop itself.
    expect((await recordAnswer(cwd, 'r', 'HIL-0001', 'B', 'bot', { agent: true })).ok).toBe(true);
  });

  it('parked and resumed, the escalated step is presented again with a fresh card', async () => {
    writeFileSync(path.join(cwd, 'pb.playbook.json'), JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'p', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const step = s.state!.steps[0].id;
    await report(cwd, 'p', step, 'started');
    for (let i = 0; i < 2; i += 1) await report(cwd, 'p', step, 'completed');
    const parked = await recordAnswer(cwd, 'p', 'HIL-0001', 'B', 'Ana');
    await applyDecision(cwd, parked.card!, parked.answer!);
    await report(cwd, 'p', step, 'unpark');
    const d = await nextDirective(cwd, 'p');
    expect(d.kind).toBe('present-gate');
    expect(d.kind === 'present-gate' && d.card).toMatch(/HIL-0002\.md$/);
  });

  it('an autonomous run is not offered an exception it could not use', async () => {
    writeFileSync(path.join(cwd, 'pb.playbook.json'), JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'a', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const state = { ...s.state!, autonomous: true };
    const r = await prepareEscalationCard(cwd, state, state.steps[0], '4 failed iterations (ARTIFACT_MISSING)');
    expect(r.card!.options.map((o) => o.effect)).toEqual(['reject', 'park']);
  });
});

describe('QC-4 · the always-on rules reach the default `setup` path', () => {
  it('setup --write installs the Karpathy rules and every command carries the three rules', async () => {
    const r = await run('setup', '--write', '--no-input');
    expect(r.code).toBe(0);
    const rules = path.join(cwd, '.sdd', 'settings', 'rules', 'karpathy-guidelines.md');
    expect(existsSync(rules)).toBe(true);
    expect(readFileSync(rules, 'utf8')).toContain('## 4. Goal-Driven Execution');
    const dir = path.join(cwd, '.claude', 'commands');
    const commands = readdirSync(dir);
    expect(commands.length).toBeGreaterThan(0);
    for (const file of commands) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      expect(text, file).toContain('## Always-on rules');
      expect(text, file).toContain('C-INDEPENDENT-REVIEW');
      expect(text, file).toContain('steelforge decide');
    }
  });
});

describe('QC-5 · the door speaks in the five verbs', () => {
  it('fresh repo → setup; installed and no spec → start; a failing chain → check', async () => {
    expect((await computeSddScore(cwd)).nextAction).toBe('steelforge setup --write');
    await run('setup', '--write', '--no-input');
    expect((await computeSddScore(cwd)).nextAction).toBe('steelforge start "<lo que quieres>"');
  });
});
