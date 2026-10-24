/** One fixture per acceptance criterion of `.sdd/specs/playbooks-v3-7` (AC-01…AC-10). */
import { describe, it, expect, beforeEach } from 'vitest';
import { asPerson } from './support/asPerson.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { lockFile, readAudit, report, startRun } from '../src/core/engine.js';
import { prepareCard, readAnswer, type DecisionCard } from '../src/core/hilCards.js';
import { readInbox } from '../src/core/memoryStore.js';
import { improvePlaybook } from '../src/core/playbookImprove.js';
import { findPlaybook } from '../src/core/playbook.js';
import { planPlaybook } from '../src/core/playbookPlanner.js';
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
const card = (over: Partial<DecisionCard> = {}): Omit<DecisionCard, 'id' | 'createdAt'> => ({
  feature: 'f',
  step: 's',
  trigger: 'phase-gate',
  question: 'Accept the design?',
  options: [
    { key: 'A', label: 'Approve', consequence: 'step completes', effect: 'approve' },
    { key: 'B', label: 'Park', consequence: 'run stops', effect: 'park' },
  ],
  recommend: 'A',
  default: 'B',
  evidence: ['kept -> design -> 2 of 2 reviews'],
  deadlineHours: 24,
  ...over,
});

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'v37-'));
  w('package.json', '{"name":"x"}');
  spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Ana Test'], { cwd });
  spawnSync('git', ['config', 'user.email', 'ana@example.com'], { cwd });
});

