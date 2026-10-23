/**
 * Superficie de consola del ciclo multi-unit (spec `multi-unit-playbooks`, v3.6.0):
 * playbook · engine · next · report --step · handoff · questions · hil · memory · review record|freeze-check
 * · waves --baseline|--verify.
 *
 * Toda la lógica vive en `src/core`; aquí solo se leen flags, se llama al core y se traduce el
 * resultado a texto o JSON y a un código de salida (0 ok, 1 refusado por un gate, 2 uso).
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EXIT } from './help.js';
import { detectProfile, profileValues } from '../../core/profile.js';
import { checkPlaybook, findPlaybook, libraryNames, loadPlaybookFile, stepCatalogue } from '../../core/playbook.js';
import { planPlaybook } from '../../core/playbookPlanner.js';
import { BUILD_TARGETS, buildFor, writeBuilt } from '../../core/playbookBuild.js';
import { improvePlaybook } from '../../core/playbookImprove.js';
import { nextDirective, readState, report, startRun, applyDecision } from '../../core/engine.js';
import { checkRecall, readPack, recordRecall, staleItems, writePack } from '../../core/handoff.js';
import { checkQuestions, confirmQuestions, parseQuestions, questionFile } from '../../core/questions.js';
import { listCards, prepareCard, recordAnswer, thresholdProposals, triggerStats } from '../../core/hilCards.js';
import { capture, listCandidates, listLessons, promote, readInbox, reflect, withdrawByOrigin } from '../../core/memoryStore.js';
import { freezeViolations, recordReview } from '../../core/reviewReceipts.js';
import { finalizeWave, recordBaseline } from '../../core/waveReferee.js';
const flag = (args, name) => {
    const inline = args.find((a) => a.startsWith(`--${name}=`));
    if (inline)
        return inline.slice(name.length + 3);
    const at = args.indexOf(`--${name}`);
    if (at < 0)
        return undefined;
    const next = args[at + 1];
    return next === undefined || next.startsWith('--') ? '' : next;
};
const flags = (args, name) => {
    const out = [];
    args.forEach((a, i) => {
        if (a.startsWith(`--${name}=`))
            out.push(a.slice(name.length + 3));
        else if (a === `--${name}` && args[i + 1] !== undefined && !args[i + 1].startsWith('--'))
            out.push(args[i + 1]);
    });
    return out.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
};
/** Positionals: tokens that are neither flags nor flag values. */
const positionals = (args) => {
    const out = [];
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a.startsWith('--')) {
            if (!a.includes('=') && args[i + 1] !== undefined && !args[i + 1].startsWith('--') && !BOOLEAN.has(a))
                i += 1;
            continue;
        }
        out.push(a);
    }
    return out;
};
const BOOLEAN = new Set(['--json', '--write', '--autonomous', '--changed', '--strict']);
const usage = (io, msg) => {
    io.error(`error[usage]: ${msg}`);
    return EXIT.USAGE;
};
const out = (io, json, data, text) => {
    if (json)
        io.log(JSON.stringify(data, null, 2));
    else
        io.log(Array.isArray(text) ? text.join('\n') : text);
};
const values = async (cwd) => profileValues(await detectProfile(cwd));
// ── playbook ─────────────────────────────────────────────────────────────────────────────────
export const handlePlaybookCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, target] = positionals(args);
    if (sub === 'profile') {
        const p = await detectProfile(cwd);
        out(io, json, p, [`Type: ${p.type} (${p.typeReason})`, ...p.signals.map((s) => `  ${s.id.padEnd(11)} ${String(s.value)}`)]);
        return EXIT.PASSED;
    }
    if (sub === 'list') {
        const names = libraryNames(cwd);
        out(io, json, names, names.map((n) => `  ${n}`));
        return EXIT.PASSED;
    }
    if (sub === 'check' || sub === 'build' || sub === 'improve' || sub === 'save') {
        if (!target)
            return usage(io, `playbook ${sub} <name|file> is required`);
        const found = await findPlaybook(cwd, target);
        if (!found)
            return usage(io, `playbook «${target}» not found`);
        const vals = await values(cwd);
        const checked = await checkPlaybook(cwd, found.playbook, vals);
        if (sub === 'check') {
            out(io, json, checked, [
                `${checked.ok ? 'OK' : 'FAILED'} ${checked.name} (lead ${checked.lead})`,
                ...checked.steps.map((s) => `  ${s.decision.padEnd(7)} ${s.phase}/${s.id} ${s.use} — ${s.reason}`),
                ...checked.issues.map((i) => `  ${i.code}: ${i.message}`),
            ]);
            return checked.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
        }
        if (!checked.ok) {
            io.error(checked.issues.map((i) => `${i.code}: ${i.message}`).join('\n'));
            return EXIT.GATE_FAILED;
        }
        if (sub === 'save') {
            const name = flag(args, 'as') || found.playbook.name;
            const dest = path.join(cwd, '.sdd', 'playbooks', `${name}.playbook.json`);
            await mkdir(path.dirname(dest), { recursive: true });
            await copyFile(found.file, dest);
            out(io, json, { saved: path.relative(cwd, dest) }, `saved ${path.relative(cwd, dest)}`);
            return EXIT.PASSED;
        }
        if (sub === 'build') {
            const t = flag(args, 'target');
            if (!t || !BUILD_TARGETS().includes(t))
                return usage(io, `--target must be one of ${BUILD_TARGETS().join(', ')}`);
            const built = buildFor(t, checked);
            if (built.errors.length) {
                io.error(built.errors.join('\n'));
                return EXIT.GATE_FAILED;
            }
            const written = args.includes('--write') ? await writeBuilt(cwd, built.files) : [];
            out(io, json, { files: built.files.map((f) => f.path), written }, [...built.files.map((f) => `  ${f.path}`), written.length ? `${written.length} file(s) written` : 'plan only: add --write']);
            return EXIT.PASSED;
        }
        const k = Number(flag(args, 'k') ?? 6) || 6;
        const r = await improvePlaybook(cwd, found.playbook, vals, { k });
        out(io, json, r, [`Decision: ${r.decision} · probes ${r.budget.used}/${r.budget.max} · runs ${r.runs}`, ...r.probes.map((p) => `  ${p.verdict} ${p.candidate.id} — ${p.evidence}`), ...r.thresholds.map((t) => `  threshold: ${t}`)]);
        return EXIT.PASSED;
    }
    if (sub === 'plan') {
        const intent = flag(args, 'intent') ?? target;
        if (!intent)
            return usage(io, 'playbook plan "<intent>" is required');
        const r = await planPlaybook(cwd, intent, await detectProfile(cwd));
        const save = flag(args, 'save');
        if (save) {
            const dest = path.join(cwd, '.sdd', 'playbooks', `${save}.playbook.json`);
            await mkdir(path.dirname(dest), { recursive: true });
            const { writeFile } = await import('node:fs/promises');
            await writeFile(dest, `${JSON.stringify({ ...r.proposal, name: save }, null, 2)}\n`, 'utf8');
        }
        out(io, json, r, [
            `Type: ${r.type} (${r.typeReason}) · base ${r.base} · composite ${r.composite}/100 (uncalibrated)`,
            ...r.scores.map((s) => `  ${s.component.padEnd(3)} ${s.band.padEnd(4)} ${s.value} — ${s.evidence}`),
            ...r.rows.map((x) => `  ${x.decision.padEnd(7)} ${x.phase}/${x.id} — ${x.reason}`),
            `Steps ${r.steps} · human gates ${r.humanGates} · nearest ${r.nearest.name} (distance ${r.nearest.distance}${r.nearest.adopted ? ', adopted' : ''})`,
            ...r.questions.map((q) => `  ? ${q}`),
            ...r.issues.map((i) => `  ! ${i}`),
        ]);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    return usage(io, 'playbook <profile|check|plan|build|improve|save|list>');
};
// ── engine / next / report ───────────────────────────────────────────────────────────────────
export const handleEngineCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, feature] = positionals(args);
    if (!feature)
        return usage(io, 'engine <start|status> <feature>');
    if (sub === 'start') {
        const pb = flag(args, 'playbook');
        if (!pb)
            return usage(io, 'engine start needs --playbook <name>');
        const r = await startRun(cwd, feature, pb, await values(cwd), { autonomous: args.includes('--autonomous') });
        out(io, json, r, r.message);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'status') {
        const s = await readState(cwd, feature);
        if (!s) {
            io.error(`no run for ${feature}`);
            return EXIT.GATE_FAILED;
        }
        out(io, json, s, [`${s.feature} · ${s.playbook} · lead ${s.lead}${s.parked ? ` · PARKED: ${s.parked}` : ''}`, ...s.steps.map((x) => `  ${x.status.padEnd(11)} ${x.phase}/${x.id} (${x.review})`)]);
        return EXIT.PASSED;
    }
    return usage(io, 'engine <start|status> <feature>');
};
export const handleNextCommand = async (args, io, cwd) => {
    const [feature] = positionals(args);
    if (!feature)
        return usage(io, 'next <feature> [--json]');
    const d = await nextDirective(cwd, feature);
    if (args.includes('--json'))
        io.log(JSON.stringify(d));
    else
        io.log(`${d.kind}: ${JSON.stringify(d)}`);
    return d.kind === 'error' ? EXIT.GATE_FAILED : EXIT.PASSED;
};
const RESULTS = ['started', 'awaiting-approval', 'rejected', 'revised', 'completed', 'skipped', 'park', 'unpark', 'approved'];
export const handleStepReportCommand = async (args, io, cwd) => {
    const [feature] = positionals(args);
    const step = flag(args, 'step') ?? '';
    const result = flag(args, 'result');
    if (!feature || !result || !RESULTS.includes(result))
        return usage(io, `report <feature> --step <id> --result <${RESULTS.join('|')}>`);
    const r = await report(cwd, feature, step, result, { produced: flags(args, 'produced'), reason: flag(args, 'reason'), by: flag(args, 'by') });
    out(io, args.includes('--json'), r, r.message);
    return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
};
// ── handoff / questions ──────────────────────────────────────────────────────────────────────
export const handleHandoffCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, feature, step] = positionals(args);
    if (!sub || !feature || !step)
        return usage(io, 'handoff <write|recall|check> <feature> <step>');
    if (sub === 'write') {
        const state = await readState(cwd, feature);
        const s = state?.steps.find((x) => x.id === step);
        const use = flag(args, 'use') || s?.use;
        if (!use)
            return usage(io, `step ${step} is not in a run: pass --use <step-type>`);
        const type = stepCatalogue().get(use);
        const r = await writePack(cwd, {
            feature,
            step,
            use,
            consumes: (type?.consumes ?? []).map((c) => c.artifact),
            goal: flag(args, 'goal') || `${step}: ${use}`,
            budget: state?.budget.handoff_tokens ?? 8000,
            openDecisions: flags(args, 'open'),
            runStartedAt: state?.startedAt,
        });
        out(io, json, r.pack, [`pack ${path.relative(cwd, r.file)} · ${r.pack.tokens}/${r.pack.budget} tokens · ${r.pack.items.length} item(s)`, ...r.pack.omitted.map((o) => `  omitted: ${o}`)]);
        return EXIT.PASSED;
    }
    const pack = await readPack(cwd, feature, step);
    if (!pack) {
        io.error(`no pack for ${feature}/${step}: run \`open-sdd handoff write ${feature} ${step}\``);
        return EXIT.GATE_FAILED;
    }
    if (sub === 'recall') {
        const text = flag(args, 'text');
        if (!text)
            return usage(io, 'handoff recall needs --text "<restatement>"');
        const r = checkRecall(pack, text);
        await recordRecall(cwd, feature, step, r);
        if (!r.ok)
            await capture(cwd, { kind: 'recall-mismatch', origin: `recall:${feature}/${step}`, author: 'open-sdd', feature, step, text: `missing ${r.missing.join(',')} extra ${r.extra.join(',')}` });
        out(io, json, r, r.ok ? 'recall OK' : `RECALL_MISMATCH: missing ${r.missing.join(', ') || '—'}; unexpected ${r.extra.join(', ') || '—'}${r.goalRestated ? '' : '; step not named'}`);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'check') {
        const stale = await staleItems(cwd, pack);
        out(io, json, { stale }, stale.length ? stale.map((s) => `STALE: ${s}`) : 'pack fresh');
        return stale.length ? EXIT.GATE_FAILED : EXIT.PASSED;
    }
    return usage(io, 'handoff <write|recall|check> <feature> <step>');
};
export const handleQuestionsCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, feature, step] = positionals(args);
    if (!sub || !feature || !step)
        return usage(io, 'questions <check|confirm> <feature> <step>');
    const file = questionFile(cwd, feature, step);
    if (sub === 'check') {
        const text = await readFile(file, 'utf8').catch(() => null);
        if (text === null) {
            io.error(`no question file ${path.relative(cwd, file)}`);
            return EXIT.GATE_FAILED;
        }
        const issues = checkQuestions(parseQuestions(text));
        out(io, json, issues, issues.length ? issues.map((i) => `${i.code} ${i.id}: ${i.message}`) : 'questions complete');
        return issues.length ? EXIT.GATE_FAILED : EXIT.PASSED;
    }
    if (sub === 'confirm') {
        const by = flag(args, 'by') ?? '';
        if (!by)
            return usage(io, 'questions confirm needs --by "<name>"');
        const r = await confirmQuestions(file, by);
        out(io, json, r, r.ok ? `confirmed ${r.confirmation?.id}` : r.issues.map((i) => `${i.code} ${i.id}: ${i.message}`));
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    return usage(io, 'questions <check|confirm> <feature> <step>');
};
// ── hil ──────────────────────────────────────────────────────────────────────────────────────
export const handleHilCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, feature, id, option] = positionals(args);
    if (!sub || !feature)
        return usage(io, 'hil <prepare|answer|list|stats> <feature>');
    if (sub === 'prepare') {
        const file = flag(args, 'card');
        if (!file)
            return usage(io, 'hil prepare needs --card <card.json>');
        const input = JSON.parse(await readFile(path.resolve(cwd, file), 'utf8'));
        const step = flag(args, 'step') || input.step;
        const state = await readState(cwd, feature);
        const r = await prepareCard(cwd, { ...input, feature, step }, { revisions: state?.steps.find((s) => s.id === step)?.revisions ?? 0 });
        out(io, json, r, r.ok ? `prepared ${r.card?.id} → ${path.relative(cwd, r.file ?? '')}` : r.errors.map((e) => `CARD_INVALID: ${e}`));
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'answer') {
        if (!id || !option)
            return usage(io, 'hil answer <feature> <card-id> <option> --by "<name>"');
        const state = await readState(cwd, feature);
        const r = await recordAnswer(cwd, feature, id, option, flag(args, 'by') ?? '', { autonomous: state?.autonomous, changed: args.includes('--changed') });
        if (!r.ok || !r.card || !r.answer) {
            io.error(r.message);
            return EXIT.GATE_FAILED;
        }
        await capture(cwd, { kind: 'hil-answer', origin: `${feature}/${id}`, author: r.answer.by, feature, step: r.card.step, text: `${r.answer.option} ${r.answer.effect}` });
        const applied = await applyDecision(cwd, r.card, r.answer);
        out(io, json, { answer: r.answer, applied }, [r.message, applied.message]);
        return applied.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    const records = await listCards(cwd, feature);
    if (sub === 'list') {
        out(io, json, records, records.map((r) => `  ${r.card.id} ${r.card.step} ${r.card.trigger} — ${r.answer ? `${r.answer.option} by ${r.answer.by}` : 'OPEN'}`));
        return EXIT.PASSED;
    }
    if (sub === 'stats') {
        const stats = triggerStats(records);
        const proposals = thresholdProposals(stats, Number(flag(args, 'max-useless') ?? 0.5));
        out(io, json, { stats, proposals }, [...stats.map((s) => `  ${JSON.stringify(s)}`), ...proposals.map((p) => `  proposal: ${JSON.stringify(p)}`)]);
        return EXIT.PASSED;
    }
    return usage(io, 'hil <prepare|answer|list|stats> <feature>');
};
// ── memory ───────────────────────────────────────────────────────────────────────────────────
const KINDS = ['gate-block', 'hil-answer', 'human-edit', 'recall-mismatch'];
export const handleMemoryCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, id] = positionals(args);
    if (sub === 'capture') {
        const kind = flag(args, 'kind');
        const text = flag(args, 'text');
        if (!KINDS.includes(kind) || !text)
            return usage(io, `memory capture --kind <${KINDS.join('|')}> --text "<…>" [--origin x] [--by name]`);
        const item = await capture(cwd, { kind, text, origin: flag(args, 'origin') || 'manual', author: flag(args, 'by') || 'unknown', feature: flag(args, 'feature'), step: flag(args, 'step') });
        out(io, json, item, `captured ${item.id}`);
        return EXIT.PASSED;
    }
    if (sub === 'reflect') {
        const file = flag(args, 'file');
        if (!file)
            return usage(io, 'memory reflect --file <reflection.json>');
        const r = await reflect(cwd, JSON.parse(await readFile(path.resolve(cwd, file), 'utf8')));
        out(io, json, r, [`${r.outcome}${r.id ? ` ${r.id}` : ''}`, ...r.issues.map((i) => `  ${i.code}: ${i.message}`)]);
        return r.outcome === 'quarantined' ? EXIT.GATE_FAILED : EXIT.PASSED;
    }
    if (sub === 'promote') {
        if (!id)
            return usage(io, 'memory promote <candidate-id> --by "<name>"');
        const r = await promote(cwd, id, flag(args, 'by') ?? '');
        out(io, json, r, r.message);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'withdraw') {
        const origin = flag(args, 'origin');
        if (!origin)
            return usage(io, 'memory withdraw --origin <id>');
        const removed = await withdrawByOrigin(cwd, origin);
        out(io, json, { removed }, removed.length ? `withdrawn ${removed.join(', ')}` : 'nothing to withdraw');
        return EXIT.PASSED;
    }
    if (sub === 'list') {
        const data = { inbox: await readInbox(cwd), candidates: await listCandidates(cwd), lessons: await listLessons(cwd) };
        out(io, json, data, [`inbox ${data.inbox.length} · candidates ${data.candidates.length} · lessons ${data.lessons.filter((l) => !l.withdrawn).length}`, ...data.lessons.map((l) => `  ${l.id}${l.withdrawn ? ' (withdrawn)' : ''} ${l.stepType} — ${l.cue}`)]);
        return EXIT.PASSED;
    }
    return usage(io, 'memory <capture|reflect|promote|withdraw|list>');
};
// ── review record|freeze-check ───────────────────────────────────────────────────────────────
export const handleReviewReceiptCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, feature, step] = positionals(args);
    if (sub === 'record') {
        if (!feature || !step)
            return usage(io, 'review record <feature> <step> --by "<name>" --artifact <path> [--root <dir>]');
        const r = await recordReview(cwd, { feature, step, reviewer: flag(args, 'by') ?? '', artifacts: flags(args, 'artifact'), roots: flags(args, 'root') });
        out(io, json, r, r.message);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    const staged = [feature, step, ...positionals(args).slice(3)].filter(Boolean);
    const v = await freezeViolations(cwd, staged);
    out(io, json, v, v.length ? v.map((x) => `FROZEN: ${x.file} was reviewed in ${x.feature}/${x.step}; re-review before committing`) : 'no frozen files changed');
    return v.length ? EXIT.GATE_FAILED : EXIT.PASSED;
};
// ── waves --baseline|--verify ────────────────────────────────────────────────────────────────
export const handleWaveRefereeCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [feature] = positionals(args);
    if (!feature)
        return usage(io, 'waves <feature> --baseline <n> --protect <paths> | --verify <n> --check "<cmd>" --units a,b');
    if (flag(args, 'baseline') !== undefined) {
        const wave = Number(flag(args, 'baseline'));
        const snap = await recordBaseline(cwd, feature, wave, flags(args, 'protect'));
        out(io, json, snap, `baseline for wave ${wave}: ${Object.keys(snap).length} protected file(s)`);
        return EXIT.PASSED;
    }
    const wave = Number(flag(args, 'verify'));
    const check = flag(args, 'check');
    if (!check)
        return usage(io, 'waves --verify needs --check "<cmd>"');
    const v = await finalizeWave(cwd, { feature, wave, units: flags(args, 'units').length ? flags(args, 'units') : ['all'], check });
    out(io, json, v, [`wave ${wave}: merge ${v.mergeAllowed ? 'ALLOWED' : 'REFUSED'}`, ...v.units.map((u) => `  ${u.unit} exit ${u.exitCode}`), ...v.tampered.map((t) => `  TAMPERED: ${t}`)]);
    return v.mergeAllowed ? EXIT.PASSED : EXIT.GATE_FAILED;
};
export { loadPlaybookFile };
