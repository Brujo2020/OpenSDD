/**
 * `open-sdd estimate <feature> [--sow [--write]] [--json]`: esfuerzo P50/P90 y calendario desde la spec;
 * con `--sow`, un borrador de alcance para una oferta. Lee; solo escribe `sow.md` con `--write`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { colors, formatHeading } from '../ui/colors.js';
import { planClarify } from '../../core/clarify.js';
import { estimateFromTasks, loadEstimateSettings, renderSow } from '../../core/estimate.js';
import { loadRigorSettings } from '../../core/rigor.js';
import { resolveSddDir } from '../../core/specManager.js';
export const handleEstimateCommand = async (args, io, cwd) => {
    const feature = args.find((a) => !a.startsWith('-'));
    if (!feature) {
        io.error('usage: open-sdd estimate <feature> [--sow [--write]] [--json]');
        return 2;
    }
    const sddDir = await resolveSddDir(cwd);
    const specDir = path.join(cwd, sddDir, 'specs', feature);
    const tasksMarkdown = await readFile(path.join(specDir, 'tasks.md'), 'utf8').catch(() => null);
    if (tasksMarkdown === null) {
        io.error(`no hay tasks.md para "${feature}": la estimación sale de las tareas (crea las tareas primero).`);
        return 1;
    }
    const rigor = (await loadRigorSettings(cwd, sddDir)).level;
    const clarify = await planClarify({ cwd, feature, max: 50 });
    const { settings, source } = await loadEstimateSettings(cwd, sddDir);
    const estimate = estimateFromTasks({ feature, tasksMarkdown, rigor, openQuestions: clarify.questions.length, settings, settingsSource: source });
    if (args.includes('--sow')) {
        const requirements = (await readFile(path.join(specDir, 'requirements.md'), 'utf8').catch(() => '')) ?? '';
        const brief = await readFile(path.join(specDir, 'brief.md'), 'utf8').catch(() => null);
        const log = (await readFile(path.join(specDir, 'discovery.log.md'), 'utf8').catch(() => '')) ?? '';
        const assumptions = [...log.matchAll(/·\s*(assumption|kill)\s*·\s*(.+)$/gm)].map((m) => (m[1] === 'kill' ? `Excluido: ${m[2]}` : m[2]));
        const sow = renderSow({ estimate, requirements, brief, assumptions, openQuestions: clarify.questions.map((q) => q.question) });
        if (args.includes('--write')) {
            await mkdir(specDir, { recursive: true });
            await writeFile(path.join(specDir, 'sow.md'), sow, 'utf8');
            io.log(`${colors.green('✓')} ${path.posix.join(sddDir, 'specs', feature, 'sow.md')} escrito (borrador: revísalo antes de enviarlo)`);
        }
        else {
            io.log(sow);
        }
        return 0;
    }
    if (args.includes('--json')) {
        io.log(JSON.stringify(estimate, null, 2));
        return 0;
    }
    io.log('');
    io.log(formatHeading(`Estimación — ${feature}`));
    io.log(`  ${estimate.pendingTasks} tarea(s) pendientes · rigor ${estimate.rigor} · ${estimate.waves} ola(s)`);
    io.log(`  Esfuerzo:    P50 ${colors.bold(`${estimate.p50Hours} h`)} · P90 ${colors.bold(`${estimate.p90Hours} h`)}`);
    io.log(`  Calendario:  P50 ${estimate.calendarDays.p50} d · P90 ${estimate.calendarDays.p90} d ${colors.dim('(las tareas (P) de una ola en paralelo)')}`);
    for (const task of estimate.tasks)
        io.log(colors.dim(`    ${task.id.padEnd(6)} ${String(task.hours).padStart(5)} h  ${task.title.replace(/\s+—\s*(_.*)?$/, '').slice(0, 70)}`));
    for (const note of estimate.notes)
        io.log(`  ${colors.yellow('·')} ${note}`);
    io.log(colors.dim(`  borrador de oferta: open-sdd estimate ${feature} --sow --write`));
    io.log('');
    return 0;
};
