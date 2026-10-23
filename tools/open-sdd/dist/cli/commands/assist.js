/**
 * `open-sdd assist [discover|brief|ears|steering|constitution]` — one front door to the assistants
 * (spec `variants-reverse`, REQ-VR-006…008). Without a subcommand it says which assistant helps now.
 * EARS conversion and the constitution delegate to the existing engines (`earsAssistant`, `brownfield
 * specify|requirements|constitution`); discovery and steering drafts live in `core/guidedAssistants.ts`.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EXIT } from './help.js';
import { handleBrownfieldCommand } from './brownfield.js';
import { convertStatement } from '../../core/earsConvert.js';
import { composeBrief, draftSteering, planDiscovery, suggestAssistants, writeDiscovery } from '../../core/guidedAssistants.js';
import { slugFromIntent } from '../../core/levels.js';
const BOOL = new Set(['--json', '--write', '--force', '--draft', '--interview']);
const flag = (args, name) => {
    const at = args.indexOf(`--${name}`);
    if (at < 0)
        return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const n = args[at + 1];
    return n === undefined || n.startsWith('--') ? '' : n;
};
const positionals = (args) => {
    const out = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i].startsWith('--')) {
            if (!BOOL.has(args[i]) && !args[i].includes('=') && args[i + 1] !== undefined && !args[i + 1].startsWith('--'))
                i += 1;
            continue;
        }
        out.push(args[i]);
    }
    return out;
};
/** Sentences or bullet lines of a free-text description. */
export const splitStatements = (text) => text
    .split(/\r?\n|(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((s) => s.length > 3);
export const handleAssistCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const [sub, ...rest] = positionals(args);
    const show = (data, text) => io.log(json ? JSON.stringify(data, null, 2) : text.join('\n'));
    if (!sub) {
        const s = await suggestAssistants(cwd);
        show(s, ['Assistants that help now:', ...s.map((x) => `  ${x.assistant.padEnd(13)} ${x.why}\n                ${x.command}`)]);
        return EXIT.PASSED;
    }
    if (sub === 'discover') {
        const idea = rest.join(' ').trim();
        if (!idea)
            return (io.error('error[usage]: assist discover "<idea>" [--feature f] [--force]'), EXIT.USAGE);
        const feature = flag(args, 'feature') || slugFromIntent(idea);
        const plan = await planDiscovery(cwd, feature, idea);
        if (plan.decision.level === 'L0') {
            show({ level: 'L0' }, ['L0 tiny: no discovery needed — write the three-line tiny spec (open-sdd start "' + idea + '")']);
            return EXIT.PASSED;
        }
        const wrote = await writeDiscovery(plan, args.includes('--force'));
        show({ feature, file: path.relative(cwd, plan.file), roles: plan.roles, questions: plan.questions.map((q) => ({ id: q.id, role: q.role, title: q.title })), written: wrote }, [
            `Discovery for ${feature}: level ${plan.decision.level} · ${plan.decision.variant} · ${plan.questions.length} question(s) from ${plan.roles.join(', ')}`,
            ...plan.questions.map((q) => `  ${q.id} [${q.role}] ${q.title}`),
            wrote ? `  wrote ${path.relative(cwd, plan.file)} — answer it, then: open-sdd assist brief ${feature} --write` : `  ${path.relative(cwd, plan.file)} exists (use --force to regenerate)`,
        ]);
        return EXIT.PASSED;
    }
    if (sub === 'brief') {
        const feature = rest[0];
        if (!feature)
            return (io.error('error[usage]: assist brief <feature> [--write]'), EXIT.USAGE);
        const r = await composeBrief(cwd, feature, { write: args.includes('--write') });
        show(r, r.brief ? [r.ok ? `brief ready${args.includes('--write') ? `: ${path.relative(cwd, r.file)}` : ' (add --write)'}` : 'brief not ready:', ...r.issues.map((i) => `  - ${i}`), ...(args.includes('--write') ? [] : ['', r.brief])] : r.issues.map((i) => `  - ${i}`));
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'ears') {
        if (rest[0] === 'review') {
            if (!rest[1])
                return (io.error('error[usage]: assist ears review <feature>'), EXIT.USAGE);
            return handleBrownfieldCommand(['requirements', rest[1], '--suggest', ...(json ? ['--json'] : [])], io, cwd);
        }
        const text = rest.join(' ').trim();
        if (!text)
            return (io.error('error[usage]: assist ears "<free text>" [--feature f --area A --write] | assist ears review <feature>'), EXIT.USAGE);
        const feature = flag(args, 'feature');
        if (feature && args.includes('--write'))
            return handleBrownfieldCommand(['specify', feature, text, '--write', ...(flag(args, 'area') ? ['--area', flag(args, 'area')] : []), ...(json ? ['--json'] : [])], io, cwd);
        const rows = splitStatements(text).map((s) => convertStatement(s, { system: flag(args, 'system') || undefined }));
        const ok = rows.filter((r) => r.proposal).length;
        show({ converted: ok, total: rows.length, rows }, [
            ...rows.flatMap((r) => [`• ${r.input}`, ...(r.proposal ? [`    → ${r.proposal}  [${r.pattern}]`] : r.questions.map((q) => `    ? ${q}`))]),
            `  ${ok}/${rows.length} converted; answer the questions and run again${feature ? ` · write: open-sdd assist ears "<text>" --feature ${feature} --write` : ''}`,
        ]);
        return ok === rows.length ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    if (sub === 'steering') {
        const d = await draftSteering(cwd);
        const dir = path.join(cwd, '.sdd', 'steering');
        const written = [];
        if (args.includes('--write')) {
            await mkdir(dir, { recursive: true });
            for (const f of d.files) {
                if (existsSync(path.join(dir, f.name)) && !args.includes('--force'))
                    continue;
                await writeFile(path.join(dir, f.name), f.content, 'utf8');
                written.push(f.name);
            }
        }
        show({ ...d, written }, [
            ...d.files.map((f) => `  ${f.name.padEnd(13)} ${f.inferred} inferred · ${f.questions} question(s)${written.includes(f.name) ? ' · written' : ''}`),
            args.includes('--write') ? '  confirm or correct each (inferred) and answer each [NEEDS CLARIFICATION]; then: open-sdd steering check' : '  plan only: add --write (existing files are kept unless --force)',
        ]);
        return EXIT.PASSED;
    }
    if (sub === 'constitution') {
        const mode = args.includes('--interview') ? '--interview' : '--draft';
        return handleBrownfieldCommand(['constitution', '.', mode, ...args.filter((a) => ['--write', '--json'].includes(a))], io, cwd);
    }
    io.error('error[usage]: assist [discover|brief|ears|steering|constitution]');
    return EXIT.USAGE;
};
