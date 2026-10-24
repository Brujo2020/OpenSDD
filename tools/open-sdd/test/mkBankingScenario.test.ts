/**
 * AC-11 · The real test: a retail-bank modernization. Wave 3 is live in parallel run when a critical,
 * actively exploited CVE lands that nobody planned for. Deterministic rules reshape the workflow, agent
 * proposals are filtered, named people approve under strict ceremony, the event is resolved, the system
 * learns (one event = hypothesis), a person adopts the learned rule, and the next advisory costs less.
 *
 * The `it` blocks run in order and share one repository: each is one moment of the story.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { asPerson } from './support/asPerson.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { nextDirective, readState, report, readAudit } from '../src/core/engine.js';
import { writePack, checkRecall, readPack, recordRecall } from '../src/core/handoff.js';
import { readEventRecord } from '../src/core/dynamicRules.js';
import { readModState } from '../src/core/modernize/lifecycle.js';
import { listCards } from '../src/core/hilCards.js';
import { eventMetrics } from '../src/core/modernize/learn.js';
import { promote, listCandidates as memCandidates } from '../src/core/memoryStore.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const F = 'bank-mod';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const write = (rel: string, data: unknown) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return path.join(cwd, rel);
};
/** The agent does one step the way the contract asks: pack, recall, started, completed/awaiting. */
const doStep = async (id: string): Promise<string> => {
  const st = (await readState(cwd, F))!.steps.find((s) => s.id === id)!;
  if (!(await readPack(cwd, F, id))) await writePack(cwd, { feature: F, step: id, use: st.use, consumes: [], goal: `${id}: ${st.use}`, budget: 12000 });
  await recordRecall(cwd, F, id, checkRecall((await readPack(cwd, F, id))!, `${id}`));
  await report(cwd, F, id, 'started', { by: 'agent', tokens: 800, model: 'claude-opus-5-5' });
  const r = await report(cwd, F, id, st.review === 'human' ? 'awaiting-approval' : 'completed', { by: 'agent', tokens: 1200, model: 'claude-opus-5-5' });
  return r.message;
};
const laneSteps = async (event: string) => (await readState(cwd, F))!.steps.filter((s) => s.phase === `event:${event}`);
const cve1 = { id: 'CVE-2026-4242', type: 'security-advisory', at: new Date(Date.now() - 3600_000).toISOString(), source: 'scanner', title: 'RCE in logging library (log4shell-like)', components: ['auth-service', 'card-processing'], env: 'prod', cvss: 10, exploited: true, evidence: ['https://nvd.nist.gov/vuln/detail/CVE-2026-4242', 'scanner run found lib 2.14 in both'] };

beforeAll(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'mk-bank-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"bank"}');
  spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Ana Rojas'], { cwd });
  spawnSync('git', ['config', 'user.email', 'ana.rojas@bank.test'], { cwd });
  write('.sdd/settings/approvers.json', { approvers: [{ name: 'Ana Rojas', email: 'ana.rojas@bank.test' }, { name: 'CAB', email: 'cab@bank.test' }] });
});

