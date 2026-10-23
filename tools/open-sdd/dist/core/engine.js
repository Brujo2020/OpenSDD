/**
 * The engine: one directive contract for every host (REQ-PB-006, REQ-PB-008/009/010/013).
 *
 * Adopted from AI-DLC's engine/conductor split. `next` reads state and emits EXACTLY ONE directive
 * of a declared kind, validated against its schema, and changes nothing. `report` applies one
 * transition atomically and appends one audit event. Every host — a CLI user, the MCP server, the
 * skills of any agent — drives a run only through these two calls, so adding a host means adding a
 * thin loop, never logic.
 *
 * Guards on the way to a gate (deterministic, all of them):
 *   - declared outputs that open-sdd can locate must exist (artifact guard);
 *   - a step with a handoff pack must have passed the recall check (`RECALL_MISMATCH` blocks);
 *   - answers confirmed for the step must still hash the same, and produced artifacts must carry
 *     the confirmation id;
 *   - a review receipt for the step must be fresh;
 *   - `approved` never comes from `report`: only a named answer to a prepared card approves;
 *   - the last step of a phase runs the traceability gate, which blocks on an orphan requirement.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkConsistency } from './consistency.js';
import { listCards } from './hilCards.js';
import { readPack, readRecall, resolveArtifact, staleItems } from './handoff.js';
import { checkPlaybook, findPlaybook, stepCatalogue } from './playbook.js';
import { checkQuestions, parseQuestions, questionFile, readConfirmation, unstampedArtifacts } from './questions.js';
import { readReceipt, receiptFreshness } from './reviewReceipts.js';
export const DIRECTIVE_SCHEMA = {
    'run-step': ['kind', 'feature', 'step', 'use', 'phase', 'gate', 'checks', 'pack', 'restate', 'stale'],
    ask: ['kind', 'feature', 'step', 'file', 'open'],
    'present-gate': ['kind', 'feature', 'step', 'card', 'prepare', 'revisions'],
    handoff: ['kind', 'feature', 'step', 'command'],
    parked: ['kind', 'feature', 'reason'],
    done: ['kind', 'feature', 'summary'],
    error: ['kind', 'message'],
};
/** Exactly the declared keys, no more, no fewer. */
export const validateDirective = (d) => {
    if (!d || typeof d !== 'object')
        return ['directive is not an object'];
    const kind = d.kind;
    const allowed = DIRECTIVE_SCHEMA[kind];
    if (!allowed)
        return [`unknown directive kind «${String(kind)}»`];
    const keys = Object.keys(d);
    const errors = keys.filter((k) => !allowed.includes(k)).map((k) => `unexpected key «${k}» in ${kind}`);
    for (const k of allowed)
        if (!(k in d))
            errors.push(`missing key «${k}» in ${kind}`);
    return errors;
};
// ── State and audit ───────────────────────────────────────────────────────────────────────────
const engineDir = (cwd) => path.join(cwd, '.sdd', 'engine');
const stateFile = (cwd, feature) => path.join(engineDir(cwd), `${feature}.state.json`);
export const auditFile = (cwd, feature) => path.join(engineDir(cwd), `${feature}.audit.jsonl`);
export const readState = async (cwd, feature) => {
    const raw = await readFile(stateFile(cwd, feature), 'utf8').catch(() => null);
    return raw ? JSON.parse(raw) : null;
};
const writeState = async (cwd, state) => {
    await mkdir(engineDir(cwd), { recursive: true });
    const tmp = `${stateFile(cwd, state.feature)}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const { rename } = await import('node:fs/promises');
    await rename(tmp, stateFile(cwd, state.feature));
};
export const appendAudit = async (cwd, feature, event) => {
    await mkdir(engineDir(cwd), { recursive: true });
    await appendFile(auditFile(cwd, feature), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
};
export const readAudit = async (cwd, feature) => (await readFile(auditFile(cwd, feature), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
export const startRun = async (cwd, feature, playbookName, values, opts = {}) => {
    if (await readState(cwd, feature))
        return { ok: false, message: `a run for ${feature} already exists (.sdd/engine/${feature}.state.json)` };
    const found = await findPlaybook(cwd, playbookName);
    if (!found)
        return { ok: false, message: `playbook «${playbookName}» not found` };
    const checked = await checkPlaybook(cwd, found.playbook, values);
    if (!checked.ok)
        return { ok: false, message: `playbook does not pass the checker:\n  ${checked.issues.map((i) => `${i.code}: ${i.message}`).join('\n  ')}` };
    const state = {
        schema: 'open-sdd.engine/1',
        feature,
        playbook: checked.name,
        lead: checked.lead,
        autonomous: Boolean(opts.autonomous),
        startedAt: new Date().toISOString(),
        parked: null,
        budget: checked.budget,
        steps: checked.steps.map((s) => ({ id: s.id, phase: s.phase, use: s.use, checks: s.checks, review: s.review, status: s.decision === 'SKIP' ? 'skipped' : 'pending', revisions: 0, reason: s.reason })),
    };
    await writeState(cwd, state);
    await appendAudit(cwd, feature, { event: 'RUN_STARTED', detail: `${checked.name} · ${state.steps.filter((s) => s.status === 'pending').length} steps · ${state.steps.filter((s) => s.review === 'human' && s.status !== 'skipped').length} human gates` });
    return { ok: true, message: `run started for ${feature} with ${checked.name}`, state };
};
const openQuestions = async (cwd, feature, step) => {
    const file = questionFile(cwd, feature, step);
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null)
        return null;
    const open = checkQuestions(parseQuestions(text)).map((i) => i.message);
    const { confirmation, fresh } = await readConfirmation(file);
    if (open.length === 0 && confirmation && fresh)
        return { file, open: [] };
    if (open.length === 0)
        open.push('answers complete but not confirmed: run `open-sdd questions confirm`');
    return { file, open };
};
/** The single next directive. Reads only. */
export const nextDirective = async (cwd, feature) => {
    const state = await readState(cwd, feature);
    if (!state)
        return { kind: 'error', message: `no run for ${feature}: run \`open-sdd engine start ${feature} --playbook <name>\`` };
    if (state.parked)
        return { kind: 'parked', feature, reason: state.parked };
    const rel = (p) => path.relative(cwd, p).split(path.sep).join('/');
    // Stale propagation: a completed step whose consumed inputs changed must run again first.
    for (const s of state.steps.filter((x) => x.status === 'done')) {
        const pack = await readPack(cwd, feature, s.id);
        const stale = pack ? await staleItems(cwd, pack) : [];
        if (stale.length)
            return { kind: 'run-step', feature, step: s.id, use: s.use, phase: s.phase, gate: s.review === 'human', checks: s.checks, pack: rel(path.join(cwd, '.sdd', 'handoff', feature, `${s.id}.json`)), restate: true, stale };
    }
    const s = state.steps.find((x) => x.status !== 'done' && x.status !== 'skipped');
    if (!s)
        return { kind: 'done', feature, summary: { done: state.steps.filter((x) => x.status === 'done').length, skipped: state.steps.filter((x) => x.status === 'skipped').length } };
    if (s.status === 'awaiting') {
        const cards = (await listCards(cwd, feature)).filter((c) => c.card.step === s.id && !c.answer);
        const card = cards.length ? rel(path.join(cwd, '.sdd', 'hil', feature, `${cards[cards.length - 1].card.id}.md`)) : null;
        return { kind: 'present-gate', feature, step: s.id, card, prepare: `open-sdd hil prepare ${feature} --step ${s.id} --card <card.json>`, revisions: s.revisions };
    }
    const q = await openQuestions(cwd, feature, s.id);
    if (q && q.open.length)
        return { kind: 'ask', feature, step: s.id, file: rel(q.file), open: q.open };
    const pack = await readPack(cwd, feature, s.id);
    if (!pack)
        return { kind: 'handoff', feature, step: s.id, command: `open-sdd handoff write ${feature} ${s.id}` };
    return { kind: 'run-step', feature, step: s.id, use: s.use, phase: s.phase, gate: s.review === 'human', checks: s.checks, pack: rel(path.join(cwd, '.sdd', 'handoff', feature, `${s.id}.json`)), restate: true, stale: await staleItems(cwd, pack) };
};
// ── Guards ───────────────────────────────────────────────────────────────────────────────────
const CHECKABLE = /^sdd:(requirements|design|tasks|brief|delta|acceptance|spec|steering|constitution)$/;
const gateGuards = async (cwd, state, step, produced) => {
    const problems = [];
    const type = stepCatalogue().get(step.use);
    const aidlcPresent = existsSync(path.join(cwd, 'aidlc', 'spaces'));
    const located = [];
    for (const artifact of type?.produces ?? []) {
        const checkable = CHECKABLE.test(artifact) || (!artifact.startsWith('sdd:') && aidlcPresent);
        if (!checkable)
            continue;
        const found = await resolveArtifact(cwd, state.feature, artifact);
        if (found.length === 0)
            problems.push(`ARTIFACT_MISSING: declared output «${artifact}» of ${step.id} was not found`);
        located.push(...found);
    }
    for (const p of produced)
        if (!existsSync(path.resolve(cwd, p)))
            problems.push(`ARTIFACT_MISSING: ${p} does not exist`);
    const pack = await readPack(cwd, state.feature, step.id);
    if (pack) {
        const recall = await readRecall(cwd, state.feature, step.id);
        if (!recall)
            problems.push(`RECALL_MISSING: restate goal and acceptance ids first (open-sdd handoff recall ${state.feature} ${step.id} --text "…")`);
        else if (!recall.ok)
            problems.push(`RECALL_MISMATCH: missing ${recall.missing.join(', ') || '—'}; unexpected ${recall.extra.join(', ') || '—'}${recall.goalRestated ? '' : '; step not named'}`);
    }
    const qFile = questionFile(cwd, state.feature, step.id);
    if (existsSync(qFile)) {
        const { confirmation, fresh } = await readConfirmation(qFile);
        if (!confirmation)
            problems.push('QUESTIONS_UNCONFIRMED: answers exist but were never confirmed');
        else if (!fresh)
            problems.push('QUESTIONS_CHANGED: the answers changed after confirmation');
        else {
            const unstamped = await unstampedArtifacts(cwd, [...produced, ...located], confirmation.id);
            for (const u of unstamped)
                problems.push(`UNSTAMPED_ARTIFACT: ${u} lacks "Confirmation: ${confirmation.id}"`);
        }
    }
    const receipt = await readReceipt(cwd, state.feature, step.id);
    if (receipt) {
        const f = await receiptFreshness(cwd, receipt);
        if (!f.fresh)
            problems.push(`RECEIPT_STALE: ${f.tampered ? 'receipt tampered; ' : ''}${[...f.changedArtifacts, ...f.changedSources].slice(0, 5).join(', ')} changed after review`);
    }
    return problems;
};
/** Traceability at a phase boundary: an orphan requirement or a phantom id blocks. */
export const phaseTrace = async (cwd, feature) => {
    if (!existsSync(path.join(cwd, '.sdd', 'specs', feature, 'requirements.md')))
        return { inspected: false, problems: [] };
    const report = await checkConsistency({ cwd, feature, changedFiles: [] });
    const problems = report.findings
        .filter((f) => f.severity === 'error' && ['PHANTOM_REQUIREMENT_ID', 'REQUIREMENT_WITHOUT_TASK', 'REQUIREMENT_NOT_IN_PLAN'].includes(f.code))
        .map((f) => `${f.code}: ${f.message}`);
    return { inspected: true, problems };
};
const isLastOfPhase = (state, step) => state.steps.filter((s) => s.phase === step.phase && s.status !== 'skipped').every((s) => s.id === step.id || s.status === 'done');
const complete = async (cwd, state, step, event, by) => {
    if (isLastOfPhase(state, step)) {
        const trace = await phaseTrace(cwd, state.feature);
        if (trace.problems.length) {
            await appendAudit(cwd, state.feature, { event: 'PHASE_TRACE_FAILED', step: step.id, detail: trace.problems.join(' | ') });
            return { ok: false, message: `phase «${step.phase}» boundary blocked by the traceability gate:\n  ${trace.problems.join('\n  ')}` };
        }
        await appendAudit(cwd, state.feature, { event: trace.inspected ? 'PHASE_VERIFIED' : 'PHASE_TRACE_NOT_INSPECTED', step: step.id, detail: step.phase });
    }
    step.status = 'done';
    await writeState(cwd, state);
    await appendAudit(cwd, state.feature, { event, step: step.id, by });
    return { ok: true, message: `${step.id} → done` };
};
export const report = async (cwd, feature, stepId, result, opts = {}) => {
    const state = await readState(cwd, feature);
    if (!state)
        return { ok: false, message: `no run for ${feature}` };
    if (result === 'park' || result === 'unpark') {
        state.parked = result === 'park' ? opts.reason ?? 'parked' : null;
        await writeState(cwd, state);
        await appendAudit(cwd, feature, { event: result === 'park' ? 'RUN_PARKED' : 'RUN_UNPARKED', detail: opts.reason });
        return { ok: true, message: result === 'park' ? 'run parked' : 'run resumed' };
    }
    const step = state.steps.find((s) => s.id === stepId);
    if (!step)
        return { ok: false, message: `no step ${stepId} in the run` };
    if (result === 'approved')
        return { ok: false, message: 'approval comes only from a named answer: `open-sdd hil answer <feature> <card> <option> --by "<name>"`' };
    const pack = await readPack(cwd, feature, step.id);
    const stale = step.status === 'done' && pack ? (await staleItems(cwd, pack)).length > 0 : false;
    const allowed = {
        started: ['pending', 'revising'],
        'awaiting-approval': ['in-progress', 'revising'],
        rejected: ['awaiting'],
        revised: ['revising'],
        completed: ['in-progress'],
        skipped: ['pending', 'in-progress', 'revising', 'awaiting'],
    };
    if (!(allowed[result].includes(step.status) || (result === 'started' && stale)))
        return { ok: false, message: `cannot report «${result}» for ${step.id} while it is ${step.status}` };
    if (result === 'started') {
        step.status = 'in-progress';
    }
    else if (result === 'awaiting-approval' || result === 'completed') {
        if (result === 'completed' && step.review === 'human')
            return { ok: false, message: `${step.id} is a human gate: report awaiting-approval and answer its card` };
        const problems = await gateGuards(cwd, state, step, opts.produced ?? []);
        if (problems.length) {
            await appendAudit(cwd, feature, { event: 'GATE_REFUSED', step: step.id, detail: problems.join(' | ') });
            return { ok: false, message: `gate refused for ${step.id}:\n  ${problems.join('\n  ')}` };
        }
        if (result === 'completed')
            return complete(cwd, state, step, 'STEP_COMPLETED', opts.by);
        step.status = 'awaiting';
    }
    else if (result === 'rejected') {
        step.status = 'revising';
        step.revisions += 1;
    }
    else if (result === 'revised') {
        step.status = 'awaiting';
    }
    else if (result === 'skipped') {
        step.status = 'skipped';
        step.reason = opts.reason ?? 'skipped by report';
    }
    await writeState(cwd, state);
    await appendAudit(cwd, feature, { event: `STEP_${result.toUpperCase().replace(/-/g, '_')}`, step: step.id, detail: opts.reason, by: opts.by });
    return { ok: true, message: `${step.id} → ${step.status}` };
};
/** Apply a recorded answer to a prepared card. The only path to an approval. */
export const applyDecision = async (cwd, card, answer) => {
    const state = await readState(cwd, card.feature);
    if (!state)
        return { ok: true, message: 'answer recorded (no engine run for this feature)' };
    const step = state.steps.find((s) => s.id === card.step);
    if (!step)
        return { ok: true, message: `answer recorded (step ${card.step} not in the run)` };
    await appendAudit(cwd, card.feature, { event: 'DECISION_RECORDED', step: step.id, detail: `${card.id} ${answer.option} ${answer.effect}`, by: answer.by });
    if (answer.effect === 'park')
        return report(cwd, card.feature, step.id, 'park', { reason: `${card.id}: parked by ${answer.by}` });
    if (answer.effect === 'reject') {
        if (step.status !== 'awaiting')
            return { ok: true, message: 'answer recorded' };
        return report(cwd, card.feature, step.id, 'rejected', { by: answer.by, reason: card.id });
    }
    if (step.status !== 'awaiting')
        return { ok: true, message: `answer recorded; ${step.id} is ${step.status}, not awaiting` };
    if (answer.effect === 'override' && state.autonomous)
        return { ok: false, message: 'override refused in autonomous mode' };
    return complete(cwd, state, step, answer.effect === 'approve' ? 'GATE_APPROVED' : answer.effect === 'override' ? 'GATE_OVERRIDDEN' : 'GATE_ACCEPTED_AS_IS', answer.by);
};
