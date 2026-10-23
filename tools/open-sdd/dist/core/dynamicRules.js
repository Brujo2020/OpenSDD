/**
 * Dynamic workflows without a model (REQ-MK-003, REQ-MK-004).
 *
 * An event (a security advisory, an incident, a wave start, an escalation signal) is matched against
 * ordered rules; the matching rules' actions reshape the running workflow: steps are inserted before
 * the next pending step, components are frozen, HIL cards are prepared, deadlines set, the level
 * raised. Everything is deterministic: rules are evaluated per affected component in priority-then-id
 * order over a flat signal map, and the decision carries a digest of exactly what it was computed from.
 * A repeated event id is a no-op; a re-evaluation (after an admitted agent proposal) only adds.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendAudit, insertSteps, raiseLevel, readState } from './engine.js';
import { listCards, prepareCard } from './hilCards.js';
import { evaluateWhen, stepCatalogue } from './playbook.js';
import { ceremonyFor, rank } from './levels.js';
import { dispositions, readOverrides } from './modernize/disposition.js';
import { componentState, DUAL_RUN, freeze, hasSbom, readModState, unfreeze } from './modernize/lifecycle.js';
import { isRegulated, readPortfolio } from './modernize/portfolio.js';
export const EVENT_TYPES = ['security-advisory', 'incident', 'wave-start', 'signal', 'regulatory-change', 'scope-change'];
export const SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const DEFAULT_RULES_FILE = fileURLToPath(new URL('../../templates/modernize/rules.default.json', import.meta.url));
export const projectRulesFile = (cwd) => path.join(cwd, '.sdd', 'settings', 'dynamic-rules.json');
export const eventsDir = (cwd, feature) => path.join(cwd, '.sdd', 'events', feature);
const SIGNALS = ['type', 'severity', 'sev', 'cvss', 'exploited', 'env', 'stage', 'disposition', 'criticality', 'sensitivity', 'regulated', 'sbom', 'frozen', 'dual', 'level', 'wave', 'risk', 'signal', 'component'];
const ACTIONS = ['insert-steps', 'patch-both', 'freeze', 'require-hil', 'set-deadline', 'raise-level'];
// ── Validation ──────────────────────────────────────────────────────────────────────────────
export const validateEvent = (raw) => {
    const e = raw;
    const errors = [];
    if (!e || typeof e !== 'object')
        return { ok: false, errors: ['event is not an object'] };
    const allowed = ['schema', 'id', 'type', 'at', 'source', 'title', 'components', 'env', 'cvss', 'severity', 'exploited', 'wave', 'signal', 'evidence'];
    for (const k of Object.keys(e))
        if (!allowed.includes(k))
            errors.push(`unknown key «${k}»`);
    if (!e.id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(e.id))
        errors.push('id must be [A-Za-z0-9._-]');
    if (!EVENT_TYPES.includes(e.type))
        errors.push(`type must be one of ${EVENT_TYPES.join(', ')}`);
    if (!e.at || Number.isNaN(Date.parse(e.at)))
        errors.push('at must be an ISO date');
    if (e.source === 'agent')
        errors.push('an agent cannot raise an event: propose on an existing event (open-sdd modernize propose)');
    else if (!['human', 'scanner', 'monitor', 'pipeline'].includes(e.source))
        errors.push('source must be human|scanner|monitor|pipeline');
    if (!e.title || !String(e.title).trim())
        errors.push('title is required');
    if (!Array.isArray(e.components))
        errors.push('components must be a list (empty for run-wide events)');
    if (e.type === 'security-advisory' || e.type === 'incident') {
        if (!e.components?.length)
            errors.push(`${e.type} must name the affected components`);
        if (e.cvss === undefined && !e.severity)
            errors.push(`${e.type} needs cvss or severity`);
    }
    if (e.cvss !== undefined && (typeof e.cvss !== 'number' || e.cvss < 0 || e.cvss > 10))
        errors.push('cvss must be 0–10');
    if (e.severity !== undefined && !SEVERITIES.includes(e.severity))
        errors.push(`severity must be one of ${SEVERITIES.join(', ')}`);
    if (e.env !== undefined && !['prod', 'nonprod'].includes(e.env))
        errors.push('env must be prod|nonprod');
    if (!Array.isArray(e.evidence) || e.evidence.length === 0)
        errors.push('evidence must list at least one source (advisory URL, scanner output, ticket)');
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], event: e };
};
export const validateRules = (set, where) => {
    const errors = [];
    const catalogue = stepCatalogue();
    const sample = Object.fromEntries(SIGNALS.map((k) => [k, 'unknown']));
    const ids = new Set();
    if (set.schema !== 'open-sdd.dynamic-rules/1')
        errors.push(`${where}: schema must be "open-sdd.dynamic-rules/1"`);
    for (const r of set.rules ?? []) {
        const at = `${where} ${r.id ?? '?'}`;
        if (!r.id || ids.has(r.id))
            errors.push(`${at}: missing or duplicate id`);
        ids.add(r.id);
        if (!EVENT_TYPES.includes(r.on))
            errors.push(`${at}: on must be one of ${EVENT_TYPES.join(', ')}`);
        if (typeof r.priority !== 'number')
            errors.push(`${at}: priority must be a number`);
        const w = evaluateWhen(r.when ?? '', sample);
        if (w.error)
            errors.push(`${at}: when «${r.when}»: ${w.error}`);
        if (!Array.isArray(r.actions) || !r.actions.length)
            errors.push(`${at}: at least one action`);
        for (const a of r.actions ?? []) {
            if (!ACTIONS.includes(a.type))
                errors.push(`${at}: unknown action «${a.type}»`);
            if (a.type === 'insert-steps')
                for (const st of a.steps ?? [])
                    if (!catalogue.has(st.use))
                        errors.push(`${at}: unknown step type «${st.use}»`);
            if (a.type === 'require-hil' && a.use && !catalogue.has(a.use))
                errors.push(`${at}: unknown step type «${a.use}»`);
            if (a.type === 'set-deadline' && !SEVERITIES.includes(a.sla))
                errors.push(`${at}: sla must be a severity`);
            if (a.type === 'raise-level' && rank(a.to) === 0 && a.to !== 'L0')
                errors.push(`${at}: unknown level «${a.to}»`);
        }
    }
    return errors;
};
export const loadRules = async (cwd) => {
    const base = JSON.parse(await readFile(DEFAULT_RULES_FILE, 'utf8'));
    const raw = await readFile(projectRulesFile(cwd), 'utf8').catch(() => null);
    const project = raw ? JSON.parse(raw) : { schema: 'open-sdd.dynamic-rules/1', rules: [] };
    const errors = [...validateRules(base, 'defaults'), ...(raw ? validateRules(project, '.sdd/settings/dynamic-rules.json') : [])];
    // A project rule with the id of a default replaces it; the rest add.
    const rules = [...base.rules.filter((r) => !project.rules.some((p) => p.id === r.id)), ...project.rules];
    const policy = { ...base.policy, ...(project.policy ?? {}) };
    return { rules, policy, errors, digest: sha(JSON.stringify({ rules, policy })) };
};
// ── Evaluation ──────────────────────────────────────────────────────────────────────────────
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const severityOf = (e) => {
    const fromCvss = e.cvss === undefined ? undefined : e.cvss >= 9 ? 'critical' : e.cvss >= 7 ? 'high' : e.cvss >= 4 ? 'medium' : 'low';
    // Actively exploited in the wild is treated as critical (default policy).
    const all = [fromCvss, e.severity, e.exploited ? 'critical' : undefined].filter(Boolean);
    return all.length ? all.reduce((a, b) => (SEVERITIES.indexOf(b) > SEVERITIES.indexOf(a) ? b : a)) : 'low';
};
export const buildContext = async (cwd, feature) => {
    const state = await readState(cwd, feature);
    const components = new Map();
    const p = await readPortfolio(cwd);
    if (p.ok && p.portfolio) {
        const ds = dispositions(p.portfolio, await readOverrides(cwd));
        const ms = await readModState(cwd);
        for (const c of p.portfolio.components) {
            const r = ds.find((d) => d.id === c.id)?.r;
            const cs = componentState(ms, c.id, r);
            components.set(c.id, { c, r, stage: cs.stage, frozen: cs.frozen.length > 0, sbom: hasSbom(cwd, c.id) });
        }
    }
    return { level: rank(state?.level ?? 'L2'), components };
};
export const signalsFor = (e, component, ctx) => {
    const k = ctx.components.get(component);
    const sev = severityOf(e);
    return {
        type: e.type,
        severity: sev,
        sev: SEVERITIES.indexOf(sev),
        cvss: e.cvss ?? 'unknown',
        exploited: Boolean(e.exploited),
        env: e.env ?? 'unknown',
        stage: k?.stage ?? 'unknown',
        disposition: k?.r ?? 'unknown',
        criticality: k?.c?.criticality ?? 'unknown',
        sensitivity: k?.c?.sensitivity ?? 'unknown',
        regulated: k?.c ? isRegulated(k.c) : false,
        sbom: k?.sbom ?? false,
        frozen: k?.frozen ?? false,
        dual: k ? DUAL_RUN(k.stage) : false,
        level: ctx.level,
        wave: e.wave ?? 'unknown',
        risk: Boolean(e.signal?.risk),
        signal: e.signal?.name ?? 'unknown',
        component,
    };
};
const stepId = (base, component) => (component === '-' ? base : `${base}@${component}`);
/** Order of work inside an event lane: understand → approve → change → verify. */
const LANE_ORDER = {
    'opensdd:modernize/exposure-assessment': 1,
    'opensdd:modernize/sbom-lookup': 1,
    'opensdd:modernize/rollback': 1,
    'opensdd:modernize/emergency-change': 2,
    'opensdd:modernize/compliance-review': 2,
    'opensdd:modernize/patch': 3,
    'opensdd:modernize/regression-check': 4,
    'opensdd:gate/C2': 5,
};
export const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
export const evaluate = (e, rules, policy, ctx, rulesDigest) => {
    // Most critical component first (criticality, then regulated data), then by id.
    const weight = (id) => {
        const c = ctx.components.get(id)?.c;
        return c ? c.criticality * 10 + (isRegulated(c) ? 5 : 0) : 0;
    };
    const targets = e.components.length ? [...e.components].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b)) : ['-'];
    const ordered = rules.filter((r) => r.on === e.type).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const d = { schema: 'open-sdd.decision/1', event: e, severity: severityOf(e), digest: '', rulesDigest, evaluated: [], steps: [], freezes: [], cards: [], deadlineHours: null, raise: null };
    const signalLog = {};
    for (const component of targets) {
        const values = signalsFor(e, component, ctx);
        signalLog[component] = values;
        for (const r of ordered) {
            const res = evaluateWhen(r.when, values);
            d.evaluated.push({ rule: r.id, component, matched: res.ok, ...(res.error ? { error: res.error } : {}) });
            if (!res.ok)
                continue;
            for (const a of r.actions) {
                if (a.type === 'insert-steps')
                    for (const st of a.steps)
                        d.steps.push({ id: stepId(st.id, component), use: st.use, review: st.review ?? 'auto', reason: `${r.id}: ${r.rationale}`, rule: r.id, component });
                else if (a.type === 'patch-both') {
                    const both = values.dual === true;
                    for (const side of both ? ['legacy', 'modern'] : [''])
                        d.steps.push({ id: `${stepId('patch', component)}${side ? `:${side}` : ''}`, use: 'opensdd:modernize/patch', review: 'auto', reason: `${r.id}: ${both ? 'legacy and new systems both serve traffic in ' + values.stage : r.rationale}`, rule: r.id, component });
                }
                else if (a.type === 'freeze') {
                    if (component !== '-' && !d.freezes.some((f) => f.component === component))
                        d.freezes.push({ component, reason: a.reason, rule: r.id });
                }
                else if (a.type === 'require-hil') {
                    const step = stepId(a.step, component);
                    if (!d.cards.some((c) => c.step === step)) {
                        d.cards.push({ step, trigger: a.trigger, question: a.question.replace(/\{component\}/g, component).replace(/\{event\}/g, e.id), component, rule: r.id });
                        if (a.use)
                            d.steps.push({ id: step, use: a.use, review: 'human', reason: `${r.id}: ${r.rationale}`, rule: r.id, component });
                    }
                }
                else if (a.type === 'set-deadline') {
                    const h = policy.slaHours[a.sla];
                    d.deadlineHours = d.deadlineHours === null ? h : Math.min(d.deadlineHours, h);
                }
                else if (a.type === 'raise-level') {
                    if (!d.raise || rank(a.to) > rank(d.raise.to))
                        d.raise = { to: a.to, rule: r.id };
                }
            }
        }
    }
    // Dedupe steps by id keeping the first (highest priority) occurrence, then order each component's
    // lane (component order kept; wave-start steps keep their rule order).
    d.steps = d.steps.filter((s, i) => d.steps.findIndex((x) => x.id === s.id) === i);
    const pos = new Map(targets.map((t, i) => [t, i]));
    const idx = new Map(d.steps.map((s, i) => [s.id, i]));
    const lane = (use) => (e.type === 'wave-start' ? 0 : LANE_ORDER[use] ?? 50);
    d.steps.sort((a, b) => (pos.get(a.component) - pos.get(b.component)) || (lane(a.use) - lane(b.use)) || (idx.get(a.id) - idx.get(b.id)));
    d.digest = sha(canonical({ event: e, rulesDigest, signals: signalLog }));
    return d;
};
export const readEventRecord = async (cwd, feature, id) => JSON.parse((await readFile(path.join(eventsDir(cwd, feature), `${id}.json`), 'utf8').catch(() => 'null')));
export const writeEventRecord = async (cwd, feature, rec) => {
    await mkdir(eventsDir(cwd, feature), { recursive: true });
    await writeFile(path.join(eventsDir(cwd, feature), `${rec.decision.event.id}.json`), `${JSON.stringify(rec, null, 2)}\n`, 'utf8');
};
export const listEventRecords = async (cwd, feature) => {
    const names = (await readdir(eventsDir(cwd, feature)).catch(() => [])).filter((n) => n.endsWith('.json')).sort();
    return (await Promise.all(names.map((n) => readEventRecord(cwd, feature, n.replace(/\.json$/, ''))))).filter(Boolean);
};
const cardOptions = (trigger) => ({
    options: [
        { key: 'A', label: 'Approve', consequence: trigger === 'emergency-change' ? 'the emergency change proceeds under its deadline; affected waves stay frozen until resolved' : 'the step proceeds', effect: 'approve' },
        { key: 'B', label: 'Reject', consequence: 'the change does not proceed; the decision and the accepted risk are recorded', effect: 'reject' },
        { key: 'C', label: 'Park', consequence: 'the lane waits; the deadline keeps running', effect: 'park' },
    ],
    recommend: 'A',
    def: 'C',
});
export const applyEvent = async (cwd, feature, raw, opts = {}) => {
    const empty = { inserted: [], frozen: [], cards: [] };
    const v = validateEvent(raw);
    if (!v.ok || !v.event)
        return { ok: false, code: 'INVALID', messages: v.errors, ...empty };
    const state = await readState(cwd, feature);
    if (!state)
        return { ok: false, code: 'NO_RUN', messages: [`no run for ${feature}`], ...empty };
    const unknown = v.event.components.filter((c) => c !== '*');
    const ctx = await buildContext(cwd, feature);
    if (ctx.components.size) {
        const missing = unknown.filter((c) => !ctx.components.has(c));
        if (missing.length)
            return { ok: false, code: 'INVALID', messages: [`unknown component(s): ${missing.join(', ')}`], ...empty };
    }
    const { rules, policy, errors, digest: rulesDigest } = await loadRules(cwd);
    if (errors.length)
        return { ok: false, code: 'INVALID', messages: errors, ...empty };
    const decision = evaluate(v.event, rules, policy, ctx, rulesDigest);
    const prev = await readEventRecord(cwd, feature, v.event.id);
    // Idempotency is on the event itself: the same event id with the same content is a no-op even
    // though the context (now frozen components) has moved. Changed content (an admitted proposal) re-evaluates.
    if (prev && canonical(prev.decision.event) === canonical(v.event))
        return { ok: true, code: 'ALREADY_APPLIED', messages: [`${v.event.id} already applied (digest ${decision.digest.slice(0, 12)})`], decision, ...empty };
    if (prev?.resolvedAt)
        return { ok: false, code: 'INVALID', messages: [`${v.event.id} is resolved; raise a new event`], ...empty };
    // Waves queue in order before the program's wave-execution step; urgent events jump the queue.
    const place = v.event.type === 'wave-start' ? { afterPhasePrefix: 'event:wave-', beforeUse: 'opensdd:modernize/wave-execution' } : {};
    const inserted = await insertSteps(cwd, feature, `event:${v.event.id}`, decision.steps, `${v.event.type} ${decision.severity}`, place);
    const rs = new Map([...ctx.components].map(([id, k]) => [id, k.r]));
    const frozen = [];
    for (const f of decision.freezes)
        frozen.push(...(await freeze(cwd, [f.component], v.event.id, `${f.rule}: ${f.reason}`, rs)));
    const existing = new Set((await listCards(cwd, feature)).map((c) => c.card.step));
    const cards = [];
    for (const c of decision.cards) {
        if (existing.has(c.step))
            continue;
        const o = cardOptions(c.trigger);
        const comps = decision.event.components.length || 1;
        const prepared = await prepareCard(cwd, {
            feature,
            step: c.step,
            trigger: c.trigger,
            question: c.question,
            options: o.options,
            recommend: o.recommend,
            default: o.def,
            evidence: [
                `kept -> ${c.rule} -> ${decision.event.type} ${decision.severity}${decision.event.cvss !== undefined ? ` CVSS ${decision.event.cvss}` : ''} on ${comps} component(s)`,
                ...decision.event.evidence.slice(0, 2).map((src, i) => `kept -> source ${i + 1} -> ${src.replace(/[\r\n]/g, ' ').slice(0, 120)} (${decision.event.at.slice(0, 10)})`),
            ],
            deadlineHours: decision.deadlineHours ?? 72,
        });
        if (prepared.ok && prepared.card)
            cards.push(prepared.card.id);
    }
    if (decision.raise)
        await raiseLevel(cwd, feature, decision.raise.to, ceremonyFor(decision.raise.to), `${decision.raise.rule} (${v.event.id})`);
    const rec = prev
        ? { ...prev, decision, revisions: [...prev.revisions, { digest: decision.digest, at: new Date().toISOString(), inserted, cards, reason: opts.reason ?? 're-evaluated' }] }
        : { decision, appliedAt: new Date().toISOString(), revisions: [{ digest: decision.digest, at: new Date().toISOString(), inserted, cards, reason: 'applied' }], proposals: [] };
    await writeEventRecord(cwd, feature, rec);
    await appendAudit(cwd, feature, { event: prev ? 'EVENT_REVISED' : 'EVENT_APPLIED', detail: `${v.event.id} ${v.event.type} ${decision.severity} · ${inserted.length} step(s) · ${frozen.length} frozen · ${cards.length} card(s) · digest ${decision.digest.slice(0, 12)}` });
    return { ok: true, code: prev ? 'REVISED' : 'APPLIED', messages: [], decision, inserted, frozen, cards };
};
/** All steps of the event done or skipped → unfreeze and mark resolved. */
export const resolveEvent = async (cwd, feature, id) => {
    const rec = await readEventRecord(cwd, feature, id);
    if (!rec)
        return { ok: false, message: `no event ${id} for ${feature}`, open: [], unfrozen: [] };
    if (rec.resolvedAt)
        return { ok: true, message: `${id} already resolved`, open: [], unfrozen: [] };
    const state = await readState(cwd, feature);
    const open = (state?.steps ?? []).filter((s) => s.phase === `event:${id}` && s.status !== 'done' && s.status !== 'skipped').map((s) => `${s.id} (${s.status})`);
    if (open.length)
        return { ok: false, message: `${id} has open steps: ${open.join(', ')}`, open, unfrozen: [] };
    const unfrozen = await unfreeze(cwd, id);
    rec.resolvedAt = new Date().toISOString();
    await writeEventRecord(cwd, feature, rec);
    await appendAudit(cwd, feature, { event: 'EVENT_RESOLVED', detail: `${id} · unfrozen ${unfrozen.join(', ') || '—'}` });
    return { ok: true, message: `${id} resolved${unfrozen.length ? `; unfrozen ${unfrozen.join(', ')}` : ''}`, open: [], unfrozen };
};
