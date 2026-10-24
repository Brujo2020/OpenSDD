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
const NUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
const RISKS = [
    { tag: 'payments', re: /\b(payments?|billing|checkout|invoic\w*|pagos?|cobros?|facturaci\w*)\b/i },
    { tag: 'auth', re: /\b(auth\w*|login|sso|oauth|permissions?|rbac|identity)\b/i },
    { tag: 'pii', re: /\b(pii|personal data|gdpr|health|medical|datos personales)\b/i },
    { tag: 'migration', re: /\b(migrat\w*|monolith|cut ?over|legacy)\b/i },
    { tag: 'infra', re: /\b(infra\w*|terraform|kubernetes|k8s|network|landing zone)\b/i },
    { tag: 'data', re: /\b(database|schema change|data model|etl|warehouse)\b/i },
];
/**
 * Una petición grande, partida en candidatas a feature: el texto tras «:» (o tras with/con/including),
 * separado por comas y «;». No inventa: cada candidata es un trozo literal de la petición.
 */
export const splitFeatures = (intent) => {
    const tail = intent.includes(':') ? intent.slice(intent.indexOf(':') + 1) : (intent.match(/\b(?:with|con|including|incluyendo)\s+(.+)$/i)?.[1] ?? '');
    return tail
        .split(/[,;]\s*|\s+(?:and|y|e)\s+(?=[^,]*$)/i)
        .map((part) => part.trim().replace(/\.$/, ''))
        .filter((part) => part.split(/\s+/).length >= 1 && part.length >= 3);
};
/** Scale and risk read from the intent text, each with the words that matched (REQ-V37-007). */
export const intentSignals = (intent) => {
    const evidence = [];
    let units = 0;
    const counted = intent.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|dos|tres|cuatro|cinco)\s+(micro-?services?|services?|repos?(?:itories)?|apps?|units?|servicios|microservicios|repositorios)\b/i);
    if (counted) {
        units = Number(counted[1]) || NUM[counted[1].toLowerCase()] || 0;
        evidence.push(`«${counted[0]}»`);
    }
    const named = intent.match(/\b(?:across|in|en|entre)\s+((?:[\w-]+(?:,\s*|\s+(?:and|y)\s+))+[\w-]+)\s+(?:repos?(?:itories)?|services?|servicios|repositorios)\b/i);
    if (named) {
        const n = named[1].split(/,\s*|\s+(?:and|y)\s+/).filter(Boolean).length;
        if (n > units)
            units = n;
        evidence.push(`«${named[0]}»`);
    }
    let features = 0;
    const list = intent.match(/\b(?:with|con|including|incluyendo)\s+(.+)$/i);
    if (list) {
        features = list[1].split(/,\s*|\s+(?:and|y)\s+/).filter((x) => x.trim()).length;
        if (features >= 2)
            evidence.push(`${features} features: «${list[1]}»`);
    }
    const risks = RISKS.flatMap((r) => {
        const m = intent.match(r.re);
        return m ? [{ tag: r.tag, evidence: m[0] }] : [];
    });
    return { units, features, risks, evidence };
};
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
    const signals = intentSignals(intent);
    if (signals.units >= 2 && type !== 'multi-unit') {
        type = 'multi-unit';
        typeReason = `intent names ${signals.units} units: ${signals.evidence.join(', ')}`;
    }
    else if (signals.features >= 3 && type !== 'multi-unit') {
        type = 'multi-feature';
        typeReason = `intent lists ${signals.features} features`;
    }
    else if (type !== 'multi-unit') {
        const hit = KEYWORDS.find((k) => k.re.test(intent));
        if (hit) {
            type = hit.type;
            typeReason = `intent keyword ${String(intent.match(hit.re)?.[0])}`;
        }
    }
    const found = await findPlaybook(cwd, type);
    const base = found ? type : 'base/spec-first';
    const autoBands = {};
    if (signals.risks.length)
        autoBands.R = 'HIGH';
    if (signals.units >= 2)
        autoBands.CSU = 'HIGH';
    const scores = scoreComponents(intent, profile, { ...autoBands, ...opts.overrides });
    for (const sc of scores)
        if (autoBands[sc.component] && !opts.overrides?.[sc.component])
            sc.evidence = sc.component === 'R' ? `intent risk: ${signals.risks.map((r) => `${r.tag} («${r.evidence}»)`).join(', ')}` : `intent scale: ${signals.evidence.join(', ')}`;
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
    // A risky intent gets a human design review (REQ-V37-007).
    if (signals.risks.length && !finalRows.some((r) => r.id === 'risk-review')) {
        const exec = finalRows.filter((r) => r.decision === 'EXECUTE');
        const anchor = exec.find((r) => /design|contract/.test(r.use)) ?? exec.find((r) => /requirements|spec-batch|steering|discovery/.test(r.use)) ?? exec[0];
        if (anchor) {
            const reason = `human design review: intent risk ${signals.risks.map((r) => r.tag).join(', ')}`;
            const add = { phase: anchor.phase, use: 'opensdd:skill/sdd-validate-design', id: 'risk-review', review: 'human', after: anchor.id };
            proposal.customize = [...(proposal.customize ?? []), { add: [add] }];
            if (proposal.name === base)
                proposal.name = opts.name ?? `${type}-tailored`;
            finalRows.splice(finalRows.indexOf(anchor) + 1, 0, { id: 'risk-review', phase: anchor.phase, use: add.use, decision: 'EXECUTE', reason, review: 'human' });
        }
    }
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
        intent: signals,
    };
};
