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
export const DEFAULT_MIGRATION_ESTIMATE = {
    weeksByR: { retire: 1, retain: 0, rehost: 2, relocate: 1, repurchase: 4, replatform: 6, refactor: 16 },
    regulatedFactor: 1.2,
    p90Factor: 1.5,
};
const round1 = (n) => Math.round(n * 10) / 10;
export const loadMigrationEstimateSettings = async (cwd) => {
    const raw = await readFile(path.join(cwd, '.sdd', 'settings', 'migration-estimate.json'), 'utf8').catch(() => null);
    if (raw === null)
        return { settings: DEFAULT_MIGRATION_ESTIMATE, source: 'default' };
    const parsed = JSON.parse(raw);
    return {
        settings: { ...DEFAULT_MIGRATION_ESTIMATE, ...parsed, weeksByR: { ...DEFAULT_MIGRATION_ESTIMATE.weeksByR, ...(parsed.weeksByR ?? {}) } },
        source: 'project',
    };
};
export const componentWeeks = (c, r, s) => {
    const size = 0.6 + 0.2 * c.criticality; // criticidad 1 → 0,8 · 5 → 1,6
    const tests = 1 + 0.5 * (1 - (c.testCoverage ?? 0));
    const regulated = c.sensitivity === 'regulated' ? s.regulatedFactor : 1;
    return s.weeksByR[r] * size * tests * regulated;
};
export const estimateMigration = (p, ds, plan, s, source) => {
    const byId = new Map(p.components.map((c) => [c.id, c]));
    const rOf = new Map(ds.map((d) => [d.id, d.r]));
    const waves = plan.waves.map((w) => {
        const components = w.components.map((id) => {
            const r = rOf.get(id) ?? 'rehost';
            return { id, r, weeks: round1(componentWeeks(byId.get(id), r, s)) };
        });
        const p50 = components.reduce((sum, c) => sum + c.weeks, 0);
        return { n: w.n, kind: w.kind, components, p50Weeks: round1(p50), p90Weeks: round1(p50 * s.p90Factor) };
    });
    const total = waves.reduce((sum, w) => sum + w.p50Weeks, 0);
    return { waves, totalP50Weeks: round1(total), totalP90Weeks: round1(total * s.p90Factor), source };
};
