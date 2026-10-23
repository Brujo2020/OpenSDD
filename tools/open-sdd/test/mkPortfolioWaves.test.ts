/**
 * Modernize Kit · portfolio, 7 Rs and wave plan (REQ-MK-006, REQ-MK-007). Each decision-table rule
 * fires on its own fixture; the banking example plans retire → pilot → dependency-ordered waves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validatePortfolio, riskScore, type Component, type Portfolio } from '../src/core/modernize/portfolio.js';
import { decide, dispositions, TABLE, LARGE_PORTFOLIO } from '../src/core/modernize/disposition.js';
import { planWaves } from '../src/core/modernize/wavePlan.js';

const base: Component = { id: 'x', criticality: 3, businessValue: 3, techFit: 3, businessDemand: 'normal', usage: 'active', sensitivity: 'internal', testCoverage: 0.5, platform: 'virtual' };
const pf = (...components: Component[]): Portfolio => ({ schema: 'open-sdd.portfolio/1', name: 't', components });
const banking = JSON.parse(readFileSync(path.join(process.cwd(), 'templates/modernize/portfolio.banking.json'), 'utf8')) as Portfolio;

describe('AC-06 portfolio validation', () => {
  it('the shipped banking example is valid', () => expect(validatePortfolio(banking).ok).toBe(true));
  it.each([
    ['wrong schema', { schema: 'x', name: 'n', components: [base] }, 'schema'],
    ['empty components', { schema: 'open-sdd.portfolio/1', name: 'n', components: [] }, 'non-empty'],
    ['bad id', { schema: 'open-sdd.portfolio/1', name: 'n', components: [{ ...base, id: 'Bad Id' }] }, 'kebab-case'],
    ['duplicate id', { schema: 'open-sdd.portfolio/1', name: 'n', components: [base, base] }, 'duplicate'],
    ['criticality out of range', { schema: 'open-sdd.portfolio/1', name: 'n', components: [{ ...base, criticality: 9 }] }, 'criticality'],
    ['unknown dependency', { schema: 'open-sdd.portfolio/1', name: 'n', components: [{ ...base, dependsOn: ['ghost'] }] }, 'unknown component'],
    ['unknown key', { schema: 'open-sdd.portfolio/1', name: 'n', components: [{ ...base, colour: 'red' }] }, 'unknown key'],
    ['coverage out of range', { schema: 'open-sdd.portfolio/1', name: 'n', components: [{ ...base, testCoverage: 2 }] }, 'testCoverage'],
  ])('rejects %s', (_n, raw, msg) => {
    const r = validatePortfolio(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain(msg);
  });
});

describe('AC-06 risk score', () => {
  it('stays within 0–100 and lists its parts', () => {
    for (const c of banking.components) {
      const r = riskScore(c, banking.components);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Object.keys(r.parts)).toEqual(['criticality', 'sensitivity', 'coverage', 'coupling', 'eol']);
    }
  });
  it('is monotonic: more criticality, more sensitive data or less coverage never lowers it', () => {
    const r0 = riskScore(base, [base]).score;
    expect(riskScore({ ...base, criticality: 5 }, [base]).score).toBeGreaterThanOrEqual(r0);
    expect(riskScore({ ...base, sensitivity: 'regulated' }, [base]).score).toBeGreaterThanOrEqual(r0);
    expect(riskScore({ ...base, testCoverage: 0 }, [base]).score).toBeGreaterThanOrEqual(r0);
    expect(riskScore({ ...base, eol: true }, [base]).score).toBeGreaterThan(r0);
  });
});

describe('AC-06 the 7 Rs decision table', () => {
  it.each([
    ['D-RETIRE', 'retire', { usage: 'none' }],
    ['D-RETAIN-RESIDENCY', 'retain', { residencyHold: true }],
    ['D-RETAIN-RECENT', 'retain', { recentlyUpgraded: true }],
    ['D-REPURCHASE', 'repurchase', { saasAvailable: true, differentiating: false }],
    ['D-MAINFRAME-REFACTOR', 'refactor', { platform: 'mainframe', businessDemand: 'high' }],
    ['D-MAINFRAME-RETAIN', 'retain', { platform: 'midrange' }],
    ['D-REFACTOR', 'refactor', { businessDemand: 'high', techFit: 1 }],
    ['D-REPLATFORM', 'replatform', { eol: true }],
    ['D-RELOCATE', 'relocate', { platform: 'vmware' }],
    ['D-REHOST', 'rehost', {}],
  ] as [string, string, Partial<Component>][])('%s → %s', (rule, r, patch) => {
    const c = { ...base, ...patch };
    const d = decide(c, pf(c));
    expect(d.rule).toBe(rule);
    expect(d.r).toBe(r);
    expect(d.reason.length).toBeGreaterThan(10);
  });
  it('a differentiating component with a SaaS alternative is not repurchased', () => {
    const c = { ...base, saasAvailable: true, differentiating: true };
    expect(decide(c, pf(c)).r).not.toBe('repurchase');
  });
  it('retire wins over every other rule (first match)', () => {
    const c = { ...base, usage: 'none' as const, platform: 'mainframe' as const, businessDemand: 'high' as const };
    expect(decide(c, pf(c)).r).toBe('retire');
  });
  it(`a large portfolio (≥ ${LARGE_PORTFOLIO}) replatforms a poor-fit component without high demand (AWS: modernize after moving)`, () => {
    const many = Array.from({ length: LARGE_PORTFOLIO }, (_, i) => ({ ...base, id: `c${i}`, techFit: 2 }));
    const d = decide(many[0], pf(...many));
    expect(d.r).toBe('replatform');
    expect(d.reason).toContain('modernize after moving');
  });
  it('high demand still refactors inside a large portfolio, with its own rule id', () => {
    const many = Array.from({ length: LARGE_PORTFOLIO }, (_, i) => ({ ...base, id: `c${i}`, techFit: 2 }));
    many[0] = { ...many[0], businessDemand: 'high' };
    expect(decide(many[0], pf(...many)).rule).toBe('D-REFACTOR-LARGE');
  });
  it('every table row has a unique rule id', () => expect(new Set(TABLE.map((r) => r.rule)).size).toBe(TABLE.length));
  it('a named override wins and keeps what the table said', () => {
    const ds = dispositions(banking, [{ id: 'notifications', r: 'replatform', by: 'Ana', reason: 'move to containers now', at: '2026-10-23' }]);
    const d = ds.find((x) => x.id === 'notifications')!;
    expect(d.r).toBe('replatform');
    expect(d.rule).toBe('OVERRIDE');
    expect(d.override?.table).toBe('rehost');
  });
  it('banking example: dispositions per component', () => {
    const r = Object.fromEntries(dispositions(banking).map((d) => [d.id, d.r]));
    expect(r).toMatchObject({ 'core-banking': 'refactor', 'ledger-db': 'replatform', 'legacy-fax': 'retire', crm: 'repurchase', 'branch-intranet': 'relocate', 'data-warehouse': 'retain', 'reporting-batch': 'retain', notifications: 'rehost' });
  });
});

describe('AC-07 wave plan', () => {
  const plan = planWaves(banking, dispositions(banking));
  const waveOf = (id: string) => plan.waves.find((w) => w.components.includes(id))!.n;
  it('retires first what nobody uses', () => expect(plan.waves[0]).toMatchObject({ kind: 'retire', components: ['legacy-fax'] }));
  it('pilots a single low-risk, non-regulated component', () => {
    expect(plan.waves[1].kind).toBe('pilot');
    expect(plan.waves[1].components).toEqual(['notifications']);
  });
  it('orders every component after its migrating dependencies', () => {
    const migrating = new Set(plan.waves.flatMap((w) => w.components));
    for (const c of banking.components.filter((x) => migrating.has(x.id) && dispositions(banking).find((d) => d.id === x.id)!.r !== 'retire'))
      for (const d of (c.dependsOn ?? []).filter((x) => migrating.has(x))) expect(waveOf(c.id)).toBeGreaterThan(waveOf(d));
  });
  it('puts at most one criticality-5 component per wave', () => {
    for (const w of plan.waves) expect(w.components.filter((id) => banking.components.find((c) => c.id === id)!.criticality === 5).length).toBeLessThanOrEqual(1);
  });
  it('respects the maximum per wave', () => {
    for (const w of planWaves(banking, dispositions(banking), { max: 2 }).waves) expect(w.components.length).toBeLessThanOrEqual(2);
  });
  it('leaves retained components out and names their hybrid dependents', () => {
    expect(plan.retained.find((t) => t.id === 'data-warehouse')?.hybridDependents).toEqual(['crm']);
    expect(plan.waves.flatMap((w) => w.components)).not.toContain('data-warehouse');
    expect(plan.warnings.join()).toContain('hybrid dependency');
  });
  it('a regulated or criticality ≥ 4 component is never the pilot', () => {
    const only = pf({ ...base, id: 'a', sensitivity: 'regulated' }, { ...base, id: 'b', criticality: 4 });
    const p = planWaves(only, dispositions(only));
    expect(p.waves.some((w) => w.kind === 'pilot')).toBe(false);
    expect(p.warnings.join()).toContain('no pilot candidate');
  });
  it('refuses a dependency cycle', () => {
    const cyc = pf({ ...base, id: 'a', dependsOn: ['b'] }, { ...base, id: 'b', dependsOn: ['a'] });
    expect(planWaves(cyc, dispositions(cyc)).error).toContain('cycle');
  });
  it('retires last what is still called', () => {
    const p2 = pf({ ...base, id: 'old', usage: 'none' }, { ...base, id: 'user', dependsOn: ['old'] });
    const p = planWaves(p2, dispositions(p2));
    expect(p.waves[p.waves.length - 1]).toMatchObject({ kind: 'retire-last', components: ['old'] });
  });
  it('is deterministic', () => expect(planWaves(banking, dispositions(banking))).toEqual(planWaves(banking, dispositions(banking))));
});
