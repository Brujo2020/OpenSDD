/**
 * The 7 Rs (REQ-MK-006), decided by an ordered table: the first rule that matches wins, and its id and
 * reason travel with the decision. The table follows AWS Prescriptive Guidance ("About the migration
 * strategies", large migration guide): retire what has no value or no inbound use; retain for residency,
 * recent upgrades, or mainframe/mid-range without a strong business case; repurchase replaceable
 * non-differentiating software; refactor only with strong business demand; for large migrations prefer
 * rehost/replatform now and modernize after. A named override always wins and is recorded.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { modernizeDir, type Component, type Portfolio } from './portfolio.js';

export const RS = ['retire', 'retain', 'rehost', 'relocate', 'repurchase', 'replatform', 'refactor'] as const;
export type R = (typeof RS)[number];
export const MIGRATING: R[] = ['rehost', 'relocate', 'repurchase', 'replatform', 'refactor'];
/** Portfolios of this many migrating components count as "large" (rehost/replatform first). */
export const LARGE_PORTFOLIO = 10;

export interface Disposition {
  id: string;
  r: R;
  rule: string;
  reason: string;
  override?: { by: string; reason: string; at: string; table: R };
}

interface Row {
  rule: string;
  r: R;
  when: (c: Component, ctx: { large: boolean }) => boolean;
  reason: (c: Component, ctx: { large: boolean }) => string;
}

const LEGACY_PLATFORM = (c: Component) => c.platform === 'mainframe' || c.platform === 'midrange';

export const TABLE: Row[] = [
  { rule: 'D-RETIRE', r: 'retire', when: (c) => c.usage === 'none', reason: () => 'no inbound use: decommission instead of moving it (AWS: retire)' },
  { rule: 'D-RETAIN-TARGET', r: 'retain', when: (c) => c.platform === 'cloud' || c.platform === 'saas', reason: (c) => `already on the target platform (${c.platform}): nothing to move; keep it in the dependency graph (AWS: retain)` },
  { rule: 'D-RETAIN-RESIDENCY', r: 'retain', when: (c) => Boolean(c.residencyHold), reason: () => 'data residency hold keeps it in place (AWS: retain — security and compliance)' },
  { rule: 'D-RETAIN-RECENT', r: 'retain', when: (c) => Boolean(c.recentlyUpgraded), reason: () => 'recently upgraded: wait for the next technical refresh (AWS: retain)' },
  { rule: 'D-REPURCHASE', r: 'repurchase', when: (c) => Boolean(c.saasAvailable) && !c.differentiating, reason: () => 'a SaaS equivalent exists and the component does not differentiate the business (AWS: repurchase)' },
  { rule: 'D-MAINFRAME-REFACTOR', r: 'refactor', when: (c) => LEGACY_PLATFORM(c) && c.businessDemand === 'high', reason: (c) => `${c.platform} with high business demand: re-architect behind a strangler facade, after a detailed assessment` },
  { rule: 'D-MAINFRAME-RETAIN', r: 'retain', when: (c) => LEGACY_PLATFORM(c), reason: (c) => `${c.platform} without a strong business case needs a detailed assessment first (AWS: retain)` },
  {
    rule: 'D-REFACTOR',
    r: 'refactor',
    when: (c, ctx) => c.businessDemand === 'high' && (c.techFit <= 2 || (c.testCoverage ?? 0) < 0.3) && !ctx.large,
    reason: (c) => `high business demand on a poor technical fit (techFit ${c.techFit}, coverage ${Math.round((c.testCoverage ?? 0) * 100)} %): re-architect`,
  },
  {
    rule: 'D-REFACTOR-LARGE',
    r: 'refactor',
    when: (c, ctx) => c.businessDemand === 'high' && (c.techFit <= 2 || (c.testCoverage ?? 0) < 0.3) && ctx.large,
    reason: () => 'high business demand justifies re-architecting even inside a large migration',
  },
  {
    rule: 'D-REPLATFORM',
    r: 'replatform',
    when: (c) => Boolean(c.eol) || c.techFit <= 2,
    reason: (c, ctx) => `${c.eol ? 'end-of-life stack' : `poor technical fit (techFit ${c.techFit})`}: move to a managed runtime${ctx.large ? '; in a large migration modernize after moving (AWS)' : ''}`,
  },
  { rule: 'D-RELOCATE', r: 'relocate', when: (c) => c.platform === 'vmware', reason: () => 'VMware estate: relocate to the cloud version of the platform without changing the application (AWS: relocate)' },
  { rule: 'D-REHOST', r: 'rehost', when: () => true, reason: () => 'fit for purpose today: lift and shift, optimize once in the cloud (AWS: rehost)' },
];

/** Large = migrating components that are not retire/retain by the first rules. */
const isLarge = (p: Portfolio): boolean =>
  p.components.filter((c) => !TABLE.slice(0, 4).some((row) => row.when(c, { large: false }))).length >= LARGE_PORTFOLIO;

export const decide = (c: Component, p: Portfolio): Disposition => {
  const ctx = { large: isLarge(p) };
  const row = TABLE.find((r) => r.when(c, ctx)) as Row;
  return { id: c.id, r: row.r, rule: row.rule, reason: row.reason(c, ctx) };
};

export interface Override {
  id: string;
  r: R;
  by: string;
  reason: string;
  at: string;
}

const overridesFile = (cwd: string) => modernizeDir(cwd, 'overrides.json');
export const readOverrides = async (cwd: string): Promise<Override[]> => JSON.parse((await readFile(overridesFile(cwd), 'utf8').catch(() => '[]')) as string) as Override[];

export const recordOverride = async (cwd: string, o: Override): Promise<void> => {
  const list = (await readOverrides(cwd)).filter((x) => x.id !== o.id);
  list.push(o);
  await mkdir(path.dirname(overridesFile(cwd)), { recursive: true });
  await writeFile(overridesFile(cwd), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
};

export const dispositions = (p: Portfolio, overrides: Override[] = []): Disposition[] =>
  p.components.map((c) => {
    const d = decide(c, p);
    const o = overrides.find((x) => x.id === c.id);
    return o ? { ...d, r: o.r, rule: 'OVERRIDE', reason: `${o.reason} (override by ${o.by}; table said ${d.r} via ${d.rule})`, override: { by: o.by, reason: o.reason, at: o.at, table: d.r } } : d;
  });
