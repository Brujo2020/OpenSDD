/** Spec trust-floor (sprint 1 of docs/REVISION-EXPERTO.md): AC-01…AC-05. */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { appendAudit, auditFile, verifyAuditChain } from '../src/core/engine.js';
import { listCards, prepareCard, recordAnswer } from '../src/core/hilCards.js';
import { recordReview } from '../src/core/reviewReceipts.js';
import { asPerson } from './support/asPerson.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const runIn = async (env: Record<string, string>, ...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], { ...runtime, env }, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
// The runtime env is the contract: the host's own CI variable must not leak into these tests.
const run = (...argv: string[]) => runIn({}, ...argv);
const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const profile = (p: 'solo' | 'team') => {
  mkdirSync(path.join(cwd, '.sdd', 'settings'), { recursive: true });
  writeFileSync(path.join(cwd, '.sdd', 'settings', 'governance.json'), JSON.stringify({ profile: p }));
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'tf-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  git('init', '-q');
  git('config', 'user.name', 'Ana Rojas');
  git('config', 'user.email', 'ana@bank.test');
});

describe('trust-floor', () => {
  it('AC-01 setup writes the approvers with the git identity; team refuses an approval without a list', async () => {
    expect((await run('setup', '--write', '--no-input')).code).toBe(0);
    const approvers = JSON.parse(readFileSync(path.join(cwd, '.sdd', 'settings', 'approvers.json'), 'utf8'));
    expect(approvers).toEqual({ approvers: [{ name: 'Ana Rojas', email: 'ana@bank.test' }] });

    const other = mkdtempSync(path.join(tmpdir(), 'tf-team-'));
    cwd = other;
    writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
    profile('team');
    const c = (await prepareCard(cwd, {
      feature: 'f', step: 's', trigger: 'phase-gate', question: 'Ship it?',
      options: [{ key: 'A', label: 'Approve', consequence: 'done', effect: 'approve' }, { key: 'B', label: 'Park', consequence: 'stops', effect: 'park' }],
      recommend: 'A', default: 'B', evidence: ['kept -> change -> 2 of 2 runs'], deadlineHours: 24,
    })).card!;
    expect((await asPerson(() => run('decide', 'f', c.id, 'A', '--by', 'Ana'))).out).toContain('APPROVERS_REQUIRED');
  });

  it('AC-02 an edited audit line breaks the chain and fails the gate run', async () => {
    await appendAudit(cwd, 'f', { event: 'RUN_STARTED' });
    await appendAudit(cwd, 'f', { event: 'GATE_APPROVED', step: 's', by: 'Ana' });
    await appendAudit(cwd, 'f', { event: 'STEP_COMPLETED', step: 's' });
    const file = auditFile(cwd, 'f');
    expect(verifyAuditChain(readFileSync(file, 'utf8')).ok).toBe(true);
    writeFileSync(file, readFileSync(file, 'utf8').replace('"by":"Ana"', '"by":"Mallory"'));
    expect(verifyAuditChain(readFileSync(file, 'utf8'))).toEqual({ ok: false, brokenAt: 3 });
    const r = await run('gates', 'run');
    expect(r.code).toBe(1);
    expect(r.out).toContain('AUDIT_CHAIN_BROKEN: .sdd/engine/f.audit.jsonl line 3');
    // Removing the chain from a later line is detected too.
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    delete lines[2].prev;
    expect(verifyAuditChain(lines.map((l) => JSON.stringify(l)).join('\n')).ok).toBe(false);
  });

  it('AC-03 setup installs the PR gate for team and only offers it for solo', async () => {
    const workflow = path.join(cwd, '.github', 'workflows', 'open-sdd-gates.yml');
    const solo = await run('setup', '--write', '--no-input');
    expect(existsSync(workflow)).toBe(false);
    expect(solo.out).toContain('open-sdd floor install . --ci');
    profile('team');
    await run('setup', '--write', '--no-input');
    expect(existsSync(workflow)).toBe(true);
  });

  it('AC-04 in team, a missing C5 sensor needs an independent review receipt', async () => {
    profile('team');
    const without = await run('gates', 'run', 'C5');
    expect(without.code).toBe(1);
    expect(without.out).toContain('REVIEW_REQUIRED');
    writeFileSync(path.join(cwd, 'spec.md'), 'v1');
    expect((await recordReview(cwd, { feature: 'governance', step: 's', reviewer: 'Ana', artifacts: ['spec.md'], roots: [] })).ok).toBe(true);
    expect((await run('gates', 'run', 'C5')).out).not.toContain('REVIEW_REQUIRED');
    profile('solo');
    expect((await run('gates', 'run', 'C5')).out).not.toContain('REVIEW_REQUIRED');
  });

  it('AC-05 a stuck check escalates, stays stopped until a person retries', async () => {
    const first = await run('check');
    expect(first.code).toBe(1);
    expect(first.out).toContain('failed iteration 1/3');
    const second = await run('check');
    expect(second.out).toContain('Escalado a una persona');
    const [card] = await listCards(cwd, '_check');
    expect(second.out).toContain(`open-sdd decide _check ${card.card.id} <A|B|C>`);

    const blocked = await run('check');
    expect(blocked.code).toBe(1);
    expect(blocked.out).toContain('Esperando a una persona');
    // The agent may stop itself (park) but that keeps check stopped; it cannot retry.
    expect((await recordAnswer(cwd, '_check', card.card.id, 'A', 'bot', { agent: true })).ok).toBe(false);
    expect((await recordAnswer(cwd, '_check', card.card.id, 'A', 'Ana')).ok).toBe(true);
    const again = await run('check');
    expect(again.out).not.toContain('Esperando a una persona');
    expect(again.out).toContain('failed iteration 1/3');
 
    // CI has nobody to answer: check neither blocks nor escalates there.
    for (let i = 0; i < 3; i += 1) expect((await runIn({ CI: 'true' }, 'check')).out).not.toMatch(/Escalado|Esperando/);
  });

  it('AC-05b a parked _check is never a dead end: a fresh card lets a person decide', async () => {
    await run('check');
    await run('check');
    const [card] = await listCards(cwd, '_check');
    expect((await recordAnswer(cwd, '_check', card.card.id, 'B', 'bot', { agent: true })).ok).toBe(true);
    const parked = await run('check');
    expect(parked.out).toContain('Esperando a una persona');
    const cards = await listCards(cwd, '_check');
    expect(cards.length).toBe(2);
    expect(cards[1].answer).toBeNull();
  });
});
