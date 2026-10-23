/**
 * The wave plan (REQ-MK-007). Order: retire first what nobody uses; a single low-risk pilot to learn
 * on; then migrating components after their migrating dependencies, lowest risk first, at most `max`
 * per wave and at most one criticality-5 component per wave so a failure stays contained. Retained
 * components stay out; whoever migrates while depending on them carries a hybrid dependency.
 */
import { type Disposition, MIGRATING } from './disposition.js';
import { riskScore, type Component, type Portfolio, isRegulated } from './portfolio.js';

export interface Wave {
  n: number;
  kind: 'retire' | 'pilot' | 'migrate' | 'retire-last';
  components: string[];
  reasons: string[];
}

export interface WavePlan {
  waves: Wave[];
  retained: { id: string; hybridDependents: string[] }[];
  warnings: string[];
  error?: string;
}

export const planWaves = (p: Portfolio, ds: Disposition[], opts: { max?: number } = {}): WavePlan => {
  const max = Math.max(1, opts.max ?? 3);
  const by = new Map(p.components.map((c) => [c.id, c]));
  const r = new Map(ds.map((d) => [d.id, d.r]));
  const risk = new Map(p.components.map((c) => [c.id, riskScore(c, p.components).score]));
  const migrating = p.components.filter((c) => MIGRATING.includes(r.get(c.id)!));
  const migIds = new Set(migrating.map((c) => c.id));
  const warnings: string[] = [];

  const retire = p.components.filter((c) => r.get(c.id) === 'retire');
  const activeDependents = (c: Component) => p.components.filter((x) => (x.dependsOn ?? []).includes(c.id) && r.get(x.id) !== 'retire' && x.usage !== 'none');
  const retireFirst = retire.filter((c) => activeDependents(c).length === 0).map((c) => c.id).sort();
  const retireLast = retire.filter((c) => activeDependents(c).length > 0).map((c) => c.id).sort();
  for (const id of retireLast) warnings.push(`${id} is retired last: ${activeDependents(by.get(id)!).map((x) => x.id).join(', ')} still call it`);

  const retained = p.components
    .filter((c) => r.get(c.id) === 'retain')
    .map((c) => ({ id: c.id, hybridDependents: migrating.filter((m) => (m.dependsOn ?? []).includes(c.id)).map((m) => m.id).sort() }));
  for (const t of retained) if (t.hybridDependents.length) warnings.push(`hybrid dependency: ${t.hybridDependents.join(', ')} → ${t.id} (retained) needs connectivity between environments`);

  // Topological levels over the migrating subset.
  const deps = (c: Component) => (c.dependsOn ?? []).filter((d) => migIds.has(d));
  const level = new Map<string, number>();
  const placed = new Set<string>();
  let k = 0;
  while (placed.size < migrating.length) {
    const ready = migrating.filter((c) => !placed.has(c.id) && deps(c).every((d) => placed.has(d)));
    if (!ready.length) {
      const rest = migrating.filter((c) => !placed.has(c.id)).map((c) => c.id);
      return { waves: [], retained, warnings, error: `dependency cycle among ${rest.join(', ')}: break it with a facade before planning waves` };
    }
    for (const c of ready) {
      level.set(c.id, k);
      placed.add(c.id);
    }
    k += 1;
  }

  const waves: Wave[] = [];
  const push = (kind: Wave['kind'], components: string[], reasons: string[]) => waves.push({ n: waves.length + 1, kind, components, reasons });
  if (retireFirst.length) push('retire', retireFirst, ['no active dependents: retiring first shrinks the estate before anything moves']);

  const eligible = migrating
    .filter((c) => level.get(c.id) === 0 && !isRegulated(c) && c.criticality < 4)
    .sort((a, b) => risk.get(a.id)! - risk.get(b.id)! || a.id.localeCompare(b.id));
  const pilot = eligible[0];
  if (pilot) push('pilot', [pilot.id], [`pilot: lowest risk (${risk.get(pilot.id)}/100), not regulated, criticality ${pilot.criticality}, no migrating dependencies`]);
  else if (migrating.length) warnings.push('no pilot candidate: every component is regulated, criticality ≥ 4 or has dependencies — run a pilot outside the portfolio first');

  for (let lv = 0; lv < k; lv += 1) {
    const items = migrating
      .filter((c) => level.get(c.id) === lv && c.id !== pilot?.id)
      .sort((a, b) => risk.get(a.id)! - risk.get(b.id)! || a.id.localeCompare(b.id));
    let current: Component[] = [];
    const flush = () => {
      if (!current.length) return;
      const crit5 = current.filter((c) => c.criticality === 5).map((c) => c.id);
      push('migrate', current.map((c) => c.id), [
        `dependency level ${lv}${lv ? ': after its migrating dependencies' : ''}`,
        ...(crit5.length ? [`criticality 5 in this wave: ${crit5.join(', ')} (at most one per wave)`] : []),
      ]);
      current = [];
    };
    for (const c of items) {
      const hasCrit5 = current.some((x) => x.criticality === 5);
      if (current.length >= max || (c.criticality === 5 && hasCrit5)) flush();
      current.push(c);
    }
    flush();
  }
  if (retireLast.length) push('retire-last', retireLast, ['retired after the components that still call them have moved']);
  return { waves, retained, warnings };
};
