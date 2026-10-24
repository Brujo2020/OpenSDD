import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  MAX_FAILED_ITERATIONS,
  applyDecision,
  escalationVerdict,
  failedIterations,
  nextDirective,
  readAudit,
  readState,
  report,
  startRun,
  type AuditEvent,
} from '../src/core/engine.js';
import { detectProfile, profileValues } from '../src/core/profile.js';
import { listCards, recordAnswer } from '../src/core/hilCards.js';

let cwd = '';
const w = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), text);
};
const begin = async (feature: string) => {
  w('pb.playbook.json', JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
  const s = await startRun(cwd, feature, path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
  const step = s.state!.steps[0].id;
  await report(cwd, feature, step, 'started');
  return step;
};
const refused = (step: string, detail: string): AuditEvent => ({ at: '', event: 'GATE_REFUSED', step, detail });

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'hil3-'));
  w('package.json', '{"name":"x"}');
});

describe('escalation policy — whichever comes first', () => {
  it('a critical failure escalates at the first attempt', () => {
    const v = escalationVerdict([refused('s', 'RECEIPT_TAMPERED: digest')], 's');
    expect(v).toMatchObject({ escalate: true, reason: 'critical', failures: 1 });
  });

  it('the same failure twice escalates at the second attempt', () => {
    const same = [refused('s', 'ARTIFACT_MISSING: a'), refused('s', 'ARTIFACT_MISSING: a')];
    expect(escalationVerdict(same.slice(0, 1), 's').escalate).toBe(false);
    expect(escalationVerdict(same, 's')).toMatchObject({ escalate: true, reason: 'no-progress', failures: 2 });
  });

  it('alternating failures (A, B, A) are no progress: the 3rd repeats the 1st', () => {
    const abab = [refused('s', 'ARTIFACT_MISSING: a'), refused('s', 'RECALL_MISSING: r'), refused('s', 'ARTIFACT_MISSING: a')];
    expect(escalationVerdict(abab.slice(0, 2), 's').escalate).toBe(false);
    expect(escalationVerdict(abab, 's')).toMatchObject({ escalate: true, reason: 'no-progress', failures: 3 });
    expect(escalationVerdict(abab, 's').why).toContain('repeats an earlier failure');
  });

  it('getting worse (everything still broken plus something new) is no progress', () => {
    const worse = [refused('s', 'ARTIFACT_MISSING: a'), refused('s', 'ARTIFACT_MISSING: a | RECALL_MISSING: r')];
    expect(escalationVerdict(worse, 's')).toMatchObject({ escalate: true, reason: 'no-progress' });
    expect(escalationVerdict(worse, 's').why).toContain('nothing from the previous attempt was fixed');
  });

  it('structured problems are not split on " | " and a message without a code is UNKNOWN', () => {
    const e1: AuditEvent = { at: '', event: 'GATE_REFUSED', step: 's', detail: 'x', problems: ['ARTIFACT_MISSING: a | b.txt'] };
    const e2: AuditEvent = { at: '', event: 'GATE_REFUSED', step: 's', detail: 'y', problems: ['something odd happened'] };
    const v = escalationVerdict([e1, e2], 's');
    expect(v.escalate).toBe(false);
    expect(v.codes).toEqual(['UNKNOWN']);
  });

  it('progress (fewer problems or different codes) keeps going until more than 3 failures', () => {
    const progressing = [
      refused('s', 'ARTIFACT_MISSING: a | ARTIFACT_MISSING: b | ARTIFACT_MISSING: c'),
      refused('s', 'ARTIFACT_MISSING: a | ARTIFACT_MISSING: b'),
      refused('s', 'RECALL_MISSING: x'),
      refused('s', 'ARTIFACT_MISSING: a'),
    ];
    for (let n = 1; n <= MAX_FAILED_ITERATIONS; n += 1) expect(escalationVerdict(progressing.slice(0, n), 's').escalate).toBe(false);
    expect(escalationVerdict(progressing.slice(0, 2), 's').why).toContain('progressing');
    expect(escalationVerdict(progressing, 's')).toMatchObject({ escalate: true, reason: 'budget', failures: 4 });
  });

  it('a human decision, an escalation or a completion restarts the count; other steps never count', () => {
    const audit = [refused('s', 'ARTIFACT_MISSING: a'), refused('t', 'ARTIFACT_MISSING: a'), { at: '', event: 'DECISION_RECORDED', step: 's' }, refused('s', 'ARTIFACT_MISSING: a')];
    expect(failedIterations(audit, 's')).toBe(1);
    expect(escalationVerdict(audit, 's').escalate).toBe(false);
  });
});