describe('AC-11 banking modernization with an unplanned critical CVE', () => {
  it('1 · the intent is classified L6 and points to the portfolio', async () => {
    const r = await run('start', 'modernize the retail bank core banking platform', '--json');
    expect(JSON.parse(r.out)).toMatchObject({ level: 'L6', playbook: 'modernize', ceremony: 'strict' });
  });

  it('2 · assess: 7 Rs per component with reasons', async () => {
    expect((await run('modernize', 'init', '--example', 'banking')).code).toBe(0);
    const r = await run('modernize', 'assess', '--json');
    const ds = JSON.parse(r.out).dispositions as { id: string; r: string; rule: string }[];
    expect(ds.find((d) => d.id === 'core-banking')).toMatchObject({ r: 'refactor', rule: 'D-MAINFRAME-REFACTOR' });
    expect(ds.every((d) => d.rule)).toBe(true);
  });

  it('3 · a person overrides one disposition, recorded with the table value', async () => {
    expect((await run('modernize', 'override', 'reporting-batch', 'retain')).code).toBe(2);
    expect((await run('modernize', 'override', 'reporting-batch', 'retain', '--by', 'Ana Rojas', '--reason', 'regulator audit in Q1')).code).toBe(0);
    expect((await run('modernize', 'assess')).out).toContain('OVERRIDE');
  });

  it('4 · waves: retire first, pilot, dependency order; the run starts with strict ceremony', async () => {
    const w = JSON.parse((await run('modernize', 'waves', '--json')).out);
    expect(w.waves.slice(0, 2).map((x: { kind: string }) => x.kind)).toEqual(['retire', 'pilot']);
    expect((await run('modernize', 'plan', F)).code).toBe(0);
    const s = await readState(cwd, F);
    expect(s).toMatchObject({ level: 'L6', ceremony: 'strict' });
    expect(s?.waves?.length).toBe(w.waves.length);
  });

  it('5 · waves start in order and rules expand each component', async () => {
    expect((await run('modernize', 'wave', F, '2')).code).toBe(1);
    for (const n of ['1', '2', '3']) expect((await run('modernize', 'wave', F, n)).code).toBe(0);
    const ids = (await readState(cwd, F))!.steps.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['decommission@legacy-fax', 'rehost@notifications', 'facade@auth-service'.replace('facade', 'replatform'), 'parallel-run@ledger-db']));
  });

  it('6 · auth-service goes live in parallel run (legacy and new both serve traffic)', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) expect((await run('modernize', 'advance', 'auth-service', '--to', to, '--by', 'Ana Rojas')).code).toBe(0);
    expect((await readModState(cwd)).components['auth-service'].stage).toBe('parallel-run');
  });

  it('7 · go-live day: an exploited CVSS 10 advisory reshapes the run deterministically', async () => {
    const r = await run('modernize', 'event', F, '--file', write('cve1.json', cve1), '--json');
    const res = JSON.parse(r.out);
    expect(res.code).toBe('APPLIED');
    expect(res.decision.severity).toBe('critical');
    expect(res.decision.deadlineHours).toBe(24);
    expect(res.frozen.sort()).toEqual(['auth-service', 'card-processing']);
    expect(res.inserted).toEqual(expect.arrayContaining(['patch@auth-service:legacy', 'patch@auth-service:modern', 'patch@card-processing', 'security-gate@card-processing']));
    // Most critical component first, and inside each lane: understand → approve → change → verify.
    expect(res.inserted.slice(0, 5)).toEqual(['exposure@card-processing', 'emergency-change@card-processing', 'patch@card-processing', 'regression@card-processing', 'security-gate@card-processing']);
    expect(res.cards).toHaveLength(2);
  });

  it('8 · the urgent lane jumps the queue and the same advisory again is a no-op', async () => {
    const d = await nextDirective(cwd, F);
    expect('step' in d && d.step).toBe('exposure@card-processing');
    expect(JSON.parse((await run('modernize', 'event', F, '--file', path.join(cwd, 'cve1.json'), '--json')).out).code).toBe('ALREADY_APPLIED');
  });

  it('9 · frozen: nobody can push auth-service to canary while the advisory is open', async () => {
    write('metrics.json', { sampleSize: 5000, errorRate: 0.001, errorBudget: 0.005, mismatchRate: 0.0002, p95Ms: 210, baselineP95Ms: 200 });
    const r = await run('modernize', 'advance', 'auth-service', '--to', 'canary-25', '--metrics', path.join(cwd, 'metrics.json'), '--by', 'Ana Rojas');
    expect(r.code).toBe(1);
    expect(r.out).toContain('FROZEN');
  });

  it('10 · agent proposals: "not affected" and a hallucinated component are rejected; a sourced claim is admitted', async () => {
    const p = (claims: object, evidence: string[]) => write(`p-${Object.keys(claims)[0]}.json`, { event: cve1.id, author: 'claude-opus-5-5', claims, evidence });
    expect((await run('modernize', 'propose', F, '--file', p({ notAffected: ['card-processing'] }, ['card build excludes the module']))).out).toContain('NOT_A_PERSON_DECISION');
    expect((await run('modernize', 'propose', F, '--file', p({ components: ['swift-gateway'] }, ['swift gateway uses the same library']))).out).toContain('UNKNOWN_COMPONENT');
    const ok = await run('modernize', 'propose', F, '--file', write('p-crm.json', { event: cve1.id, author: 'claude-opus-5-5', claims: { components: ['crm'] }, evidence: ['crm 7.2 bundles lib 2.14 per vendor bulletin VB-2026-17'] }));
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('emergency-change@crm');
    const rec = await readEventRecord(cwd, F, cve1.id);
    expect(rec?.proposals.map((x) => x.status)).toEqual(['rejected', 'rejected', 'admitted']);
  });

  it('11 · the CAB card cannot be approved by the agent alone; a listed person confirms it', async () => {
    const card = (await listCards(cwd, F)).find((c) => c.card.step === 'emergency-change@card-processing')!.card;
    expect(card.trigger).toBe('emergency-change');
    expect(card.default).toBe('C');
    expect(card.deadlineHours).toBe(24);
    expect((await run('hil', 'review', F, '--html')).code).toBe(0);
    expect(readFileSync(path.join(cwd, '.sdd/hil', F, 'review.html'), 'utf8')).toContain('Approve the emergency change');
    expect((await run('hil', 'answer', F, card.id, 'A', '--by', 'Ana Rojas')).out).toContain('AGENT_SESSION');
    expect((await asPerson(() => run('hil', 'answer', F, card.id, 'A', '--by', 'Mallory'))).out).toContain('APPROVER_NOT_LISTED');
    // Typing a listed name from someone else's git identity is refused too.
    expect((await asPerson(() => run('hil', 'answer', F, card.id, 'A', '--by', 'CAB'))).out).toContain('APPROVER_NOT_LISTED');
    // `--confirm <id>` is text the agent can read and type: from an agent session it proves nothing.
    expect((await run('hil', 'answer', F, card.id, 'A', '--by', 'Ana Rojas', '--confirm', card.id)).out).toContain('AGENT_SESSION');
    expect((await asPerson(() => run('hil', 'answer', F, card.id, 'A', '--by', 'Ana Rojas'))).code).toBe(0);
  });

  it('12 · the agent works the lane; approvals given early complete the gates; the rest wait for people', async () => {
    for (const s of await laneSteps(cve1.id)) {
      if (s.status === 'done') continue;
      await doStep(s.id);
    }
    const open = (await laneSteps(cve1.id)).filter((s) => s.status !== 'done');
    expect(open.map((s) => s.id).sort()).toEqual(['emergency-change@auth-service', 'emergency-change@crm']);
    for (const c of (await listCards(cwd, F)).filter((x) => !x.answer && x.card.step.startsWith('emergency-change@'))) await asPerson(() => run('hil', 'answer', F, c.card.id, 'A', '--by', 'Ana Rojas'));
    expect((await laneSteps(cve1.id)).every((s) => s.status === 'done')).toBe(true);
  });

  it('13 · resolve unfreezes; the canary move now goes through on metrics', async () => {
    const r = await run('modernize', 'resolve', F, '--event', cve1.id);
    expect(r.code).toBe(0);
    expect((await readModState(cwd)).components['auth-service'].frozen).toEqual([]);
    expect((await run('modernize', 'advance', 'auth-service', '--to', 'canary-25', '--metrics', path.join(cwd, 'metrics.json'), '--by', 'Ana Rojas')).code).toBe(0);
  });

  it('14 · cut-over of auth-service (criticality 4) needs its own approval', async () => {
    const a = await run('modernize', 'advance', 'auth-service', '--to', 'cut-over', '--metrics', path.join(cwd, 'metrics.json'), '--by', 'Ana Rojas', '--json');
    const card = JSON.parse(a.out).card as string;
    expect(JSON.parse(a.out).code).toBe('AWAITING_APPROVAL');
    await asPerson(() => run('hil', 'answer', F, card, 'A', '--by', 'Ana Rojas'));
    expect((await run('modernize', 'advance', 'auth-service', '--to', 'cut-over', '--metrics', path.join(cwd, 'metrics.json'), '--by', 'Ana Rojas')).code).toBe(0);
  });

  it('15 · learn: one event is a hypothesis (quarantined) plus a rule candidate', async () => {
    const r = await run('modernize', 'learn', F, '--event', cve1.id, '--reflect', '--json');
    const j = JSON.parse(r.out);
    expect(j.memory.outcome).toBe('quarantined');
    expect(j.memory.issues.map((i: { code: string }) => i.code)).toContain('ONLY_CONFOUNDED');
    expect(j.candidate.id).toBe('LEARNED-SBOM-AT-WAVE-START');
    expect(j.metrics.proposals).toEqual({ admitted: 1, rejected: 2 });
    expect(j.metrics.withinDeadline).toBe(true);
  });

  it('16 · only a listed, confirmed person adopts the learned rule', async () => {
    expect((await run('modernize', 'rules', 'adopt', 'LEARNED-SBOM-AT-WAVE-START')).code).toBe(1);
    expect((await run('modernize', 'rules', 'adopt', 'LEARNED-SBOM-AT-WAVE-START', '--by', 'Ana Rojas')).out).toContain('AGENT_SESSION');
    expect((await run('modernize', 'rules', 'adopt', 'LEARNED-SBOM-AT-WAVE-START', '--by', 'Ana Rojas', '--confirm', 'LEARNED-SBOM-AT-WAVE-START')).out).toContain('AGENT_SESSION');
    expect((await asPerson(() => run('modernize', 'rules', 'adopt', 'LEARNED-SBOM-AT-WAVE-START', '--by', 'Ana Rojas'))).code).toBe(0);
    expect((await run('modernize', 'rules', 'list')).out).toContain('LEARNED-SBOM-AT-WAVE-START');
  });

  it('17 · the next wave applies the learned rule: dependency scans first', async () => {
    const r = JSON.parse((await run('modernize', 'wave', F, '4', '--json')).out);
    expect(r.inserted[0]).toMatch(/^dependency-scan@/);
    expect(r.inserted).toEqual(expect.arrayContaining(['dependency-scan@crm', 'dependency-scan@core-banking']));
    // The scanner (outside open-sdd) writes the SBOMs.
    write('.sdd/modernize/sbom/core-banking.json', { component: 'core-banking', packages: 412 });
    write('.sdd/modernize/sbom/crm.json', { component: 'crm', packages: 233 });
  });

  it('18 · weeks later a second advisory: lookup instead of assessment, lower cost, no freeze', async () => {
    const r = JSON.parse((await run('modernize', 'event', F, '--file', write('cve2.json', { id: 'CVE-2026-5151', type: 'security-advisory', at: new Date(Date.now() - 600_000).toISOString(), source: 'scanner', title: 'deserialization flaw in XML lib', components: ['core-banking'], env: 'prod', cvss: 7.5, evidence: ['https://nvd.nist.gov/vuln/detail/CVE-2026-5151'] }), '--json')).out);
    expect(r.inserted).toContain('sbom-lookup@core-banking');
    expect(r.inserted).not.toContain('exposure@core-banking');
    expect(r.frozen).toEqual([]);
    expect(r.decision.deadlineHours).toBe(72);
    for (const s of await laneSteps('CVE-2026-5151')) await doStep(s.id);
    expect((await run('modernize', 'resolve', F, '--event', 'CVE-2026-5151')).code).toBe(0);
    const m1 = (await eventMetrics(cwd, F, cve1.id))!;
    const m2 = (await eventMetrics(cwd, F, 'CVE-2026-5151'))!;
    expect(m2.cost / 1).toBeLessThan(m1.cost / 3);
  });

  it('19 · the second event is evidence: the reflection is admitted and a person promotes it', async () => {
    const j = JSON.parse((await run('modernize', 'learn', F, '--event', 'CVE-2026-5151', '--reflect', '--json')).out);
    expect(j.memory.outcome).toBe('candidate');
    expect((await memCandidates(cwd)).map((c) => c.id)).toContain(j.memory.id);
    expect((await promote(cwd, j.memory.id, 'Ana Rojas')).ok).toBe(true);
  });

  it('20 · everything is visible and auditable', async () => {
    const s = JSON.parse((await run('modernize', 'status', '--json')).out);
    expect(s.events.filter((e: { type: string; status: string }) => e.type === 'security-advisory').map((e: { status: string }) => e.status)).toEqual(['resolved', 'resolved']);
    expect((await run('modernize', 'status', '--mermaid')).out.startsWith('flowchart LR')).toBe(true);
    await run('modernize', 'status', '--html');
    const html = readFileSync(path.join(cwd, '.sdd/modernize/status.html'), 'utf8');
    expect(html).toContain('retail-bank');
    expect(html).not.toMatch(/<script/i);
    const audit = (await readAudit(cwd, F)).map((e) => e.event);
    for (const ev of ['EVENT_APPLIED', 'EVENT_REVISED', 'EVENT_RESOLVED', 'GATE_APPROVED', 'STEPS_INSERTED']) expect(audit).toContain(ev);
    expect(existsSync(path.join(cwd, '.sdd/settings/dynamic-rules.json'))).toBe(true);
  });
});
