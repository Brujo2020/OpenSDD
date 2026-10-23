import { EXIT } from './help.js';
import { allProgress, progressLine, renderProgress, runProgress, saveCheckpoint } from '../../core/where.js';
import { reverseStages } from '../../core/reverse.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
export const handleWhereCommand = async (args, io, cwd) => {
    const feature = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--note');
    const at = args.indexOf('--note');
    const note = at >= 0 ? args[at + 1] : undefined;
    const runs = feature ? [await runProgress(cwd, feature)].filter(Boolean) : await allProgress(cwd);
    if (feature && !runs.length) {
        io.error(`no run for ${feature}`);
        return EXIT.GATE_FAILED;
    }
    const ps = runs;
    if (args.includes('--line')) {
        io.log(progressLine(ps));
        return EXIT.PASSED;
    }
    const saved = args.includes('--save') ? await saveCheckpoint(cwd, ps, note) : null;
    const reverse = existsSync(path.join(cwd, '.sdd', 'reverse', 'inventory.json')) ? await reverseStages(cwd, feature) : null;
    if (args.includes('--json')) {
        io.log(JSON.stringify({ runs: ps, reverse: reverse && { current: reverse.current, stages: reverse.stages.map((s) => ({ id: s.id, done: s.done, metric: s.metric })) }, saved }, null, 2));
        return EXIT.PASSED;
    }
    io.log([
        ...(ps.length ? ps.flatMap((p) => [...renderProgress(p), '']) : ['no runs: open-sdd start "<intent>"']),
        ...(reverse ? [`reverse engineering: ${reverse.stages.filter((s) => s.done).length}/6 stages${reverse.current ? ` · open ${reverse.current.id} ${reverse.current.name} (${reverse.current.metric})` : ' · complete'}`] : []),
        ...(saved ? [`checkpoint saved: ${saved.md} (resume from it in any session)`] : ['save where we are: open-sdd where --save [--note "…"]']),
    ].join('\n'));
    return EXIT.PASSED;
};
