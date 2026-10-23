/**
 * Modernize Kit · lifecycle, canary decisions, dynamic rules and agent proposals
 * (REQ-MK-003, REQ-MK-004, REQ-MK-005, REQ-MK-008).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canaryDecision, advance, readModState, DEFAULT_CANARY, STAGES, type CanaryMetrics } from '../src/core/modernize/lifecycle.js';
import { applyEvent, evaluate, loadRules, resolveEvent, severityOf, validateEvent, validateRules, readEventRecord, buildContext, type WorkflowEvent, type Rule } from '../src/core/dynamicRules.js';
import { validateProposal, submitProposal } from '../src/core/modernize/proposals.js';
import { startRun, readState, report, nextDirective } from '../src/core/engine.js';
import { recordAnswer } from '../src/core/hilCards.js';
import { dispositions } from '../src/core/modernize/disposition.js';
import type { Component, Portfolio } from '../src/core/modernize/portfolio.js';

let cwd = '';
const banking = JSON.parse(readFileSync(path.join(process.cwd(), 'templates/modernize/portfolio.banking.json'), 'utf8')) as Portfolio;
const comp = (id: string) => banking.components.find((c) => c.id === id) as Component;
const rOf = (id: string) => dispositions(banking).find((d) => d.id === id)!.r;
const good: CanaryMetrics = { sampleSize: 5000, errorRate: 0.001, errorBudget: 0.005, mismatchRate: 0.0002, p95Ms: 210, baselineP95Ms: 200 };
const cve = (over: Partial<WorkflowEvent> = {}): WorkflowEvent => ({ id: 'CVE-1', type: 'security-advisory', at: '2026-10-24T08:00:00Z', source: 'scanner', title: 'RCE in logging lib', components: ['auth-service'], env: 'prod', cvss: 9.8, evidence: ['https://nvd.example/CVE-1'], ...over });

beforeEach(async () => {
  cwd = mkdtempSync(path.join(tmpdir(), 'mk-lr-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  spawnSync('git', ['init', '-q'], { cwd });
  mkdirSync(path.join(cwd, '.sdd', 'modernize'), { recursive: true });
  copyFileSync(path.join(process.cwd(), 'templates/modernize/portfolio.banking.json'), path.join(cwd, '.sdd/modernize/portfolio.json'));
  await startRun(cwd, 'bank', 'bug', {}, { level: 'L6', ceremony: 'strict' });
});

describe('AC-08 canary decision', () => {
  it.each([
    ['all criteria met', good, 'advance'],
    ['sample too small', { ...good, sampleSize: 10 }, 'hold'],
    ['error rate over budget', { ...good, errorRate: 0.006 }, 'hold'],
    ['error rate over twice the budget', { ...good, errorRate: 0.011 }, 'rollback'],
    ['mismatch over threshold', { ...good, mismatchRate: 0.002 }, 'hold'],
    ['mismatch over ten times the threshold', { ...good, mismatchRate: 0.02 }, 'rollback'],
    ['latency over 1.2 × baseline', { ...good, p95Ms: 260 }, 'hold'],
    ['latency exactly 1.2 × baseline', { ...good, p95Ms: 240 }, 'advance'],
  ] as [string, CanaryMetrics, string][])('%s → %s', (_n, m, d) => expect(canaryDecision(m).decision).toBe(d));
  it('metamorphic: a worse error rate never yields a better decision', () => {
    const order = { advance: 0, hold: 1, rollback: 2 };
    for (let e = 0; e <= 0.02; e += 0.001) expect(order[canaryDecision({ ...good, errorRate: e + 0.001 }).decision]).toBeGreaterThanOrEqual(order[canaryDecision({ ...good, errorRate: e }).decision]);
  });
  it('a stricter policy can only hold more', () => expect(canaryDecision(good, { ...DEFAULT_CANARY, minSample: 10_000 }).decision).toBe('hold'));
});

describe('AC-08 lifecycle', () => {
  it('every disposition has a stage sequence', () => expect(Object.keys(STAGES).sort()).toEqual(['refactor', 'rehost', 'relocate', 'replatform', 'repurchase', 'retain', 'retire']));
  it('moves only to the next stage', async () => {
    const r = await advance(cwd, { component: comp('notifications'), r: 'rehost', to: 'cut-over', by: 'Ana' });
    expect(r.code).toBe('BAD_TRANSITION');
    expect((await advance(cwd, { component: comp('notifications'), r: 'rehost', to: 'migrated', by: 'Ana' })).code).toBe('ADVANCED');
  });
  it('a canary move needs metrics and follows the decision', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) await advance(cwd, { component: comp('auth-service'), r: 'replatform', to, by: 'Ana' });
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana' })).code).toBe('METRICS_REQUIRED');
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana', metrics: { ...good, errorRate: 0.02 } })).code).toBe('CANARY_ROLLBACK');
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana', metrics: { ...good, sampleSize: 1 } })).code).toBe('CANARY_HOLD');
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana', metrics: good })).code).toBe('ADVANCED');
  });
  it('rollback is always possible until decommission', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) await advance(cwd, { component: comp('auth-service'), r: 'replatform', to, by: 'Ana' });
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'characterized', by: 'Ana' })).code).toBe('ROLLED_BACK');
  });
  it('cut-over of a criticality ≥ 4 component waits for an approved card', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) await advance(cwd, { component: comp('auth-service'), r: 'replatform', to, by: 'Ana' });
    await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana', metrics: good });
    const a = await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'cut-over', by: 'Ana', metrics: good, feature: 'bank' });
    expect(a.code).toBe('AWAITING_APPROVAL');
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'cut-over', by: 'Ana', metrics: good })).code).toBe('AWAITING_APPROVAL');
    await recordAnswer(cwd, 'bank', a.card!, 'A', 'Ana');
    expect((await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'cut-over', by: 'Ana', metrics: good })).code).toBe('ADVANCED');
  });
  it('decommission is irreversible: its card defaults to park, and a rejection keeps the stage', async () => {
    const a = await advance(cwd, { component: comp('legacy-fax'), r: 'retire', to: 'decommissioned', by: 'Ana', feature: 'bank' });
    expect(a.code).toBe('AWAITING_APPROVAL');
    const card = JSON.parse(readFileSync(path.join(cwd, '.sdd/hil/bank', `${a.card}.json`), 'utf8'));
    expect(card.trigger).toBe('irreversible-damage');
    expect(card.default).toBe('C');
    await recordAnswer(cwd, 'bank', a.card!, 'B', 'Ana');
    expect((await advance(cwd, { component: comp('legacy-fax'), r: 'retire', to: 'decommissioned', by: 'Ana' })).code).toBe('REJECTED');
    expect((await readModState(cwd)).components['legacy-fax'].stage).toBe('planned');
  });
  it('a low-criticality cut-over needs no card', async () => {
    await advance(cwd, { component: comp('notifications'), r: 'rehost', to: 'migrated', by: 'Ana' });
    expect((await advance(cwd, { component: comp('notifications'), r: 'rehost', to: 'cut-over', by: 'Ana' })).code).toBe('ADVANCED');
  });
});

describe('AC-03 events and rules: validation and determinism', () => {
  it.each([
    ['agent source', { source: 'agent' }, 'agent cannot raise'],
    ['no evidence', { evidence: [] }, 'evidence'],
    ['cvss out of range', { cvss: 11 }, 'cvss'],
    ['no components on an advisory', { components: [] }, 'affected components'],
    ['bad type', { type: 'rumour' }, 'type must be'],
    ['bad id', { id: 'bad id!' }, 'id must be'],
    ['unknown key', { colour: 'red' }, 'unknown key'],
  ])('rejects an event with %s', (_n, patch, msg) => {
    const r = validateEvent({ ...cve(), ...(patch as object) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain(msg);
  });
  it.each([
    [9.8, false, 'critical'],
    [7.5, false, 'high'],
    [5, false, 'medium'],
    [2, false, 'low'],
    [5, true, 'critical'],
  ])('CVSS %s exploited %s → %s', (cvss, exploited, sev) => expect(severityOf({ cvss, exploited })).toBe(sev));
  it('metamorphic: a higher CVSS never lowers the severity', () => {
    const ord = ['low', 'medium', 'high', 'critical'];
    for (let c = 0; c < 10; c += 0.5) expect(ord.indexOf(severityOf({ cvss: c + 0.5 }))).toBeGreaterThanOrEqual(ord.indexOf(severityOf({ cvss: c })));
  });
  it('the shipped rules are valid', async () => expect((await loadRules(cwd)).errors).toEqual([]));
  it('rejects a rule with an unknown step type or a bad expression', () => {
    const bad: Rule = { id: 'X', on: 'incident', when: 'nonsense ===', priority: 1, rationale: 'r', actions: [{ type: 'insert-steps', steps: [{ id: 's', use: 'opensdd:modernize/teleport' }] }] };
    const errs = validateRules({ schema: 'open-sdd.dynamic-rules/1', rules: [bad] }, 't');
    expect(errs.join()).toContain('unknown step type');
    expect(errs.join()).toContain('when');
  });
  it('same inputs → same decision and digest', async () => {
    const { rules, policy, digest } = await loadRules(cwd);
    const ctx = await buildContext(cwd, 'bank');
    expect(evaluate(cve(), rules, policy, ctx, digest)).toEqual(evaluate(cve(), rules, policy, ctx, digest));
  });
  it('rules run in priority order: a project rule at priority 1 runs first', async () => {
    mkdirSync(path.join(cwd, '.sdd/settings'), { recursive: true });
    writeFileSync(path.join(cwd, '.sdd/settings/dynamic-rules.json'), JSON.stringify({ schema: 'open-sdd.dynamic-rules/1', rules: [{ id: 'AAA-FIRST', on: 'security-advisory', when: 'sev >= 0', priority: 1, rationale: 'first', actions: [{ type: 'set-deadline', sla: 'low' }] }] }));
    const { rules, policy, digest } = await loadRules(cwd);
    const d = evaluate(cve(), rules, policy, await buildContext(cwd, 'bank'), digest);
    expect(d.evaluated.find((e) => e.matched)?.rule).toBe('AAA-FIRST');
    expect(d.deadlineHours).toBe(24);
  });
  it('a project rule with a default id replaces the default', async () => {
    mkdirSync(path.join(cwd, '.sdd/settings'), { recursive: true });
    writeFileSync(path.join(cwd, '.sdd/settings/dynamic-rules.json'), JSON.stringify({ schema: 'open-sdd.dynamic-rules/1', rules: [{ id: 'SEC-HIGH-DEADLINE', on: 'security-advisory', when: 'severity == high', priority: 11, rationale: 'our policy', actions: [{ type: 'set-deadline', sla: 'critical' }] }] }));
    const { rules } = await loadRules(cwd);
    expect(rules.filter((r) => r.id === 'SEC-HIGH-DEADLINE')).toHaveLength(1);
    expect(rules.find((r) => r.id === 'SEC-HIGH-DEADLINE')?.rationale).toBe('our policy');
  });
});

describe('AC-04 events reshape the run', () => {
  it('a critical advisory inserts its lane first, freezes and prepares a valid card', async () => {
    const r = await applyEvent(cwd, 'bank', cve());
    expect(r.code).toBe('APPLIED');
    expect(r.frozen).toEqual(['auth-service']);
    expect(r.cards).toHaveLength(1);
    const d = await nextDirective(cwd, 'bank');
    expect('step' in d && d.step).toBe('exposure@auth-service');
    expect(r.decision?.deadlineHours).toBe(24);
  });
  it('a repeated event id is a no-op', async () => {
    await applyEvent(cwd, 'bank', cve());
    const again = await applyEvent(cwd, 'bank', cve());
    expect(again.code).toBe('ALREADY_APPLIED');
    expect(again.inserted).toEqual([]);
  });
  it('in parallel run both systems are patched; on legacy only one', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) await advance(cwd, { component: comp('auth-service'), r: 'replatform', to, by: 'Ana' });
    const r = await applyEvent(cwd, 'bank', cve({ components: ['auth-service', 'notifications'] }));
    expect(r.inserted).toEqual(expect.arrayContaining(['patch@auth-service:legacy', 'patch@auth-service:modern', 'patch@notifications']));
  });
  it('a high advisory sets the high deadline and does not freeze', async () => {
    const r = await applyEvent(cwd, 'bank', cve({ cvss: 7.5 }));
    expect(r.decision?.deadlineHours).toBe(72);
    expect(r.frozen).toEqual([]);
  });
  it('regulated data adds the security baseline gate', async () => {
    const r = await applyEvent(cwd, 'bank', cve({ components: ['card-processing'] }));
    expect(r.inserted).toContain('security-gate@card-processing');
  });
  it('an incident during canary rolls back and freezes', async () => {
    for (const to of ['characterized', 'replatformed', 'parallel-run']) await advance(cwd, { component: comp('auth-service'), r: 'replatform', to, by: 'Ana' });
    await advance(cwd, { component: comp('auth-service'), r: 'replatform', to: 'canary-25', by: 'Ana', metrics: good });
    const r = await applyEvent(cwd, 'bank', { id: 'INC-7', type: 'incident', at: '2026-10-24T10:00:00Z', source: 'monitor', title: 'login errors spike', components: ['auth-service'], severity: 'high', env: 'prod', evidence: ['alert 4411'] });
    expect(r.inserted).toContain('rollback@auth-service');
    expect(r.frozen).toEqual(['auth-service']);
  });
  it('an unknown component is refused', async () => expect((await applyEvent(cwd, 'bank', cve({ components: ['ghost'] }))).code).toBe('INVALID'));
  it('resolve needs every lane step done, then unfreezes', async () => {
    await applyEvent(cwd, 'bank', cve({ cvss: 9.1, components: ['notifications'] }));
    expect((await resolveEvent(cwd, 'bank', 'CVE-1')).ok).toBe(false);
    for (const s of (await readState(cwd, 'bank'))!.steps.filter((x) => x.phase === 'event:CVE-1')) await report(cwd, 'bank', s.id, 'skipped', { reason: 'test', by: 'Ana' });
    const r = await resolveEvent(cwd, 'bank', 'CVE-1');
    expect(r.ok).toBe(true);
    expect(r.unfrozen).toEqual(['notifications']);
    expect((await readModState(cwd)).components.notifications.frozen).toEqual([]);
  });
});

describe('AC-05 agent proposals', () => {
  const cur = { cvss: 9.8, severity: 'critical' as const, exploited: false, components: ['auth-service'] };
  const known = new Set(banking.components.map((c) => c.id));
  const p = (claims: object, evidence = ['vendor bulletin VB-2026-17 lists the library']) => ({ event: 'CVE-1', author: 'model-x', claims, evidence });
  it.each([
    ['an unknown component', p({ components: ['swift-gateway'] }), 'UNKNOWN_COMPONENT'],
    ['no evidence', p({ exploited: true }, []), 'NO_EVIDENCE'],
    ['a lower CVSS', p({ cvss: 5 }), 'CANNOT_LOWER_RISK'],
    ['a lower severity', p({ severity: 'medium' }), 'CANNOT_LOWER_RISK'],
    ['not affected (a person decides that)', p({ notAffected: ['auth-service'] }), 'NOT_A_PERSON_DECISION'],
    ['an unknown claim', p({ patchIsTrivial: true }), 'BAD_SHAPE'],
    ['nothing new', p({ cvss: 9.8 }), 'NOTHING_NEW'],
    ['exploitation', p({ exploited: true }), 'ADMITTED'],
    ['another affected component', p({ components: ['crm'] }), 'ADMITTED'],
    ['a higher CVSS', p({ cvss: 10 }), 'ADMITTED'],
  ])('%s → %s', (_n, prop, code) => expect(validateProposal(prop as never, known, cur)).toContain(code));
  it('an admitted proposal re-evaluates and only adds', async () => {
    await applyEvent(cwd, 'bank', cve({ cvss: 7.5 }));
    const before = (await readState(cwd, 'bank'))!.steps.length;
    const r = await submitProposal(cwd, 'bank', p({ exploited: true }) as never);
    expect(r.codes).toEqual(['ADMITTED']);
    expect(r.apply?.code).toBe('REVISED');
    expect(r.apply?.inserted).toContain('emergency-change@auth-service');
    expect((await readState(cwd, 'bank'))!.steps.length).toBeGreaterThan(before);
    const rec = await readEventRecord(cwd, 'bank', 'CVE-1');
    expect(rec?.decision.severity).toBe('critical');
    expect(rec?.proposals[0].status).toBe('admitted');
  });
  it('a rejected proposal is recorded and changes nothing', async () => {
    await applyEvent(cwd, 'bank', cve());
    const before = JSON.stringify(await readState(cwd, 'bank'));
    const r = await submitProposal(cwd, 'bank', p({ cvss: 3 }) as never);
    expect(r.codes).toContain('CANNOT_LOWER_RISK');
    expect(JSON.stringify(await readState(cwd, 'bank'))).toBe(before);
    expect((await readEventRecord(cwd, 'bank', 'CVE-1'))?.proposals[0].status).toBe('rejected');
  });
  it('a proposal on an unknown or resolved event is refused', async () => {
    expect((await submitProposal(cwd, 'bank', p({ exploited: true }) as never)).codes).toEqual(['NO_EVENT']);
  });
});
