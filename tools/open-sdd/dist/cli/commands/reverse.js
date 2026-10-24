import { EXIT } from './help.js';
import { confirmRule, initInventory, reverseStages } from '../../core/reverse.js';
import { approverAllowed, confirmOnTty, gitIdentity, isAgentSession, readApprovers } from '../../core/hilIdentity.js';
const flag = (args, name) => {
    const at = args.indexOf(`--${name}`);
    if (at < 0)
        return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const next = args[at + 1];
    return next === undefined || next.startsWith('--') ? '' : next;
};
const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
export const handleReverseCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const sub = args[0];
    const show = (data, text) => io.log(json ? JSON.stringify(data, null, 2) : text.join('\n'));
    if (sub === 'init') {
        const r = await initInventory(cwd, { scope: list(flag(args, 'scope')), critical: list(flag(args, 'critical')) });
        show(r, [`inventory: ${r.inventory.modules.length} module(s)${r.added.length ? `; added ${r.added.join(', ')}` : ''}`, ...r.inventory.modules.map((m) => `  ${m.critical ? '★' : ' '} ${m.id.padEnd(20)} ${m.path} (${m.files ?? '?'} files)`), ...r.unknown.map((u) => `  ! no module ${u} found`), '  next: open-sdd reverse status']);
        return r.unknown.length ? EXIT.GATE_FAILED : EXIT.PASSED;
    }
    if (sub === 'status' || sub === 'next') {
        const feature = flag(args, 'feature') || undefined;
        const r = await reverseStages(cwd, feature);
        if (sub === 'next') {
            show(r.current ?? { done: true }, r.current ? [`${r.current.id} ${r.current.name} (${r.current.metric})`, ...r.current.unmet.map((u) => `  - ${u}`), `  next: ${r.current.next}`] : ['reverse engineering complete: every stage done']);
            return EXIT.PASSED;
        }
        if (args.includes('--mermaid')) {
            io.log(['flowchart LR', '  classDef done fill:#dcfce7,stroke:#15803d,color:#0b3a1c', '  classDef open fill:#fef3c7,stroke:#b45309,color:#4a2a00', ...r.stages.map((s) => `  ${s.id.replace('-', '')}["${s.id} ${s.name}<br/>${s.metric}"]:::${s.done ? 'done' : 'open'}`), ...r.stages.slice(1).map((s, i) => `  ${r.stages[i].id.replace('-', '')} --> ${s.id.replace('-', '')}`)].join('\n'));
            return EXIT.PASSED;
        }
        show(r, r.stages.map((s) => `  ${s.done ? '✓' : '·'} ${s.id} ${s.name.padEnd(17)} ${s.metric}${s.done ? '' : `\n      ${s.unmet.slice(0, 4).join('\n      ')}`}`));
        return EXIT.PASSED;
    }
    if (sub === 'confirm') {
        const id = args[1];
        const by = flag(args, 'by') ?? '';
        if (!id || !by) {
            io.error('error[usage]: reverse confirm <RULE-ID> --by "<name>" [--confirm <RULE-ID>]');
            return EXIT.USAGE;
        }
        const ident = gitIdentity(cwd);
        if (!approverAllowed(await readApprovers(cwd), by, ident)) {
            io.error(`APPROVER_NOT_LISTED: «${by}» is not in .sdd/settings/approvers.json for this git identity`);
            return EXIT.GATE_FAILED;
        }
        if (isAgentSession() && !confirmOnTty(id)) {
            io.error(`AGENT_SESSION: an agent cannot confirm ${id}; a person confirms it from their own terminal`);
            return EXIT.GATE_FAILED;
        }
        const r = await confirmRule(cwd, id, by);
        show(r, [r.message]);
        return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
    }
    io.error('error[usage]: reverse <init|status|next|confirm>');
    return EXIT.USAGE;
};
