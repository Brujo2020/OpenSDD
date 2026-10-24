/**
 * Component lifecycle (REQ-MK-008): the stages each disposition walks through, the freeze an event
 * puts on a component, and the deterministic canary decision. Cut-over of a regulated or
 * criticality ≥ 4 component, and every decommission, wait for an approved HIL card.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { modernizeDir } from './portfolio.js';
import { prepareCard, readAnswer } from '../hilCards.js';
export const STAGES = {
    refactor: ['planned', 'characterized', 'facade', 'parallel-run', 'canary-5', 'canary-25', 'canary-50', 'cut-over', 'decommissioned'],
    replatform: ['planned', 'characterized', 'replatformed', 'parallel-run', 'canary-25', 'cut-over', 'decommissioned'],
    rehost: ['planned', 'migrated', 'cut-over', 'decommissioned'],
    relocate: ['planned', 'relocated', 'cut-over'],
    repurchase: ['planned', 'data-migrated', 'parallel-run', 'cut-over', 'decommissioned'],
    retire: ['planned', 'decommissioned'],
    retain: ['retained'],
};
/** Stages where the legacy and the new system both serve traffic: a patch must cover both. */
export const DUAL_RUN = (stage) => stage === 'parallel-run' || stage.startsWith('canary-');
const METRIC_GATED = (to) => to.startsWith('canary-') || to === 'cut-over';
const stateFile = (cwd) => modernizeDir(cwd, 'state.json');
export const readModState = async (cwd) => JSON.parse((await readFile(stateFile(cwd), 'utf8').catch(() => 'null'))) ?? { schema: 'open-sdd.modernize-state/1', components: {} };
export const writeModState = async (cwd, s) => {
    await mkdir(path.dirname(stateFile(cwd)), { recursive: true });
    await writeFile(stateFile(cwd), `${JSON.stringify(s, null, 2)}\n`, 'utf8');
};
export const componentState = (s, id, r) => s.components[id] ?? { stage: r === 'retain' ? 'retained' : 'planned', frozen: [], history: [] };
export const hasSbom = (cwd, id) => existsSync(modernizeDir(cwd, 'sbom', `${id}.json`));
export const DEFAULT_CANARY = { maxMismatchRate: 0.001, maxLatencyRatio: 1.2, minSample: 1000 };
export const canaryDecision = (m, policy = DEFAULT_CANARY) => {
    const reasons = [];
    if (m.errorRate > 2 * m.errorBudget)
        reasons.push(`error rate ${m.errorRate} > 2 × budget ${m.errorBudget}`);
    if (m.mismatchRate > 10 * policy.maxMismatchRate)
        reasons.push(`reconciliation mismatch ${m.mismatchRate} > 10 × ${policy.maxMismatchRate}`);
    if (reasons.length)
        return { decision: 'rollback', reasons };
    if (m.sampleSize < policy.minSample)
        reasons.push(`sample ${m.sampleSize} < ${policy.minSample}`);
    if (m.errorRate > m.errorBudget)
        reasons.push(`error rate ${m.errorRate} > budget ${m.errorBudget}`);
    if (m.mismatchRate > policy.maxMismatchRate)
        reasons.push(`mismatch ${m.mismatchRate} > ${policy.maxMismatchRate}`);
    if (m.p95Ms > m.baselineP95Ms * policy.maxLatencyRatio)
        reasons.push(`p95 ${m.p95Ms} ms > ${policy.maxLatencyRatio} × baseline ${m.baselineP95Ms} ms`);
    return reasons.length ? { decision: 'hold', reasons } : { decision: 'advance', reasons: ['every criterion met'] };
};
const needsApproval = (c, to) => to === 'decommissioned' ? 'irreversible-damage' : to === 'cut-over' && (c.sensitivity === 'regulated' || c.criticality >= 4) ? 'cutover' : null;
export const advance = async (cwd, input) => {
    const s = await readModState(cwd);
    const cs = componentState(s, input.component.id, input.r);
    const stages = STAGES[input.r];
    const from = cs.stage;
    const i = stages.indexOf(from);
    const j = stages.indexOf(input.to);
    const save = async (to, note) => {
        cs.history.push({ at: (input.now ?? new Date()).toISOString(), from, to, by: input.by, note });
        cs.stage = to;
        delete cs.pendingCard;
        s.components[input.component.id] = cs;
        await writeModState(cwd, s);
    };
    if (j < 0)
        return { ok: false, code: 'BAD_TRANSITION', message: `${input.to} is not a stage of ${input.r}: ${stages.join(' → ')}`, stage: from };
    // Backward moves are rollbacks: always allowed until the legacy system is gone.
    if (j < i) {
        if (from === 'decommissioned')
            return { ok: false, code: 'BAD_TRANSITION', message: 'the legacy system is decommissioned: there is nothing to roll back to', stage: from };
        await save(input.to, 'rollback');
        return { ok: true, code: 'ROLLED_BACK', message: `${input.component.id}: ${from} → ${input.to} (rollback)`, stage: input.to };
    }
    if (j !== i + 1)
        return { ok: false, code: 'BAD_TRANSITION', message: `${input.component.id} is ${from}; the next stage is ${stages[i + 1] ?? '(none)'}`, stage: from };
    if (cs.frozen.length)
        return { ok: false, code: 'FROZEN', message: `${input.component.id} is frozen by ${cs.frozen.map((f) => `${f.event} (${f.reason})`).join('; ')}: resolve the event first`, stage: from };
    if (METRIC_GATED(input.to) && DUAL_RUN(from)) {
        if (!input.metrics)
            return { ok: false, code: 'METRICS_REQUIRED', message: `moving to ${input.to} needs canary metrics (--metrics file)`, stage: from };
        const d = canaryDecision(input.metrics, input.policy);
        if (d.decision === 'rollback')
            return { ok: false, code: 'CANARY_ROLLBACK', message: `roll back: ${d.reasons.join('; ')}`, stage: from };
        if (d.decision === 'hold')
            return { ok: false, code: 'CANARY_HOLD', message: `hold at ${from}: ${d.reasons.join('; ')}`, stage: from };
    }
    const trigger = needsApproval(input.component, input.to);
    if (trigger) {
        if (cs.pendingCard && cs.pendingCard.stage === input.to) {
            const answer = await readAnswer(cwd, cs.pendingCard.feature, cs.pendingCard.card);
            if (!answer)
                return { ok: false, code: 'AWAITING_APPROVAL', message: `waiting for ${cs.pendingCard.card}: steelforge hil answer ${cs.pendingCard.feature} ${cs.pendingCard.card} <option> --by "<name>"`, card: cs.pendingCard.card, stage: from };
            if (answer.effect !== 'approve') {
                delete cs.pendingCard;
                s.components[input.component.id] = cs;
                await writeModState(cwd, s);
                return { ok: false, code: 'REJECTED', message: `${input.to} of ${input.component.id} was not approved (${answer.option} by ${answer.by})`, stage: from };
            }
            await save(input.to, `approved by ${answer.by} (${cs.pendingCard.card})`);
            return { ok: true, code: 'ADVANCED', message: `${input.component.id}: ${from} → ${input.to} (approved by ${answer.by})`, stage: input.to };
        }
        const feature = input.feature ?? s.feature;
        if (!feature)
            return { ok: false, code: 'NO_FEATURE', message: 'no migration run: pass --feature or run `steelforge migrate plan <feature>`', stage: from };
        const irreversible = trigger === 'irreversible-damage';
        const prepared = await prepareCard(cwd, {
            feature,
            step: `${input.to === 'decommissioned' ? 'decommission' : 'cutover'}@${input.component.id}`,
            trigger,
            question: irreversible ? `Decommission the legacy ${input.component.id} now?` : `Cut ${input.component.id} over to the new system now?`,
            options: [
                { key: 'A', label: 'Approve', consequence: irreversible ? 'legacy system is shut down; no rollback after this' : 'all traffic goes to the new system; rollback stays possible in the window', effect: 'approve' },
                { key: 'B', label: 'Reject', consequence: `${input.component.id} stays at ${from}`, effect: 'reject' },
                { key: 'C', label: 'Park', consequence: 'decision postponed; nothing changes', effect: 'park' },
            ],
            recommend: irreversible ? 'C' : 'A',
            default: 'C',
            evidence: [
                `kept -> ${from} -> ${input.to} for ${input.component.id} (criticality ${input.component.criticality}, ${input.component.sensitivity})`,
                ...cs.history.slice(-2).map((h) => `kept -> ${h.from} -> ${h.to} by ${h.by}, step ${cs.history.indexOf(h) + 1}`),
            ],
            deadlineHours: 72,
        });
        if (!prepared.ok || !prepared.card)
            return { ok: false, code: 'AWAITING_APPROVAL', message: prepared.errors.join('; '), stage: from };
        cs.pendingCard = { stage: input.to, card: prepared.card.id, feature };
        s.components[input.component.id] = cs;
        await writeModState(cwd, s);
        return { ok: false, code: 'AWAITING_APPROVAL', message: `${input.to} of ${input.component.id} needs a person: ${prepared.card.id} (steelforge hil review ${feature} --html)`, card: prepared.card.id, stage: from };
    }
    await save(input.to, input.metrics ? 'canary criteria met' : 'advanced');
    return { ok: true, code: 'ADVANCED', message: `${input.component.id}: ${from} → ${input.to}`, stage: input.to };
};
export const freeze = async (cwd, ids, event, reason, rs) => {
    const s = await readModState(cwd);
    const done = [];
    for (const id of ids) {
        const cs = componentState(s, id, rs.get(id));
        if (cs.frozen.some((f) => f.event === event))
            continue;
        cs.frozen.push({ event, reason });
        s.components[id] = cs;
        done.push(id);
    }
    if (done.length)
        await writeModState(cwd, s);
    return done;
};
export const unfreeze = async (cwd, event) => {
    const s = await readModState(cwd);
    const done = [];
    for (const [id, cs] of Object.entries(s.components)) {
        const before = cs.frozen.length;
        cs.frozen = cs.frozen.filter((f) => f.event !== event);
        if (cs.frozen.length !== before)
            done.push(id);
    }
    if (done.length)
        await writeModState(cwd, s);
    return done;
};
