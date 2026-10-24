/**
 * Estimación de una migración por ola (para ofertas): semanas-persona por componente según su R.
 *
 *   esfuerzo = peso(R) × tamaño(criticidad) × (1 + 0,5 × (1 − cobertura de tests)) × (regulado ? 1,2 : 1)
 *   P90 = P50 × p90Factor
 *
 * Los pesos son valores de partida declarados, no un estándar: la organización los sustituye en
 * `.sdd/settings/migration-estimate.json` y el resultado dice cuáles usó.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Disposition, R } from './disposition.js';
import type { Component, Portfolio } from './portfolio.js';
import type { WavePlan } from './wavePlan.js';

export interface MigrationEstimateSettings {
  weeksByR: Record<R, number>;
  regulatedFactor: number;
  p90Factor: number;
}

export const DEFAULT_MIGRATION_ESTIMATE: MigrationEstimateSettings = {
  weeksByR: { retire: 1, retain: 0, rehost: 2, relocate: 1, repurchase: 4, replatform: 6, refactor: 16 },
  regulatedFactor: 1.2,
  p90Factor: 1.5,
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const loadMigrationEstimateSettings = async (cwd: string): Promise<{ settings: MigrationEstimateSettings; source: 'default' | 'project' }> => {
  const raw = await readFile(path.join(cwd, '.sdd', 'settings', 'migration-estimate.json'), 'utf8').catch(() => null);
  if (raw === null) return { settings: DEFAULT_MIGRATION_ESTIMATE, source: 'default' };
  const parsed = JSON.parse(raw) as Partial<MigrationEstimateSettings>;
  return {
    settings: { ...DEFAULT_MIGRATION_ESTIMATE, ...parsed, weeksByR: { ...DEFAULT_MIGRATION_ESTIMATE.weeksByR, ...(parsed.weeksByR ?? {}) } },
    source: 'project',
  };
};

export const componentWeeks = (c: Component, r: R, s: MigrationEstimateSettings): number => {
  const size = 0.6 + 0.2 * c.criticality; // criticidad 1 → 0,8 · 5 → 1,6
  const tests = 1 + 0.5 * (1 - (c.testCoverage ?? 0));
  const regulated = c.sensitivity === 'regulated' ? s.regulatedFactor : 1;
  return s.weeksByR[r] * size * tests * regulated;
};

export interface MigrationEstimate {
  waves: { n: number; kind: string; components: { id: string; r: R; weeks: number }[]; p50Weeks: number; p90Weeks: number }[];
  totalP50Weeks: number;
  totalP90Weeks: number;
  source: 'default' | 'project';
}

export const estimateMigration = (p: Portfolio, ds: Disposition[], plan: WavePlan, s: MigrationEstimateSettings, source: 'default' | 'project'): MigrationEstimate => {
  const byId = new Map(p.components.map((c) => [c.id, c]));
  const rOf = new Map(ds.map((d) => [d.id, d.r]));
  const waves = plan.waves.map((w) => {
    const components = w.components.map((id) => {
      const r = rOf.get(id) ?? 'rehost';
      return { id, r, weeks: round1(componentWeeks(byId.get(id)!, r, s)) };
    });
    const p50 = components.reduce((sum, c) => sum + c.weeks, 0);
    return { n: w.n, kind: w.kind, components, p50Weeks: round1(p50), p90Weeks: round1(p50 * s.p90Factor) };
  });
  const total = waves.reduce((sum, w) => sum + w.p50Weeks, 0);
  return { waves, totalP50Weeks: round1(total), totalP90Weeks: round1(total * s.p90Factor), source };
};
