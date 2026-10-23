/**
 * The portfolio (REQ-MK-006): what the estate is, one record per component, validated before any
 * decision is taken on it. The risk score is a transparent weighted sum, printed with its parts.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const portfolioFile = (cwd) => path.join(cwd, '.sdd', 'modernize', 'portfolio.json');
export const modernizeDir = (cwd, ...p) => path.join(cwd, '.sdd', 'modernize', ...p);
const SENS = ['public', 'internal', 'confidential', 'regulated'];
const KEYS = ['id', 'name', 'type', 'runtime', 'platform', 'criticality', 'businessValue', 'techFit', 'businessDemand', 'usage', 'sensitivity', 'testCoverage', 'eol', 'saasAvailable', 'differentiating', 'recentlyUpgraded', 'residencyHold', 'dependsOn', 'owner'];
export const validatePortfolio = (raw) => {
    const errors = [];
    const p = raw;
    if (!p || typeof p !== 'object')
        return { ok: false, errors: ['portfolio is not an object'] };
    if (p.schema !== 'open-sdd.portfolio/1')
        errors.push('schema must be "open-sdd.portfolio/1"');
    if (!Array.isArray(p.components) || p.components.length === 0)
        errors.push('components must be a non-empty list');
    const ids = new Set();
    for (const [i, c] of (p.components ?? []).entries()) {
        const at = `components[${i}]${c?.id ? ` (${c.id})` : ''}`;
        if (!c || typeof c !== 'object') {
            errors.push(`${at}: not an object`);
            continue;
        }
        for (const k of Object.keys(c))
            if (!KEYS.includes(k))
                errors.push(`${at}: unknown key «${k}»`);
        if (!c.id || !/^[a-z0-9][a-z0-9-]*$/.test(c.id))
            errors.push(`${at}: id must be lowercase kebab-case`);
        else if (ids.has(c.id))
            errors.push(`${at}: duplicate id`);
        else
            ids.add(c.id);
        for (const k of ['criticality', 'businessValue', 'techFit'])
            if (!Number.isInteger(c[k]) || c[k] < 1 || c[k] > 5)
                errors.push(`${at}: ${k} must be an integer 1–5`);
        if (!SENS.includes(c.sensitivity))
            errors.push(`${at}: sensitivity must be one of ${SENS.join(', ')}`);
        if (c.testCoverage !== undefined && (typeof c.testCoverage !== 'number' || c.testCoverage < 0 || c.testCoverage > 1))
            errors.push(`${at}: testCoverage must be 0–1`);
        if (c.usage !== undefined && !['active', 'low', 'none'].includes(c.usage))
            errors.push(`${at}: usage must be active|low|none`);
        if (c.businessDemand !== undefined && !['high', 'normal', 'low'].includes(c.businessDemand))
            errors.push(`${at}: businessDemand must be high|normal|low`);
    }
    for (const c of p.components ?? [])
        for (const d of c?.dependsOn ?? [])
            if (!ids.has(d))
                errors.push(`${c.id}: dependsOn unknown component «${d}»`);
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], portfolio: p };
};
export const readPortfolio = async (cwd) => {
    const raw = await readFile(portfolioFile(cwd), 'utf8').catch(() => null);
    if (raw === null)
        return { ok: false, errors: [`no portfolio: run \`open-sdd modernize init\` (${path.relative(cwd, portfolioFile(cwd))})`] };
    try {
        return validatePortfolio(JSON.parse(raw));
    }
    catch (e) {
        return { ok: false, errors: [`portfolio is not valid JSON: ${e.message}`] };
    }
};
export const isRegulated = (c) => c.sensitivity === 'regulated';
const SENS_W = { public: 0, internal: 0.3, confidential: 0.7, regulated: 1 };
/** 0–100: criticality 35 %, sensitivity 25 %, missing tests 20 %, coupling 10 %, end of life 10 %. */
export const riskScore = (c, all) => {
    const dependents = all.filter((x) => (x.dependsOn ?? []).includes(c.id)).length;
    const coupling = Math.min(1, ((c.dependsOn ?? []).length + dependents) / 6);
    const parts = {
        criticality: 35 * (c.criticality / 5),
        sensitivity: 25 * SENS_W[c.sensitivity],
        coverage: 20 * (1 - (c.testCoverage ?? 0)),
        coupling: 10 * coupling,
        eol: c.eol ? 10 : 0,
    };
    const r = (n) => Math.round(n * 10) / 10;
    return { id: c.id, score: Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), parts: { criticality: r(parts.criticality), sensitivity: r(parts.sensitivity), coverage: r(parts.coverage), coupling: r(parts.coupling), eol: r(parts.eol) } };
};
