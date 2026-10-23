/**
 * The planner (REQ-PB-004): the minimum sufficient playbook for an intent, deterministically.
 *
 * Adopted from AI-DLC's composer, minus the model: the five uncertainty components (intent
 * ambiguity IAE, structural uncertainty CSU, verification entropy VE, risk R, unresolved
 * assumptions UA) are scored from profile signals — or set by a person with `--band` — and put in
 * bands LOW (<0.30), MED (<0.70) and HIGH. A step's ceremony is justified only when its component
 * supports it: cost ≥4 needs > 0.4, cost 2–3 needs > 0.2, cost 1 needs > 0. A step another running
 * step requires is kept. If a library playbook is within two step decisions of the result, it is
 * proposed unchanged (AI-DLC's "nearest stock" rule). The composite score is printed, labelled
 * uncalibrated, and routes nothing.
 */
import { checkPlaybook, findPlaybook } from './playbook.js';
import { profileValues } from './profile.js';
export const COMPONENTS = ['IAE', 'CSU', 'VE', 'R', 'UA'];
export const band = (v) => (v < 0.3 ? 'LOW' : v < 0.7 ? 'MED' : 'HIGH');
const BAND_VALUE = { LOW: 0.15, MED: 0.5, HIGH: 0.85 };
/** AI-DLC's published priors; displayed only, never used to route. */
const WEIGHTS = { IAE: 0.2, CSU: 0.3, VE: 0.25, R: 0.15, UA: 0.1 };
const KEYWORDS = [
    { re: /\b(fix|bug|broken|regression|defect)\b/i, type: 'bug' },
    { re: /\b(refactor|clean ?up|simplify|restructure)\b/i, type: 'refactor' },
    { re: /\b(spike|poc|prototype|proof of concept)\b/i, type: 'spike' },
    { re: /\b(idea|explore|brainstorm)\b/i, type: 'fuzzy-idea' },
    { re: /\b(roadmap|several features|multiple features)\b/i, type: 'multi-feature' },
];
const VAGUE = /\b(maybe|something|somehow|improve|better|etc|various|stuff|nice)\b/i;
export const scoreComponents = (intent, profile, overrides = {}) => {
    const v = profileValues(profile);
    const words = intent.trim().split(/\s+/).filter(Boolean).length;
    const unknown = profile.signals.filter((s) => s.value === 'unknown').length;
    const multi = Number(v.repos) >= 2 || (typeof v.units === 'number' && v.units >= 2);
    const raw = {
        IAE: [Math.min(1, (words < 6 ? 0.5 : 0.15) + (VAGUE.test(intent) ? 0.3 : 0)), `${words} word(s)${VAGUE.test(intent) ? ', vague wording' : ''}`],
        CSU: [Math.min(1, (v.terrain === 'brownfield' ? (v.tests ? 0.45 : 0.8) : 0.2) + (multi ? 0.2 : 0)), `${v.terrain}${v.terrain === 'brownfield' ? (v.tests ? ' with tests' : ' without tests') : ''}${multi ? ', multi-unit' : ''}`],
        VE: [v.tests ? 0.25 : 0.75, v.tests ? 'tests present' : 'no tests found'],
        R: [Math.min(1, (v.governance === 'enterprise' ? 0.8 : v.governance === 'team' ? 0.5 : 0.2) + (v.iac === true ? 0.1 : 0)), `governance ${v.governance}${v.iac === true ? ', infrastructure as code' : ''}`],
        UA: [Math.min(1, unknown * 0.3), `${unknown} unknown signal(s)`],
    };
    return COMPONENTS.map((c) => {
        const o = overrides[c];
        const value = o ? BAND_VALUE[o] : Math.round(raw[c][0] * 100) / 100;
        return { component: c, value, band: band(value), evidence: o ? `set by a person: ${o}` : raw[c][1] };
    });
};
const justified = (cost, value) => (cost >= 4 ? value > 0.4 : cost >= 2 ? value > 0.2 : value > 0);
export const planPlaybook = async (cwd, intent, profile, opts = {}) => {
    const values = profileValues(profile);
    let type = profile.type;
    let typeReason = `profile: ${profile.typeReason}`;
    if (type !== 'multi-unit') {
        const hit = KEYWORDS.find((k) => k.re.test(intent));
        if (hit) {
            type = hit.type;
            typeReason = `intent keyword ${String(intent.match(hit.re)?.[0])}`;
        }
    }
    const found = await findPlaybook(cwd, type);
    const base = found ? type : 'base/spec-first';
    const scores = scoreComponents(intent, profile, opts.overrides);
    const score = Object.fromEntries(scores.map((s) => [s.component, s.value]));
    const composite = Math.round(100 * COMPONENTS.reduce((acc, c) => acc + WEIGHTS[c] * score[c], 0));
    const library = { name: base, extends: base, phases: [] };
    const baseline = await checkPlaybook(cwd, library, values);
    const skip = new Set();
    const reasons = new Map();
    for (const s of baseline.steps) {
        if (s.decision !== 'EXECUTE' || !s.type)
            continue;
        const comp = s.type.component;
        if (!justified(s.type.cost, score[comp])) {
            skip.add(s.id);
            reasons.set(s.id, `cost ${s.type.cost} not justified by ${comp} ${band(score[comp])} (${score[comp]})`);
        }
    }
    // Keep anything a running step requires (never starve a step to save ceremony).
    let result = baseline;
    for (let round = 0; round < 10; round++) {
        result = await checkPlaybook(cwd, { ...library, customize: skip.size ? [{ skip: [...skip].sort() }] : [] }, values);
        const starved = result.issues.filter((i) => i.code === 'STARVED_STEP');
        if (starved.length === 0)
            break;
        for (const issue of starved) {
            const producer = issue.message.match(/its producer «([^»]+)»/)?.[1];
            if (producer && skip.delete(producer))
                reasons.set(producer, `kept: ${issue.message.match(/^step «([^»]+)»/)?.[1]} requires its output`);
        }
    }
    const rows = result.steps.map((s) => ({
        id: s.id,
        phase: s.phase,
        use: s.use,
        decision: s.decision,
        reason: reasons.get(s.id) ?? (s.decision === 'SKIP' ? s.reason : s.type ? `cost ${s.type.cost} justified by ${s.type.component} ${band(score[s.type.component])}${s.reason !== 'in the playbook' ? `; ${s.reason}` : ''}` : s.reason),
        review: s.review,
    }));
    const distance = rows.filter((r) => (baseline.steps.find((b) => b.id === r.id)?.decision ?? 'SKIP') !== r.decision).length;
    const adopted = distance <= 2;
    const finalRows = adopted ? baseline.steps.map((s) => ({ id: s.id, phase: s.phase, use: s.use, decision: s.decision, reason: s.reason === 'in the playbook' ? `library playbook ${base}` : s.reason, review: s.review })) : rows;
    const proposal = adopted
        ? { name: opts.name ?? base, extends: base, phases: [] }
        : { name: opts.name ?? `${type}-tailored`, extends: base, phases: [], customize: [{ skip: [...skip].sort() }] };
    const executed = finalRows.filter((r) => r.decision === 'EXECUTE');
    return {
        ok: (adopted ? baseline : result).issues.length === 0,
        type,
        typeReason,
        base,
        scores,
        composite,
        rows: finalRows,
        steps: executed.length,
        humanGates: executed.filter((r) => r.review === 'human').length,
        nearest: { name: base, distance, adopted },
        proposal,
        questions: profile.signals.filter((s) => s.value === 'unknown' && s.question).map((s) => s.question).slice(0, 3),
        issues: (adopted ? baseline : result).issues.map((i) => `${i.code}: ${i.message}`),
    };
};
