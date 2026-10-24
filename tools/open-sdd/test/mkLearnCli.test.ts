/**
 * Modernize Kit · learning, rule adoption, status projections, CLI surface and the assistant skill
 * (REQ-MK-009, REQ-MK-010).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { startRun, report, readState } from '../src/core/engine.js';
import { applyEvent, resolveEvent, loadRules } from '../src/core/dynamicRules.js';
import { learnFromEvent, adoptCandidate, listCandidates, eventMetrics } from '../src/core/modernize/learn.js';
import { buildStatus, statusMermaid, statusHtml, statusText } from '../src/core/modernize/report.js';
import { approverAllowed } from '../src/core/hilIdentity.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const ev = (id: string, components = ['notifications']) => ({ id, type: 'security-advisory', at: new Date(Date.now() - 60_000).toISOString(), source: 'scanner', title: 't', components, env: 'prod', cvss: 9.1, evidence: ['https://nvd.example/x'] });
const closeLane = async (id: string) => {
  for (const s of (await readState(cwd, 'bank'))!.steps.filter((x) => x.phase === `event:${id}`)) await report(cwd, 'bank', s.id, 'skipped', { reason: 'test', by: 'Ana' });
  await resolveEvent(cwd, 'bank', id);
};

beforeEach(async () => {
  cwd = mkdtempSync(path.join(tmpdir(), 'mk-lc-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Ana'], { cwd });
  spawnSync('git', ['config', 'user.email', 'ana@bank.test'], { cwd });
  mkdirSync(path.join(cwd, '.sdd', 'modernize'), { recursive: true });
  copyFileSync(path.join(process.cwd(), 'templates/modernize/portfolio.banking.json'), path.join(cwd, '.sdd/modernize/portfolio.json'));
  await startRun(cwd, 'bank', 'bug', {}, { level: 'L6', ceremony: 'strict' });
});

describe('AC-09 learning', () => {
  it('learn refuses an unresolved event', async () => {
    await applyEvent(cwd, 'bank', ev('E1'));
    expect((await learnFromEvent(cwd, 'bank', 'E1')).ok).toBe(false);
  });
  it('metrics count steps, cost, cards and the deadline', async () => {
    await applyEvent(cwd, 'bank', ev('E1'));
    await closeLane('E1');
    const m = (await eventMetrics(cwd, 'bank', 'E1'))!;
    expect(m.steps).toBeGreaterThan(2);
    expect(m.cost).toBeGreaterThan(m.steps - 1);
    expect(m.cards).toBe(1);
    expect(m.withinDeadline).toBe(true);
  });
  it('one resolved event → no verdict on its row (confounded); two → a verdict', async () => {
    await applyEvent(cwd, 'bank', ev('E1'));
    await closeLane('E1');
    expect((await learnFromEvent(cwd, 'bank', 'E1')).reflection!.rows[0].verdict).toBeUndefined();
    await applyEvent(cwd, 'bank', ev('E2', ['branch-intranet']));
    await closeLane('E2');
    expect((await learnFromEvent(cwd, 'bank', 'E2')).reflection!.rows[0].verdict).toBe('helped');
  });
  it('an exposure assessment produces the SBOM rule candidate, seen across events', async () => {
    await applyEvent(cwd, 'bank', ev('E1'));
    await closeLane('E1');
    await learnFromEvent(cwd, 'bank', 'E1');
    await applyEvent(cwd, 'bank', ev('E2', ['branch-intranet']));
    await closeLane('E2');
    await learnFromEvent(cwd, 'bank', 'E2');
    const [c] = await listCandidates(cwd);
    expect(c.id).toBe('LEARNED-SBOM-AT-WAVE-START');
    expect(c.seen).toEqual(['E1', 'E2']);
  });
  it('adopting appends a valid rule with provenance, once', async () => {
    await applyEvent(cwd, 'bank', ev('E1'));
    await closeLane('E1');
    await learnFromEvent(cwd, 'bank', 'E1');
    expect((await adoptCandidate(cwd, 'LEARNED-SBOM-AT-WAVE-START', { name: 'Ana', email: 'ana@bank.test' })).ok).toBe(true);
    expect((await adoptCandidate(cwd, 'LEARNED-SBOM-AT-WAVE-START', { name: 'Ana', email: 'ana@bank.test' })).ok).toBe(false);
    const { rules, errors } = await loadRules(cwd);
    expect(errors).toEqual([]);
    expect(rules.find((r) => r.id === 'LEARNED-SBOM-AT-WAVE-START')?.provenance?.adoptedBy).toBe('Ana');
  });
});

describe('approver identity', () => {
  const list = [{ name: 'Ana', email: 'ana@bank.test' }, { name: 'CAB', email: 'cab@bank.test' }];
  it.each([
    ['listed name, same git email', 'Ana', 'ana@bank.test', true],
    ['listed email as --by', 'ana@bank.test', 'ana@bank.test', true],
    ['unlisted name', 'Mallory', 'ana@bank.test', false],
    ['listed name from another git identity', 'CAB', 'ana@bank.test', false],
    ['listed name, no git email known', 'CAB', '', true],
  ])('%s → %s', (_n, by, email, ok) => expect(approverAllowed(list, by as string, { name: '', email: email as string })).toBe(ok));
  it('no list means no restriction (standard ceremony)', () => expect(approverAllowed(null, 'anyone', { name: '', email: '' })).toBe(true));
});

describe('AC-10 status projections', () => {
  it('text, Mermaid and HTML show dispositions, freezes and events', async () => {
    await run('modernize', 'assess');
    await run('modernize', 'waves');
    await applyEvent(cwd, 'bank', ev('E1'));
    const s = await buildStatus(cwd);
    expect(s.rows).toHaveLength(12);
    expect(statusText(s).join('\n')).toContain('FROZEN(E1)');
    expect(statusMermaid(s)).toContain(':::frozen');
    const html = statusHtml(s);
    expect(html).toContain('<td>E1</td>');
    expect(html).not.toMatch(/<script|https?:\/\/(?!nvd)/i);
  });
  it('status without a portfolio fails with the next step', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'mk-empty-'));
    const logs: string[] = [];
    const code = await runCli(['modernize', 'status', '--no-footer'], runtime, { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} }, {}, { cwd: empty });
    expect(code).toBe(1);
    expect(logs.join()).toContain('migrate init');
  });
});

describe('CLI surface', () => {
  it('help exists for start and modernize, and unknown subcommands are usage errors', async () => {
    expect((await run('help', 'modernize')).out).toContain('Command: steelforge migrate');
    expect((await run('help', 'start')).out).toContain('Command: steelforge start');
    expect((await run('modernize', 'teleport')).code).toBe(2);
  });
  it('init refuses to overwrite without --force', async () => {
    expect((await run('modernize', 'init')).code).toBe(1);
    expect((await run('modernize', 'init', '--force')).code).toBe(0);
  });
  it('plan needs waves; wave n needs n-1', async () => {
    expect((await run('modernize', 'plan', 'other')).code).toBe(2);
    await run('modernize', 'waves');
    expect((await run('modernize', 'plan', 'other')).code).toBe(0);
    expect((await run('modernize', 'wave', 'other', '2')).code).toBe(1);
  });
  it('event with an invalid file is refused with the reasons', async () => {
    writeFileSync(path.join(cwd, 'bad.json'), JSON.stringify({ id: 'x', type: 'security-advisory', source: 'agent' }));
    const r = await run('modernize', 'event', 'bank', '--file', path.join(cwd, 'bad.json'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('agent cannot raise');
  });
});

describe('AC-10 the assistant skill ships everywhere', () => {
  it('sdd-modernize is in every skills tree and identical to _shared', () => {
    const root = path.join(process.cwd(), 'templates/agents');
    const shared = readFileSync(path.join(root, '_shared/skills/sdd-modernize/SKILL.md'), 'utf8');
    for (const d of readdirSync(root).filter((x) => existsSync(path.join(root, x, 'skills')))) expect(readFileSync(path.join(root, d, 'skills/sdd-modernize/SKILL.md'), 'utf8'), d).toBe(shared);
    expect(shared).toContain('never decide');
  });
  it('the modernize and tiny playbooks pass the checker', async () => {
    expect((await run('playbook', 'check', 'modernize')).code).toBe(0);
    expect((await run('playbook', 'check', 'tiny')).code).toBe(0);
  });
});