describe('escalation in the engine', () => {
  it('a stuck step (same failure twice) escalates at the 2nd attempt with a ready card', async () => {
    const step = await begin('f');
    const first = await report(cwd, 'f', step, 'completed');
    expect(first.message).toContain(`failed iteration 1/${MAX_FAILED_ITERATIONS}`);
    expect((await readState(cwd, 'f'))!.steps[0].status).toBe('in-progress');
    const second = await report(cwd, 'f', step, 'completed');
    expect(second.ok).toBe(false);
    expect(second.message).toContain('escalated to HIL (no progress after 2 attempts');
    expect(second.message).toMatch(/steelfoundry decide f HIL-0001 <A\|B\|C> --by/);
    expect((await readState(cwd, 'f'))!.steps[0].status).toBe('awaiting');
    expect((await nextDirective(cwd, 'f')).kind).toBe('present-gate');
    const cards = await listCards(cwd, 'f');
    expect(cards.map((c) => [c.card.trigger, c.card.default, c.card.options.map((o) => o.effect)])).toEqual([
      ['repeated-failure', 'B', ['reject', 'park', 'override']],
    ]);
    const audit = await readAudit(cwd, 'f');
    expect(audit.find((e) => e.event === 'ESCALATED_TO_HIL')?.detail).toMatch(/^no-progress:/);
    expect(failedIterations(audit, step)).toBe(0);
  });

  it('a converging step keeps working and escalates only after more than 3 failures', async () => {
    const step = await begin('c');
    const attempts = [['x1', 'x2', 'x3'], ['x1', 'x2'], ['x1'], []];
    const messages: string[] = [];
    for (const produced of attempts) messages.push((await report(cwd, 'c', step, 'completed', { produced })).message);
    expect(messages[1]).toContain('failed iteration 2/3, progressing');
    expect(messages[2]).toContain('failed iteration 3/3, progressing');
    expect(messages[3]).toContain('escalated to HIL (4 failed iterations');
  });

  it('retry (A) by a person puts the step back to work with a fresh budget', async () => {
    const step = await begin('g');
    for (let i = 0; i < 2; i += 1) await report(cwd, 'g', step, 'completed');
    const r = await recordAnswer(cwd, 'g', 'HIL-0001', 'A', 'Ana');
    expect(r.ok).toBe(true);
    expect((await applyDecision(cwd, r.card!, r.answer!)).ok).toBe(true);
    expect((await readState(cwd, 'g'))!.steps[0].status).toBe('revising');
    // The same failure again after the retry is attempt 1 of a new budget, not an instant re-escalation.
    expect((await report(cwd, 'g', step, 'started')).ok).toBe(true);
    expect((await report(cwd, 'g', step, 'completed')).message).toContain('failed iteration 1/3');
  });

  it('a tampered review receipt escalates at the first refusal (critical)', async () => {
    const step = await begin('t');
    w('spec.md', 'v1');
    const { recordReview } = await import('../src/core/reviewReceipts.js');
    await recordReview(cwd, { feature: 't', step, reviewer: 'Ana', artifacts: ['spec.md'], roots: [] });
    const file = path.join(cwd, '.sdd', 'reviews', 't', `${step}.json`);
    const { readFileSync } = await import('node:fs');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"Ana"', '"Mallory"'));
    const r = await report(cwd, 't', step, 'completed');
    expect(r.message).toContain('RECEIPT_TAMPERED');
    expect(r.message).toContain('escalated to HIL (critical failure on attempt 1');
  });
});
