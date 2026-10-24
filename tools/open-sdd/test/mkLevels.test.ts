/**
 * Modernize Kit · level ladder (REQ-MK-001, REQ-MK-002): tiny → PoC → feature → project → medium →
 * large → modernization, decided without a model, with metamorphic invariants (risk/scale never lower it).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { asPerson } from './support/asPerson.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { classifyLevel, ceremonyFor, rank, slugFromIntent, playbookFor, LEVELS } from '../src/core/levels.js';
import { readState } from '../src/core/engine.js';
import { prepareCard } from '../src/core/hilCards.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'mk-lv-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['config', 'user.email', 'ana@bank.test'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Ana'], { cwd });
});

const CASES: [string, string][] = [
  ['fix typo in README', 'L0'],
  ['rename variable userId to customerId', 'L0'],
  ['bump version to 2.3.1', 'L0'],
  ['update the docs for the CLI flags', 'L0'],
  ['format code with prettier', 'L0'],
  ['fix spelling in error messages', 'L0'],
  ['fix typo in the login page', 'L2'],
  ['rename the payments table column', 'L2'],
  ['bump the auth library version', 'L2'],
  ['prototype voice search', 'L1'],
  ['spike on GraphQL federation', 'L1'],
  ['proof of concept for OCR of invoices', 'L1'],
  ['hackathon demo of a chatbot', 'L1'],
  ['PoC of mainframe modernization', 'L1'],
  ['prototype with 3 microservices', 'L1'],
  ['PoC with customer personal data', 'L2'],
  ['prototype using real PII from production', 'L2'],
  ['add CSV export to reports', 'L2'],
  ['fix the crash when saving a draft', 'L2'],
  ['refactor the order module', 'L2'],
  ['add refunds to payments', 'L2'],
  ['build a new app for field technicians', 'L3'],
  ['new service for document signing from scratch', 'L3'],
  ['platform with onboarding, billing and notifications', 'L4'],
  ['roadmap release with search, filters, export and sharing', 'L4'],
  ['split billing into 3 microservices', 'L5'],
  ['migrate checkout across api and web repos', 'L5'],
  ['coordinate changes in four services', 'L5'],
  ['modernize the core banking mainframe', 'L6'],
  ['migrate the portfolio to AWS', 'L6'],
  ['monolith to microservices for the insurance core', 'L6'],
  ['strangler migration of the COBOL ledger', 'L6'],
];

describe('AC-01 classification table', () => {
  it.each(CASES)('«%s» → %s', (intent, level) => {
    const d = classifyLevel(intent);
    expect(d.level).toBe(level);
    expect(d.evidence.length).toBeGreaterThan(0);
  });
});

describe('AC-01 metamorphic invariants', () => {
  const RISKS = [' touching payments', ' with login changes', ' on personal data', ' during a database migration'];
  const SCALE = [' across api and web repos', ' in 3 services'];
  it.each(CASES.map(([i]) => i))('adding a risk word never lowers «%s»', (intent) => {
    for (const r of RISKS) expect(rank(classifyLevel(intent + r).level)).toBeGreaterThanOrEqual(rank(classifyLevel(intent).level));
  });
  it.each(CASES.map(([i]) => i).slice(0, 12))('adding a scale phrase never lowers «%s»', (intent) => {
    for (const s of SCALE) expect(rank(classifyLevel(intent + s).level)).toBeGreaterThanOrEqual(rank(classifyLevel(intent).level));
  });
  it('is deterministic', () => {
    for (const [i] of CASES) expect(classifyLevel(i)).toEqual(classifyLevel(i));
  });
  it('a PoC that touches payments keeps L1 but warns to use synthetic data', () => {
    const d = classifyLevel('prototype a payments widget');
    expect(d.level).toBe('L1');
    expect(d.warnings.join()).toMatch(/synthetic data/);
  });
  it('ceremony follows the level', () => {
    expect(LEVELS.map(ceremonyFor)).toEqual(['minimal', 'minimal', 'standard', 'standard', 'standard', 'strict', 'strict']);
  });
  it('playbook per level', () => {
    expect(playbookFor('L0', 'x')).toBe('tiny');
    expect(playbookFor('L1', 'prototype then turn into a feature if it works')).toBe('poc-to-feature');
    expect(playbookFor('L2', 'fix the crash')).toBe('bug');
    expect(playbookFor('L2', 'refactor x')).toBe('refactor');
    expect(playbookFor('L5', 'x')).toBe('multi-unit-greenfield');
    expect(playbookFor('L5', 'extend the existing x')).toBe('multi-unit');
    expect(playbookFor('L6', 'x')).toBe('modernize');
  });
  it('slug from intent drops stop words and accents', () => {
    expect(slugFromIntent('Modernización del core bancario en AWS')).toBe('modernizacion-del-core-bancario-aws');
    expect(slugFromIntent('fix typo in README')).toBe('fix-typo-readme');
  });
});

describe('AC-02 start: one command, ceremony by level', () => {
  it('tiny reaches done in three commands, without a context pack', async () => {
    const s = await run('start', 'fix typo in README', '--json');
    expect(s.code).toBe(0);
    const j = JSON.parse(s.out);
    expect(j.level).toBe('L0');
    expect(j.directive.kind).toBe('run-step');
    expect(j.directive.pack).toBeNull();
    for (const step of ['sdd-tiny', 'sdd-verify-completion']) {
      expect((await run('report', 'fix-typo-readme', '--step', step, '--result', 'started')).code).toBe(0);
      expect((await run('report', 'fix-typo-readme', '--step', step, '--result', 'completed')).code).toBe(0);
    }
    expect(JSON.parse((await run('next', 'fix-typo-readme', '--json')).out).kind).toBe('done');
  });
  it('dry run writes nothing', async () => {
    const r = await run('start', 'prototype voice search', '--dry-run', '--json');
    expect(JSON.parse(r.out).playbook).toBe('spike');
    expect(await readState(cwd, 'prototype-voice-search')).toBeNull();
  });
  it('a forced level is recorded against the classifier', async () => {
    const r = await run('start', 'fix typo in README', '--level', 'L2', '--feature', 'f', '--json');
    expect(JSON.parse(r.out).level).toBe('L2');
    expect((await readState(cwd, 'f'))?.ceremony).toBe('standard');
    expect((await run('start', 'x', '--level', 'L9')).code).toBe(2);
  });
  it('standard ceremony hands off with a context pack', async () => {
    const j = JSON.parse((await run('start', 'add CSV export to reports', '--json')).out);
    expect(j.ceremony).toBe('standard');
    expect(j.directive.pack).toMatch(/handoff/);
  });
  it('a modernization intent without a portfolio points to migrate init', async () => {
    const r = await run('start', 'modernize the core banking mainframe');
    expect(r.out).toContain('migrate init');
  });
  it('strict ceremony refuses an approval without an approvers list', async () => {
    mkdirSync(path.join(cwd, 'a', '.git'), { recursive: true });
    mkdirSync(path.join(cwd, 'b', '.git'), { recursive: true });
    await run('start', 'split billing into 3 microservices', '--feature', 'big');
    expect((await readState(cwd, 'big'))?.ceremony).toBe('strict');
    const c = (await prepareCard(cwd, { feature: 'big', step: 's', trigger: 't', question: 'Ok?', options: [{ key: 'A', label: 'a', consequence: 'c', effect: 'approve' }, { key: 'B', label: 'b', consequence: 'c', effect: 'park' }], recommend: 'A', default: 'B', evidence: ['kept -> x -> 1 run'], deadlineHours: 24 })).card!;
    const r = await asPerson(() => run('hil', 'answer', 'big', c.id, 'A', '--by', 'Ana'));
    expect(r.out).toContain('APPROVERS_REQUIRED');
    mkdirSync(path.join(cwd, '.sdd', 'settings'), { recursive: true });
    writeFileSync(path.join(cwd, '.sdd', 'settings', 'approvers.json'), JSON.stringify({ approvers: [{ name: 'Ana', email: 'ana@bank.test' }] }));
    expect((await asPerson(() => run('hil', 'answer', 'big', c.id, 'A', '--by', 'Ana'))).code).toBe(0);
  });
  it('a tiny run escalates to L2 when a signal says it touches something risky', async () => {
    await run('start', 'fix typo in README', '--feature', 't');
    writeFileSync(path.join(cwd, 'sig.json'), JSON.stringify({ id: 'sig-1', type: 'signal', at: '2026-10-24T09:00:00Z', source: 'human', title: 'the typo is in the auth error path', components: [], signal: { name: 'touches-auth', risk: true }, evidence: ['review comment #12'] }));
    const r = await run('engine', 'event', 't', '--file', path.join(cwd, 'sig.json'));
    expect(r.code).toBe(0);
    const s = await readState(cwd, 't');
    expect(s?.level).toBe('L2');
    expect(s?.ceremony).toBe('standard');
    expect(s?.steps.map((x) => x.id)).toContain('design-review');
  });
});
