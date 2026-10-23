/**
 * `decide` — the fifth verb (REQ-SX-004). It decides nothing itself: it surfaces every decision that
 * is waiting for a person, with the exact command to resolve it, and routes an answer to `hil`.
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { EXIT } from './help.js';
import { listRuns, readState } from '../../core/engine.js';
import { listCards } from '../../core/hilCards.js';
import { handleHilCommand } from './playbook.js';
export const pendingDecisions = async (cwd) => {
    const out = [];
    const withCard = new Set();
    const features = (await readdir(path.join(cwd, '.sdd', 'hil'), { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    for (const feature of features) {
        for (const { card, answer } of await listCards(cwd, feature)) {
            withCard.add(`${feature}/${card.step}`);
            if (answer)
                continue;
            out.push({
                feature,
                kind: 'card',
                id: card.id,
                question: card.question,
                command: `open-sdd decide ${feature} ${card.id} <${card.options.map((o) => o.key).join('|')}> --by "<name>"`,
            });
        }
    }
    for (const run of await listRuns(cwd)) {
        const state = await readState(cwd, run.feature);
        for (const step of state?.steps ?? []) {
            if (step.status !== 'awaiting' || withCard.has(`${run.feature}/${step.id}`))
                continue;
            out.push({
                feature: run.feature,
                kind: 'gate',
                id: step.id,
                question: step.reason ?? 'human gate waiting for its decision card',
                command: `open-sdd next ${run.feature}`,
            });
        }
    }
    return out;
};
export const handleDecideCommand = async (args, io, cwd) => {
    const json = args.includes('--json');
    const VALUE_FLAGS = new Set(['--by', '--confirm']);
    const positional = [];
    const flags = [];
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (VALUE_FLAGS.has(a)) {
            flags.push(a, args[i + 1] ?? '');
            i += 1;
        }
        else if (a.startsWith('--'))
            flags.push(a);
        else
            positional.push(a);
    }
    const [feature, card, option] = positional;
    if (feature && card && option)
        return handleHilCommand(['answer', feature, card, option, ...flags], io, cwd);
    if (feature && card) {
        io.error(`decide ${feature} ${card} needs the option: open-sdd decide ${feature} ${card} <option> --by "<name>"`);
        return EXIT.USAGE;
    }
    if (feature)
        return handleHilCommand(['list', feature, ...flags], io, cwd);
    const pending = await pendingDecisions(cwd);
    if (json) {
        io.log(JSON.stringify(pending, null, 2));
        return EXIT.PASSED;
    }
    if (pending.length === 0) {
        io.log('Nada que decidir.');
        return EXIT.PASSED;
    }
    io.log(`${pending.length} decisión(es) esperan a una persona:`);
    for (const d of pending) {
        io.log(`  ${d.feature} · ${d.id} — ${d.question}`);
        io.log(`      ${d.command}`);
    }
    return EXIT.PASSED;
};
