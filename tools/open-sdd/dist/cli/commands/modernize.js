/**
 * `open-sdd start` and `open-sdd modernize …` (spec `modernize-kit`, v3.8.0).
 *
 *   start "<intent>"            level L0…L6 → playbook → run → first directive (one command for any size)
 *   modernize init|assess|override|waves|plan|wave|advance|event|propose|resolve|learn|rules|status
 *
 * Decisions come from `src/core` (levels, 7 Rs, waves, lifecycle, dynamic rules); this layer reads
 * flags, calls the core and maps the result to text/JSON and an exit code (0 ok, 1 refused, 2 usage).
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT } from './help.js';
import { humanDirective, handleHandoffCommand } from './playbook.js';
import { classifyLevel, LEVELS, ceremonyFor, playbookFor, slugFromIntent, LEVEL_LABEL, effectiveRigor, profileFloor, rigorFloor } from '../../core/levels.js';
import { applyRigor } from '../../core/rigorOverlay.js';
import { detectProfile, profileValues } from '../../core/profile.js';
import { nextDirective, startRun } from '../../core/engine.js';
import { applyEvent, loadRules, readEventRecord, resolveEvent } from '../../core/dynamicRules.js';
import { submitProposal } from '../../core/modernize/proposals.js';
import { learnFromEvent, listCandidates, adoptCandidate } from '../../core/modernize/learn.js';
import { reflect } from '../../core/memoryStore.js';
import { dispositions, MIGRATING, readOverrides, recordOverride, RS } from '../../core/modernize/disposition.js';
import { planWaves } from '../../core/modernize/wavePlan.js';
import { advance, readModState, writeModState, STAGES } from '../../core/modernize/lifecycle.js';
import { modernizeDir, portfolioFile, readPortfolio, riskScore } from '../../core/modernize/portfolio.js';
import { buildStatus, statusHtml, statusMermaid, statusText } from '../../core/modernize/report.js';
import { approverAllowed, confirmOnTty, gitIdentity, isAgentSession, readApprovers } from '../../core/hilIdentity.js';
const TEMPLATES = fileURLToPath(new URL('../../../templates/modernize', import.meta.url));
const BOOLEAN = new Set(['--json', '--dry-run', '--force', '--mermaid', '--html', '--reflect']);
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
const positionals = (args) => {
    const out = [];
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a.startsWith('--')) {
            if (!a.includes('=') && !BOOLEAN.has(a) && args[i + 1] !== undefined && !args[i + 1].startsWith('--'))
                i += 1;
            continue;
        }
        out.push(a);
    }
    return out;
};
const usage = (io, msg) => {
    io.error(`error[usage]: ${msg}`);
    return EXIT.USAGE;
};
const out = (io, json, data, text) => io.log(json ? JSON.stringify(data, null, 2) : Array.isArray(text) ? text.join('\n') : text);
const readJsonFile = async (cwd, file) => JSON.parse(await readFile(path.resolve(cwd, file), 'utf8'));
// ── start ───────────────────────────────────────────────────────────────────────────────────
export const handleStartCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const intent = positionals(args).join(' ').trim();
    if (!intent)
        return usage(io, 'start "<intent>" [--feature f] [--level L0…L6] [--variant greenfield|brownfield] [--rigor tiny-spec|spec-first|spec-anchored|spec-as-code] [--dry-run] [--json]');
    const profile = await detectProfile(cwd);
    const decision = classifyLevel(intent, profile, cwd);
    const forced = flag(args, 'level');
    if (forced && !LEVELS.includes(forced))
        return usage(io, `--level must be one of ${LEVELS.join(', ')}`);
    const level = forced || decision.level;
    const forcedVariant = flag(args, 'variant');
    if (forcedVariant && !['greenfield', 'brownfield'].includes(forcedVariant))
        return usage(io, '--variant must be greenfield or brownfield');
    const variant = forcedVariant || decision.variant;
    const basePlaybook = forced || forcedVariant ? playbookFor(level, intent, profile, variant) : decision.playbook;
    const declared = JSON.parse((await readFile(path.join(cwd, '.sdd', 'settings', 'rigor.json'), 'utf8').catch(() => '{}'))).level;
    const rig = effectiveRigor(level, flag(args, 'rigor'), declared);
    if (flag(args, 'rigor') && rig.warnings.some((w) => w.startsWith('unknown rigor')))
        return usage(io, rig.warnings[0]);
    const ceremony = ceremonyFor(level);
    const feature = flag(args, 'feature') || slugFromIntent(intent);
    const head = [
        `Level ${level} · ${LEVEL_LABEL[level]}${forced ? ` (forced; classifier said ${decision.level})` : ''} · ${variant}${forcedVariant ? ' (forced)' : ` (${decision.variantReason})`} · rigor ${rig.rigor}${rig.rigor !== rigorFloor(level) ? ` (floor ${rigorFloor(level)})` : ''} → playbook ${basePlaybook} · ceremony ${ceremony} · profile ≥ ${profileFloor(level)}`,
        ...decision.evidence.map((e) => `  because ${e}`),
        ...decision.raisedBy.map((e) => `  raised: ${e}`),
        ...[...decision.warnings, ...rig.warnings].map((e) => `  ! ${e}`),
    ];
    let playbook = basePlaybook;
    if (args.includes('--dry-run')) {
        out(io, json, { ...decision, level, variant, rigor: rig.rigor, playbook, ceremony, feature }, [...head, `  dry run: open-sdd start "${intent}" --feature ${feature}`]);
        return EXIT.PASSED;
    }
    if (playbook === 'modernize' && !existsSync(portfolioFile(cwd))) {
        out(io, json, { ...decision, level, playbook, next: 'open-sdd modernize init' }, [...head, '  A modernization starts from the portfolio: open-sdd modernize init  (then assess → waves → plan)']);
        return EXIT.PASSED;
    }
    const overlay = await applyRigor(cwd, feature, basePlaybook, rig.rigor, profileValues(profile));
    playbook = overlay.playbook;
    if (overlay.added.length)
        head.push(`  rigor ${rig.rigor} adds: ${overlay.added.join(', ')}`);
    for (const sk of overlay.skipped)
        head.push(`  rigor skip ${sk.id}: ${sk.reason}`);
    if (basePlaybook === 'reverse-engineering')
        head.push('  reverse engineering: open-sdd reverse init, then open-sdd reverse status');
    const r = await startRun(cwd, feature, playbook, profileValues(profile), { level, ceremony });
    if (!r.ok) {
        io.error(r.message);
        return EXIT.GATE_FAILED;
    }
    let d = await nextDirective(cwd, feature);
    if (d.kind === 'handoff') {
        await handleHandoffCommand(['write', feature, d.step, '--json'], { ...io, log: () => { } }, cwd);
        d = await nextDirective(cwd, feature);
    }
    out(io, json, { ...decision, level, variant, rigor: rig.rigor, playbook, basePlaybook, ceremony, feature, overlay, directive: d }, [...head, `Run ${feature} started.`, humanDirective(d)]);
    return EXIT.PASSED;
};
// ── modernize ───────────────────────────────────────────────────────────────────────────────
const loadAll = async (cwd) => {
    const p = await readPortfolio(cwd);
    if (!p.ok || !p.portfolio)
        return { errors: p.errors };
    const ds = dispositions(p.portfolio, await readOverrides(cwd));
    return { portfolio: p.portfolio, ds, errors: [] };
};
const identityChecks = async (cwd, args, id) => {
    const ident = gitIdentity(cwd);
    const by = flag(args, 'by') ?? '';
    if (!by.trim())
        return { ok: false, message: 'a person must be named: --by "<name>"', by, email: ident.email };
    if (!approverAllowed(await readApprovers(cwd), by, ident))
        return { ok: false, message: `APPROVER_NOT_LISTED: «${by}» is not in .sdd/settings/approvers.json`, by, email: ident.email };
    if (isAgentSession() && !confirmOnTty(id))
        return { ok: false, message: `AGENT_SESSION: an agent cannot adopt ${id}; a person adopts it from their own terminal`, by, email: ident.email };
    return { ok: true, message: '', by, email: ident.email };
};
export const handleModernizeCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, a1, a2] = positionals(args);
    if (sub === 'init') {
        const dest = portfolioFile(cwd);
        if (existsSync(dest) && !args.includes('--force')) {
            io.error(`${path.relative(cwd, dest)} exists (use --force to replace it)`);
            return EXIT.GATE_FAILED;
        }
        const example = flag(args, 'example');
        if (example && example !== 'banking')
            return usage(io, '--example banking is the only shipped example');
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(path.join(TEMPLATES, example ? 'portfolio.banking.json' : 'portfolio.template.json'), dest);
        out(io, json, { written: path.relative(cwd, dest) }, [`wrote ${path.relative(cwd, dest)}${example ? ' (banking example)' : ''}`, '  next: edit it, then open-sdd modernize assess']);
        return EXIT.PASSED;
    }
    if (sub === 'assess') {
        const all = await loadAll(cwd);
        if (!('portfolio' in all) || !all.portfolio) {
            io.error(all.errors.join('\n'));
            return EXIT.GATE_FAILED;
        }
        const risks = all.portfolio.components.map((c) => riskScore(c, all.portfolio.components));
        await mkdir(modernizeDir(cwd), { recursive: true });
        await writeFile(modernizeDir(cwd, 'assessment.json'), `${JSON.stringify({ portfolio: all.portfolio.name, risks }, null, 2)}\n`, 'utf8');
        await writeFile(modernizeDir(cwd, 'dispositions.json'), `${JSON.stringify(all.ds, null, 2)}\n`, 'utf8');
        const count = RS.map((r) => `${r} ${all.ds.filter((d) => d.r === r).length}`).join(' · ');
        out(io, json, { risks, dispositions: all.ds }, [
            `Portfolio ${all.portfolio.name}: ${all.portfolio.components.length} components · ${count}`,
            ...all.ds.map((d) => `  ${d.id.padEnd(22)} ${d.r.padEnd(11)} risk ${String(risks.find((x) => x.id === d.id).score).padStart(3)}  ${d.rule}: ${d.reason}`),
            '  wrote .sdd/modernize/assessment.json and dispositions.json · next: open-sdd modernize waves',
        ]);
        return EXIT.PASSED;
    }
    if (sub === 'override') {
        const r = a2;
        if (!a1 || !RS.includes(r))
            return usage(io, `modernize override <component> <${RS.join('|')}> --by "<name>" --reason "<why>"`);
        const all = await loadAll(cwd);
        if (!('portfolio' in all) || !all.portfolio)
            return usage(io, all.errors.join('; '));
        if (!all.portfolio.components.some((c) => c.id === a1))
            return usage(io, `unknown component ${a1}`);
        const by = flag(args, 'by') ?? '';
        const reason = flag(args, 'reason') ?? '';
        if (!by || !reason)
            return usage(io, 'an override needs --by "<name>" and --reason "<why>"');
        await recordOverride(cwd, { id: a1, r, by, reason, at: new Date().toISOString() });
        out(io, json, { id: a1, r, by }, `${a1} → ${r} (override by ${by}): run modernize assess and waves again`);
        return EXIT.PASSED;
    }
    if (sub === 'waves') {
        const all = await loadAll(cwd);
        if (!('portfolio' in all) || !all.portfolio) {
            io.error(all.errors.join('\n'));
            return EXIT.GATE_FAILED;
        }
        const plan = planWaves(all.portfolio, all.ds, { max: Number(flag(args, 'max') ?? 3) || 3 });
        if (plan.error) {
            io.error(plan.error);
            return EXIT.GATE_FAILED;
        }
        await mkdir(modernizeDir(cwd), { recursive: true });
        await writeFile(modernizeDir(cwd, 'waves.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
        out(io, json, plan, [
            ...plan.waves.map((w) => `  wave ${w.n} · ${w.kind.padEnd(11)} ${w.components.join(', ')}  — ${w.reasons.join('; ')}`),
            ...plan.retained.map((t) => `  retained ${t.id}${t.hybridDependents.length ? ` (hybrid: ${t.hybridDependents.join(', ')})` : ''}`),
            ...plan.warnings.map((x) => `  ! ${x}`),
            '  wrote .sdd/modernize/waves.json · next: open-sdd modernize plan <feature>',
        ]);
        return EXIT.PASSED;
    }
    if (sub === 'plan') {
        if (!a1)
            return usage(io, 'modernize plan <feature>');
        const all = await loadAll(cwd);
        if (!('portfolio' in all) || !all.portfolio)
            return usage(io, all.errors.join('; '));
        const plan = JSON.parse((await readFile(modernizeDir(cwd, 'waves.json'), 'utf8').catch(() => 'null')));
        if (!plan)
            return usage(io, 'no wave plan: run open-sdd modernize waves first');
        const inWaves = plan.waves.flatMap((w) => w.components);
        const units = inWaves.map((id) => ({ id, deps: (all.portfolio.components.find((c) => c.id === id)?.dependsOn ?? []).filter((d) => inWaves.includes(d)) }));
        const r = await startRun(cwd, a1, 'modernize', profileValues(await detectProfile(cwd)), { level: 'L6', ceremony: 'strict', units, waves: plan.waves.map((w) => w.components) });
        if (!r.ok) {
            io.error(r.message);
            return EXIT.GATE_FAILED;
        }
        const ms = await readModState(cwd);
        ms.feature = a1;
        await writeModState(cwd, ms);
        out(io, json, { feature: a1, units: units.length, waves: plan.waves.length }, [`Run ${a1} started: L6 modernization, strict ceremony, ${units.length} units in ${plan.waves.length} waves.`, `  next: open-sdd next ${a1}   ·   start a wave: open-sdd modernize wave ${a1} 1`]);
        return EXIT.PASSED;
    }
    if (sub === 'wave') {
        const n = Number(a2);
        if (!a1 || !Number.isInteger(n) || n < 1)
            return usage(io, 'modernize wave <feature> <n>');
        const plan = JSON.parse((await readFile(modernizeDir(cwd, 'waves.json'), 'utf8').catch(() => 'null')));
        const wave = plan?.waves.find((w) => w.n === n);
        if (!wave)
            return usage(io, `no wave ${n} in .sdd/modernize/waves.json`);
        if (n > 1 && !(await readEventRecord(cwd, a1, `wave-${n - 1}-start`))) {
            io.error(`wave ${n - 1} has not started: waves start in order`);
            return EXIT.GATE_FAILED;
        }
        const res = await applyEvent(cwd, a1, { id: `wave-${n}-start`, type: 'wave-start', at: new Date().toISOString(), source: 'human', title: `wave ${n} (${wave.kind}) starts`, components: wave.components, wave: n, env: 'nonprod', evidence: [`.sdd/modernize/waves.json wave ${n}: ${wave.components.join(', ')}`] });
        out(io, json, res, res.ok ? [`wave ${n} · ${res.code} · ${res.inserted.length} step(s) inserted`, ...res.inserted.map((s) => `  + ${s}`)] : res.messages);
        return res.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'advance') {
        const to = flag(args, 'to');
        if (!a1 || !to)
            return usage(io, 'modernize advance <component> --to <stage> [--metrics file] [--by name] [--feature f]');
        const all = await loadAll(cwd);
        if (!('portfolio' in all) || !all.portfolio)
            return usage(io, all.errors.join('; '));
        const component = all.portfolio.components.find((c) => c.id === a1);
        if (!component)
            return usage(io, `unknown component ${a1}`);
        const r = all.ds.find((d) => d.id === a1).r;
        const metricsFile = flag(args, 'metrics');
        const metrics = metricsFile ? await readJsonFile(cwd, metricsFile) : undefined;
        const { policy } = await loadRules(cwd);
        const res = await advance(cwd, { component, r, to, by: flag(args, 'by') || gitIdentity(cwd).name || 'unknown', feature: flag(args, 'feature') || undefined, metrics, policy: policy.canary });
        out(io, json, res, `${res.code}: ${res.message}${res.ok ? '' : `\n  stages of ${r}: ${STAGES[r].join(' → ')}`}`);
        return res.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'event') {
        const file = flag(args, 'file');
        if (!a1 || !file)
            return usage(io, 'modernize event <feature> --file event.json');
        const res = await applyEvent(cwd, a1, await readJsonFile(cwd, file));
        out(io, json, res, res.ok
            ? [
                `${res.code}: ${res.decision?.event.id} · ${res.decision?.event.type} · severity ${res.decision?.severity}${res.decision?.deadlineHours ? ` · deadline ${res.decision.deadlineHours} h` : ''}`,
                ...(res.decision ? [...new Set(res.decision.steps.map((s) => s.rule))].map((rule) => `  rule ${rule}`) : []),
                ...res.inserted.map((s) => `  + ${s}`),
                ...res.frozen.map((c) => `  frozen ${c}`),
                ...res.cards.map((c) => `  card ${c} waits for a person (open-sdd hil review ${a1} --html)`),
            ]
            : res.messages);
        return res.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'propose') {
        const file = flag(args, 'file');
        if (!a1 || !file)
            return usage(io, 'modernize propose <feature> --file proposal.json');
        const res = await submitProposal(cwd, a1, await readJsonFile(cwd, file));
        out(io, json, res, [`proposal: ${res.codes.join(', ')}`, ...(res.apply ? [`  re-evaluated: ${res.apply.code} · +${res.apply.inserted.length} step(s)`, ...res.apply.inserted.map((s) => `  + ${s}`)] : [])]);
        return res.codes[0] === 'ADMITTED' ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'resolve') {
        const id = flag(args, 'event');
        if (!a1 || !id)
            return usage(io, 'modernize resolve <feature> --event <id>');
        const res = await resolveEvent(cwd, a1, id);
        out(io, json, res, res.message);
        return res.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'learn') {
        const id = flag(args, 'event');
        if (!a1 || !id)
            return usage(io, 'modernize learn <feature> --event <id> [--reflect]');
        const res = await learnFromEvent(cwd, a1, id);
        if (!res.ok || !res.reflection) {
            io.error(res.message);
            return EXIT.GATE_FAILED;
        }
        const memory = args.includes('--reflect') ? await reflect(cwd, res.reflection) : null;
        out(io, json, { ...res, memory }, [
            res.message,
            ...(memory ? [`  memory: ${memory.outcome}${memory.id ? ` ${memory.id}` : ''}${memory.issues.length ? ` (${memory.issues.map((i) => i.code).join(', ')})` : ''}`] : ['  add --reflect to send the reflection to the memory pipeline']),
            ...(res.candidate ? [`  rule candidate ${res.candidate.id}: open-sdd modernize rules adopt ${res.candidate.id} --by "<name>"`] : []),
        ]);
        return EXIT.PASSED;
    }
    if (sub === 'rules') {
        if (!a1 || a1 === 'list') {
            const { rules, errors } = await loadRules(cwd);
            const cands = await listCandidates(cwd);
            out(io, json, { rules, candidates: cands, errors }, [
                ...rules.map((r) => `  ${String(r.priority).padStart(3)} ${r.id.padEnd(28)} on ${r.on.padEnd(18)} when ${r.when}`),
                ...cands.map((c) => `  candidate ${c.id}${c.adopted ? ` (adopted by ${c.adopted.by})` : ''} — seen in ${(c.seen ?? []).join(', ')}`),
                ...errors.map((e) => `  ! ${e}`),
            ]);
            return errors.length ? EXIT.GATE_FAILED : EXIT.PASSED;
        }
        if (a1 === 'adopt') {
            if (!a2)
                return usage(io, 'modernize rules adopt <candidate-id> --by "<name>" [--confirm <candidate-id>]');
            const who = await identityChecks(cwd, args, a2);
            if (!who.ok) {
                io.error(who.message);
                return EXIT.GATE_FAILED;
            }
            const res = await adoptCandidate(cwd, a2, { name: who.by, email: who.email });
            out(io, json, res, res.message);
            return res.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
        }
        return usage(io, 'modernize rules [list|adopt <id>]');
    }
    if (sub === 'status') {
        const s = await buildStatus(cwd);
        if (s.errors.length) {
            io.error(s.errors.join('\n'));
            return EXIT.GATE_FAILED;
        }
        if (args.includes('--mermaid')) {
            io.log(statusMermaid(s));
            return EXIT.PASSED;
        }
        if (args.includes('--html')) {
            const dest = flag(args, 'out') || '.sdd/modernize/status.html';
            await mkdir(path.dirname(path.resolve(cwd, dest)), { recursive: true });
            await writeFile(path.resolve(cwd, dest), statusHtml(s), 'utf8');
            out(io, json, { file: dest }, `wrote ${dest}`);
            return EXIT.PASSED;
        }
        out(io, json, s, statusText(s));
        return EXIT.PASSED;
    }
    return usage(io, 'modernize <init|assess|override|waves|plan|wave|advance|event|propose|resolve|learn|rules|status>');
};
export { MIGRATING };