describe('playbooks-v3-7 acceptance', () => {
  it('AC-01 git identity stored; unlisted approver refused; agent approval is refused even with --confirm; a person approves', async () => {
    const c = (await prepareCard(cwd, card())).card!;
    const noConfirm = await run('hil', 'answer', 'f', c.id, 'A', '--by', 'Ana');
    expect(noConfirm.code).toBe(1);
    expect(noConfirm.out).toContain('AGENT_SESSION');
    expect((await run('hil', 'answer', 'f', c.id, 'A', '--by', 'Ana', '--confirm', c.id)).out).toContain('AGENT_SESSION');
    expect((await asPerson(() => run('hil', 'answer', 'f', c.id, 'A', '--by', 'Ana'))).code).toBe(0);
    expect((await readAnswer(cwd, 'f', c.id))?.identity?.email).toBe('ana@example.com');
    w('.sdd/settings/approvers.json', JSON.stringify({ approvers: [{ name: 'Luis', email: 'luis@example.com' }] }));
    const c2 = (await prepareCard(cwd, card())).card!;
    const r = await run('hil', 'answer', 'f', c2.id, 'B', '--by', 'Ana');
    expect(r.code).toBe(1);
    expect(r.out).toContain('APPROVER_NOT_LISTED');
  });

  it('AC-02 overdue card listed, then next applies its default and audits it', async () => {
    await startRun(cwd, 'f', 'bug', await vals());
    const c = (await prepareCard(cwd, card({ step: 'sdd-bugfix', deadlineHours: 0 }))).card!;
    expect((await run('hil', 'list', 'f', '--overdue')).out).toContain(c.id);
    const d = JSON.parse((await run('next', 'f', '--json')).out);
    expect(d.kind).toBe('parked');
    expect((await readAnswer(cwd, 'f', c.id))?.by).toBe('deadline');
    expect((await readAudit(cwd, 'f')).some((e) => e.event === 'DEADLINE_APPLIED')).toBe(true);
  });

  it('AC-03 hil review --html: question, options, answer command, no script', async () => {
    const c = (await prepareCard(cwd, card())).card!;
    expect((await run('hil', 'review', 'f', '--html')).code).toBe(0);
    const html = readFileSync(path.join(cwd, '.sdd/hil/f/review.html'), 'utf8');
    expect(html).toContain('Accept the design?');
    expect(html).toContain('step completes');
    expect(html).toContain(`steelforge hil answer f ${c.id} A`);
    expect(html).not.toMatch(/<script/i);
  });

  it('AC-04 removing a step that caught rejections, or a human step, is dropped', async () => {
    await startRun(cwd, 'f', 'bug', await vals());
    // A run where the human gate (sdd-verify-completion) rejected once.
    w('.sdd/engine/f.audit.jsonl', [
      { at: new Date().toISOString(), event: 'STEP_REJECTED', step: 'sdd-verify-completion' },
      { at: new Date().toISOString(), event: 'GATE_APPROVED', step: 'sdd-verify-completion' },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    const l = { cue: 'skip verify', lesson: 'x', evidence: [0], confidence: 'medium', kind: 'invariant', stepType: '*', origins: ['o'], proposal: { skip: ['sdd-verify-completion'] }, id: 'L-1', rows: [{ component: 'VE', change: 'x', observed: 'y', verdict: 'helped', runs: 3 }], createdAt: '2026-01-01', promotedBy: 'Ana' };
    w('.sdd/memory/lessons/L-1.json', JSON.stringify(l));
    const r = await improvePlaybook(cwd, (await findPlaybook(cwd, 'bug'))!.playbook, await vals(), { k: 3 });
    const probe = r.probes.find((p) => p.candidate.id === 'lesson:L-1')!;
    expect(probe.verdict).toBe('dropped');
    expect(probe.evidence).toContain('removes a human/security control');
    expect(probe.after.unobservedRisk).toBe(1);
    expect(r.decision).toBe('KEEP_BASE');
  });

  it('AC-05 refused report captures gate-block; frozen edit captures human-edit', async () => {
    await startRun(cwd, 'f', 'bug', await vals());
    await report(cwd, 'f', 'sdd-bugfix', 'started');
    expect((await report(cwd, 'f', 'sdd-bugfix', 'completed', { produced: ['missing.ts'] })).ok).toBe(false);
    w('spec.md', 'v1');
    await asPerson(() => run('review', 'record', 'f', 's', '--by', 'Ana', '--artifact', 'spec.md'));
    w('spec.md', 'v2');
    await run('review', 'freeze-check', 'spec.md');
    const kinds = (await readInbox(cwd)).map((i) => i.kind);
    expect(kinds).toContain('gate-block');
    expect(kinds).toContain('human-edit');
  });

  it('AC-06 --tokens appears in engine status --json', async () => {
    await startRun(cwd, 'f', 'bug', await vals());
    await run('report', 'f', '--step', 'sdd-bugfix', '--result', 'started', '--tokens', '1200', '--model', 'claude-opus-5-5');
    const s = JSON.parse((await run('engine', 'status', 'f', '--json')).out);
    expect(s.metrics.find((m: { step: string }) => m.step === 'sdd-bugfix').tokens).toBe(1200);
  });

  it('AC-07 scale → multi-unit; payments → human design gate with reason', async () => {
    const p = await planPlaybook(cwd, 'migrate billing to 3 microservices across api and web repos', await detectProfile(cwd));
    expect(p.type).toBe('multi-unit');
    const s = await planPlaybook(cwd, 'add payments to checkout', await detectProfile(cwd));
    const gate = s.rows.find((r) => r.id === 'risk-review');
    expect(gate?.review).toBe('human');
    expect(gate?.reason).toContain('payments');
  });

  it('AC-08 units fan out into waves; a cycle is refused; a held lock refuses a write', async () => {
    expect((await run('engine', 'start', 'f', '--playbook', 'bug', '--units', 'api,web:api')).code).toBe(0);
    expect(JSON.parse((await run('engine', 'status', 'f', '--json')).out).waves).toEqual([['api'], ['web']]);
    expect((await run('engine', 'start', 'g', '--playbook', 'bug', '--units', 'a:b,b:a')).code).toBe(1);
    writeFileSync(lockFile(cwd, 'f'), 'other');
    await expect(report(cwd, 'f', 'sdd-bugfix', 'started')).rejects.toThrow('LOCK_HELD');
  }, 15_000);

  it('AC-09 human next, engine list, mermaid, auto-handoff', async () => {
    await startRun(cwd, 'f', 'bug', await vals());
    const human = (await run('next', 'f')).out;
    expect(human).not.toContain('{');
    expect(human).toContain('context pack');
    expect((await run('engine', 'list')).out).toContain('f');
    expect((await run('engine', 'status', 'f', '--mermaid')).out.startsWith('flowchart')).toBe(true);
    expect(JSON.parse((await run('next', 'f', '--json', '--auto-handoff')).out).kind).toBe('run-step');
  });

  it('AC-10 schema parses; new passes check; diff lists an added step; recipes pass', async () => {
    JSON.parse(readFileSync(path.join(process.cwd(), 'templates/playbooks/playbook.schema.json'), 'utf8'));
    expect((await run('playbook', 'new', 'mine', '--from', 'bug', '--add', 'fix:opensdd:skill/sdd-review:human')).code).toBe(0);
    expect(existsSync(path.join(cwd, '.sdd/playbooks/mine.playbook.json'))).toBe(true);
    expect((await run('playbook', 'check', 'mine')).code).toBe(0);
    expect((await run('playbook', 'diff', 'bug', 'mine')).out).toContain('+ sdd-review');
    for (const r of ['poc-to-feature', 'brownfield-aidlc-inception']) expect((await run('playbook', 'check', r)).code, r).toBe(0);
  });
});
