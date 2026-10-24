/**
 * CLI del ciclo multi-unit (spec multi-unit-playbooks): profile/check/plan, engine + next/report,
 * HIL (aprobación solo por respuesta nombrada), handoff/recall, memoria con gate de admisión,
 * recibos de revisión + freeze, árbitro de olas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { asPerson } from './support/asPerson.js';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { validateDirective } from '../src/core/engine.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const errs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => errs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  if (process.env.DBG) console.log(argv.join(' '), code, logs.join('\n'), errs.join('\n'));
  return { code, out: logs.join('\n'), err: errs.join('\n') };
};

const card = (step: string, defEffect = 'park') => ({
  feature: 'fix1',
  step,
  trigger: 'phase-gate',
  question: 'Accept the verification evidence?',
  options: [
    { key: 'A', label: 'Approve', consequence: 'step completes', effect: 'approve' },
    { key: 'B', label: 'Reject', consequence: 'step goes back to revision', effect: 'reject' },
    { key: 'C', label: 'Park', consequence: 'run stops', effect: defEffect === 'park' ? 'park' : 'park' },
  ],
  recommend: 'A',
  default: defEffect === 'park' ? 'C' : 'A',
  evidence: ['kept -> regression test -> 3 of 3 runs green'],
  deadlineHours: 24,
});

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'pbcli-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
});

describe('playbook CLI', () => {
  it('profile, list, check and plan', async () => {
    expect((await run('playbook', 'profile', '--json')).code).toBe(0);
    expect((await run('playbook', 'list')).out).toContain('multi-unit');
    expect((await run('playbook', 'check', 'bug')).code).toBe(0);
    const bad = path.join(cwd, 'bad.playbook.json');
    writeFileSync(bad, JSON.stringify({ name: 'bad', colour: 1, phases: [{ id: 'p', steps: [{ use: 'nope:x' }] }] }));
    const r = await run('playbook', 'check', bad);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/UNKNOWN_KEY|UNKNOWN_STEP_TYPE/);
    const plan = await run('playbook', 'plan', 'fix the crash in login', '--json');
    expect(JSON.parse(plan.out).type).toBe('bug');
    expect((await run('playbook', 'nope')).code).toBe(2);
  });

  it('build plans files and writes only with --write', async () => {
    const r = await run('playbook', 'build', 'bug', '--target', 'prompt', '--json');
    expect(r.code).toBe(0);
    const files = JSON.parse(r.out).files as string[];
    expect(files.length).toBeGreaterThan(0);
    expect(existsSync(path.join(cwd, files[0]))).toBe(false);
    expect((await run('playbook', 'build', 'bug', '--target', 'nope')).code).toBe(2);
  });
});

describe('engine next/report and the HIL gate', () => {
  it('runs a playbook to done; approval only from a named answer', async () => {
    expect((await run('engine', 'start', 'fix1', '--playbook', 'bug')).code).toBe(0);
    const d1 = JSON.parse((await run('next', 'fix1', '--json')).out);
    expect(validateDirective(d1)).toEqual([]);
    expect(d1.kind).toBe('handoff');
    await run('handoff', 'write', 'fix1', 'sdd-bugfix');
    expect((await run('report', 'fix1', '--step', 'sdd-bugfix', '--result', 'started')).code).toBe(0);
    expect((await run('report', 'fix1', '--step', 'sdd-bugfix', '--result', 'completed')).out).toContain('RECALL_MISSING');
    expect((await run('handoff', 'recall', 'fix1', 'sdd-bugfix', '--text', 'nothing')).code).toBe(1);
    expect((await run('handoff', 'recall', 'fix1', 'sdd-bugfix', '--text', 'sdd-bugfix')).code).toBe(0);
    expect((await run('report', 'fix1', '--step', 'sdd-bugfix', '--result', 'completed')).code).toBe(0);
    expect((await run('report', 'fix1', '--step', 'sdd-bugfix', '--result', 'approved')).code).toBe(1);

    const gate = 'sdd-verify-completion';
    await run('handoff', 'write', 'fix1', gate);
    await run('handoff', 'recall', 'fix1', gate, '--text', gate);
    await run('report', 'fix1', '--step', gate, '--result', 'started');
    expect((await run('report', 'fix1', '--step', gate, '--result', 'completed')).code).toBe(1);
    expect((await run('report', 'fix1', '--step', gate, '--result', 'awaiting-approval')).code).toBe(0);
    expect(JSON.parse((await run('next', 'fix1', '--json')).out).kind).toBe('present-gate');

    const silent = path.join(cwd, 'silent.json');
    writeFileSync(silent, JSON.stringify(card(gate, 'approve')));
    expect((await run('hil', 'prepare', 'fix1', '--card', silent)).out).toContain('nothing is approved by silence');
    const good = path.join(cwd, 'card.json');
    writeFileSync(good, JSON.stringify(card(gate)));
    const prep = await run('hil', 'prepare', 'fix1', '--card', good, '--json');
    expect(prep.code).toBe(0);
    const id = JSON.parse(prep.out).card.id as string;
    expect((await run('hil', 'answer', 'fix1', id, 'A')).code).toBe(1);
    // No TTY under vitest → agent session: an approval needs the card id repeated (REQ-V37-001).
    expect((await run('hil', 'answer', 'fix1', id, 'A', '--by', 'Ana')).out + '').not.toContain('approved');
    expect((await asPerson(() => run('hil', 'answer', 'fix1', id, 'A', '--by', 'Ana'))).code).toBe(0);
    expect(JSON.parse((await run('next', 'fix1', '--json')).out).kind).toBe('done');
    expect((await run('hil', 'list', 'fix1')).out).toContain('by Ana');
    expect((await run('memory', 'list', '--json')).out).toContain('hil-answer');
  });
});

describe('questions, memory, review receipts, wave referee', () => {
  it('question file needs complete answers and a named confirmation', async () => {
    const dir = path.join(cwd, '.sdd', 'questions', 'f', 's');
    mkdirSync(path.dirname(dir), { recursive: true });
    writeFileSync(`${dir}.md`, '## Q1 — Scope?\nA. small\nX. Other\n[Answer]:\n');
    expect((await run('questions', 'check', 'f', 's')).code).toBe(1);
    writeFileSync(`${dir}.md`, '## Q1 — Scope?\nA. small\nX. Other\n[Answer]: A\n');
    expect((await run('questions', 'check', 'f', 's')).code).toBe(0);
    expect((await run('questions', 'confirm', 'f', 's')).code).toBe(2);
    expect((await run('questions', 'confirm', 'f', 's', '--by', 'Ana')).code).toBe(0);
  });

  it('a lesson resting only on confounded rows is quarantined; promotion needs a name', async () => {
    const lesson = { cue: 'flaky login', lesson: 'retry once', evidence: [0], confidence: 'low', kind: 'invariant', stepType: 'opensdd:skill/sdd-bugfix', origins: ['HIL-0001'] };
    const q = path.join(cwd, 'q.json');
    writeFileSync(q, JSON.stringify({ rows: [{ component: 'a', change: 'x', observed: 'y', runs: 1 }], lesson }));
    expect((await run('memory', 'reflect', '--file', q)).code).toBe(1);
    const ok = path.join(cwd, 'ok.json');
    writeFileSync(ok, JSON.stringify({ rows: [{ component: 'a', change: 'x', observed: 'y', verdict: 'helped', runs: 3 }], lesson: { ...lesson, cue: 'other' } }));
    const r = await run('memory', 'reflect', '--file', ok, '--json');
    expect(r.code).toBe(0);
    const id = JSON.parse(r.out).id as string;
    expect((await run('memory', 'promote', id)).code).toBe(1);
    expect((await run('memory', 'promote', id, '--by', 'Ana')).code).toBe(0);
    expect((await run('memory', 'withdraw', '--origin', 'HIL-0001')).out).toContain(id);
  });

  it('a reviewed artifact is frozen until re-reviewed', async () => {
    writeFileSync(path.join(cwd, 'spec.md'), 'v1');
    expect((await asPerson(() => run('review', 'record', 'f', 's', '--artifact', 'spec.md'))).code).toBe(1);
    expect((await asPerson(() => run('review', 'record', 'f', 's', '--by', 'Ana', '--artifact', 'spec.md'))).code).toBe(0);
    expect((await run('review', 'freeze-check', 'spec.md')).code).toBe(0);
    writeFileSync(path.join(cwd, 'spec.md'), 'v2');
    expect((await run('review', 'freeze-check', 'spec.md')).out).toContain('FROZEN');
  });

  it('waves referee refuses a merge when a protected file changed', async () => {
    writeFileSync(path.join(cwd, 'oracle.test.ts'), 'a');
    expect((await run('waves', 'f', '--baseline', '1', '--protect', 'oracle.test.ts')).code).toBe(0);
    expect((await run('waves', 'f', '--verify', '1', '--check', 'true')).code).toBe(0);
    writeFileSync(path.join(cwd, 'oracle.test.ts'), 'b');
    const r = await run('waves', 'f', '--verify', '1', '--check', 'true');
    expect(r.code).toBe(1);
    expect(r.out).toContain('TAMPERED');
  });
});
