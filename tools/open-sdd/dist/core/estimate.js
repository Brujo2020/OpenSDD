/**
 * Estimación determinista desde la especificación (para ofertas y planificación).
 *
 * No es una predicción: es una FÓRMULA declarada sobre lo que la spec ya dice, para que dos personas
 * con la misma spec obtengan el mismo número y puedan discutir los supuestos, no el método.
 *
 *   esfuerzo(tarea) = horasBase × factorRigor × factorAlcance(boundary)
 *   P50 = Σ esfuerzo × (1 + penalización por ambigüedad)
 *   P90 = P50 × factorP90
 *   calendario = Σ por ola del máximo esfuerzo de la ola (las tareas (P) de una ola corren a la vez)
 *
 * Todos los factores son valores por defecto que la organización sustituye en
 * `.sdd/settings/estimate.json`; el resultado lo dice siempre.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTaskDependencyWaves } from './scheduler.js';
import { parseTasksMarkdown } from './specManager.js';
export const DEFAULT_ESTIMATE_SETTINGS = {
    taskHours: 6,
    rigorFactor: { 'tiny-spec': 0.8, 'spec-first': 1, 'spec-anchored': 1.25, 'spec-as-code': 1.5 },
    boundaryFileFactor: 0.15,
    ambiguityPenalty: 0.1,
    ambiguityCap: 0.5,
    p90Factor: 1.6,
    hoursPerDay: 8,
};
const round1 = (n) => Math.round(n * 10) / 10;
export const loadEstimateSettings = async (cwd, sddDir = '.sdd') => {
    const raw = await readFile(path.join(cwd, sddDir, 'settings', 'estimate.json'), 'utf8').catch(() => null);
    if (raw === null)
        return { settings: DEFAULT_ESTIMATE_SETTINGS, source: 'default' };
    const parsed = JSON.parse(raw);
    return {
        settings: {
            ...DEFAULT_ESTIMATE_SETTINGS,
            ...parsed,
            rigorFactor: { ...DEFAULT_ESTIMATE_SETTINGS.rigorFactor, ...(parsed.rigorFactor ?? {}) },
        },
        source: 'project',
    };
};
const taskHours = (task, rigor, s) => {
    const files = task.boundary?.length ?? 0;
    const scope = 1 + Math.max(0, files - 2) * s.boundaryFileFactor;
    return s.taskHours * (s.rigorFactor[rigor] ?? 1) * scope;
};
/** Pura: mismas entradas → mismo número. */
export const estimateFromTasks = (input) => {
    const { settings: s } = input;
    const all = parseTasksMarkdown(input.tasksMarkdown);
    const pending = all.filter((t) => t.status !== 'completed');
    const tasks = pending.map((t) => ({ id: t.id, title: t.title, hours: round1(taskHours(t, input.rigor, s)) }));
    const ambiguity = Math.min(s.ambiguityCap, input.openQuestions * s.ambiguityPenalty);
    const effort = tasks.reduce((sum, t) => sum + t.hours, 0);
    const p50 = effort * (1 + ambiguity);
    const p90 = p50 * s.p90Factor;
    const waves = buildTaskDependencyWaves(all, { maxParallel: Number.MAX_SAFE_INTEGER });
    const byId = new Map(tasks.map((t) => [t.id, t.hours]));
    const criticalHours = waves.reduce((sum, w) => sum + Math.max(0, ...w.tasks.map((t) => byId.get(t.id) ?? 0)), 0) * (1 + ambiguity);
    const notes = [
        input.settingsSource === 'default'
            ? 'Factores por defecto, no calibrados: sustitúyelos por los de tu organización en .sdd/settings/estimate.json.'
            : 'Factores de .sdd/settings/estimate.json.',
    ];
    if (input.openQuestions > 0)
        notes.push(`${input.openQuestions} pregunta(s) de clarify abiertas suman +${Math.round(ambiguity * 100)} %: resolverlas reduce la estimación y el riesgo.`);
    if (pending.length === 0)
        notes.push('No hay tareas pendientes: nada que estimar.');
    return {
        feature: input.feature,
        tasks,
        pendingTasks: pending.length,
        rigor: input.rigor,
        openQuestions: input.openQuestions,
        p50Hours: round1(p50),
        p90Hours: round1(p90),
        calendarDays: { p50: round1(criticalHours / s.hoursPerDay), p90: round1((criticalHours * s.p90Factor) / s.hoursPerDay) },
        waves: waves.length,
        settingsSource: input.settingsSource,
        notes,
    };
};
const section = (title, lines, empty) => ['', `## ${title}`, '', ...(lines.length ? lines : [`- ${empty}`])];
/** Borrador de alcance para una oferta (SOW). Todo sale de la spec; lo que falta se dice. */
export const renderSow = (input) => {
    const e = input.estimate;
    const reqTitles = [...input.requirements.matchAll(/^###\s+(REQ-[A-Z0-9-]+)\s*[—-]\s*(.+)$/gm)].map((m) => `- **${m[1]}** ${m[2].trim()}`);
    const criteria = [...input.requirements.matchAll(/^-\s+((?:When|While|If|Where|The)\b.*shall.*)$/gim)].map((m) => `- ${m[1].trim()}`);
    const nonGoals = input.brief
        ? [...input.brief.matchAll(/^-\s+(.+)$/gm)].map((m) => m[1]).filter((line) => /out of scope|fuera de alcance|non-goal|no-objetivo|sin /i.test(line)).map((l) => `- ${l}`)
        : [];
    return [
        `# Alcance y estimación — ${e.feature}`,
        '',
        '> Borrador generado desde la especificación por `open-sdd estimate --sow`. Revísalo antes de enviarlo: no es un compromiso contractual.',
        ...section('Alcance (requisitos)', reqTitles, 'requirements.md no declara requisitos con id REQ-…'),
        ...section('Fuera de alcance', nonGoals, 'el brief no declara exclusiones: acórdalas antes de ofertar'),
        ...section('Entregables (tareas)', e.tasks.map((t) => `- ${t.id}. ${t.title.replace(/\s+—\s*(_.*)?$/, '')}`), 'no hay tareas pendientes'),
        ...section('Criterios de aceptación', criteria, 'no hay criterios EARS: sin ellos la aceptación es una opinión'),
        ...section('Supuestos', input.assumptions.map((a) => `- ${a}`), 'ninguno declarado'),
        ...section('Preguntas abiertas (riesgo)', input.openQuestions.map((q) => `- ${q}`), 'ninguna'),
        '',
        '## Estimación',
        '',
        `| | P50 | P90 |`,
        `|---|---|---|`,
        `| Esfuerzo (horas) | ${e.p50Hours} | ${e.p90Hours} |`,
        `| Calendario (días, con paralelismo en ${e.waves} ola(s)) | ${e.calendarDays.p50} | ${e.calendarDays.p90} |`,
        '',
        `Rigor declarado: ${e.rigor}. ${e.notes.join(' ')}`,
        '',
    ].join('\n');
};
