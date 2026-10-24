/**
 * El estado del flujo de una feature en un formato estable para tableros e indicadores
 * (`open-sdd.flow/1`): en qué etapa está, la lista COMPLETA de etapas y pasos con su estado, las
 * tareas con la validación que exigen las reglas, las decisiones pendientes y métricas de flujo.
 *
 * Las etapas se deciden por artefactos y registros, no por opinión: dos ejecuciones sobre el mismo
 * repositorio dan el mismo resultado (salvo `generatedAt` y las métricas de tiempo).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { planClarify } from './clarify.js';
import { readState } from './engine.js';
import { listCards } from './hilCards.js';
import { readAuditTrail } from './auditTrail.js';
import { featureValidation, type TaskValidation } from './validationRules.js';
import { runProgress } from './where.js';

export type StageStatus = 'done' | 'current' | 'pending' | 'blocked' | 'skipped';

/** El estado global, en una palabra que un tablero puede pintar. */
export type FlowState = 'not-started' | 'in-progress' | 'waiting-decision' | 'blocked' | 'done';

export interface FlowStage {
  id: string;
  label: string;
  status: StageStatus;
  /** Por qué tiene ese estado: el artefacto o el hecho que lo decide. */
  because: string;
}

export interface Flow {
  schema: 'open-sdd.flow/1';
  feature: string;
  generatedAt: string;
  current: { stage: string; index: number; of: number; label: string };
  /** El estado claro: una palabra, una frase, qué lo bloquea y la siguiente orden exacta. */
  status: { state: FlowState; headline: string; blockedBy: string[]; warnings: string[]; next: string };
  stages: FlowStage[];
  run: { playbook: string; percent: number; steps: { phase: string; id: string; status: string; current: boolean; humanGate: boolean }[] } | null;
  tasks: { id: string; title: string; status: TaskValidation['status']; requirements: string[]; required: string[]; missing: string[]; blocking: boolean }[];
  pendingDecisions: { id: string; step: string; question: string }[];
  metrics: {
    tasksDone: number;
    tasksTotal: number;
    percent: number;
    wip: number;
    blockedTasks: number;
    validationGaps: number;
    openQuestions: number;
    decisions: { human: number; agent: number; rule: number };
    auditChainsIntact: boolean;
    leadTimeHours: number | null;
    /** FinOps: lo que los pasos declararon (tokens, modelos, duración) y su coste si hay precio declarado. */
    usage: { tokens: number; models: string[]; durationS: number; costUsd: number | null; budgetTokens: number | null; overBudget: boolean };
  };
}

/** `.sdd/settings/finops.json`: { "budgetTokens": 2000000, "usdPerMillionTokens": { "<modelo>": 15, "default": 10 } } */
interface FinOps {
  budgetTokens?: number;
  usdPerMillionTokens?: Record<string, number>;
}

const has = async (file: string, re?: RegExp): Promise<boolean> => {
  if (!existsSync(file)) return false;
  if (!re) return true;
  return re.test(await readFile(file, 'utf8').catch(() => ''));
};

export const buildFlow = async (cwd: string, feature: string, sddDir = '.sdd'): Promise<Flow> => {
  const spec = path.join(cwd, sddDir, 'specs', feature);
  const validation = await featureValidation(cwd, sddDir, feature);
  const plan = validation?.plan ?? [];
  const clarify = await planClarify({ cwd, feature, sddDir, max: 100 }).catch(() => null);
  const openQuestions = clarify?.questions.length ?? 0;
  const cards = (await listCards(cwd, feature)).filter((c) => !c.answer).map((c) => ({ id: c.card.id, step: c.card.step, question: c.card.question }));
  const trail = await readAuditTrail(cwd, { feature });
  const constitution = await has(path.join(cwd, sddDir, 'steering', 'constitution.md'), /^### C-/m);
  const done = plan.filter((t) => t.status === 'completed').length;
  const gaps = plan.filter((t) => t.status === 'completed' && (t.missing.length > 0 || t.coverageShort)).length;
  const blocking = plan.filter((t) => t.blocking).length;

  const facts: [string, string, boolean, string][] = [
    ['constitution', 'Constitución en vigor', constitution, constitution ? 'constitution.md con principios' : 'falta: steelforge assist constitution'],
    ['discovery', 'Discovery (brief)', await has(path.join(spec, 'brief.md')), 'brief.md'],
    ['requirements', 'Requisitos EARS', await has(path.join(spec, 'requirements.md'), /REQ-[A-Z0-9]+-\d+/), 'requirements.md con REQ-…'],
    ['clarify', 'Ambigüedad resuelta', (await has(path.join(spec, 'requirements.md'))) && openQuestions === 0, `${openQuestions} pregunta(s) de clarify abiertas`],
    ['design', 'Diseño', (await has(path.join(spec, 'plan.md'))) || (await has(path.join(spec, 'design.md'))), 'plan.md o design.md'],
    ['tasks', 'Tareas', plan.length > 0, `${plan.length} tarea(s) en tasks.md`],
    ['implement', 'Implementación', plan.length > 0 && done === plan.length, `${done}/${plan.length} tareas hechas`],
    ['validate', 'Validación exigida', plan.length > 0 && done === plan.length && gaps === 0, `${gaps} tarea(s) hechas sin la validación exigida`],
    ['approve', 'Decisiones humanas', cards.length === 0, `${cards.length} decisión(es) pendientes`],
  ];
  // Discovery es opcional: si ya hay requisitos sin brief, se salta (se dice), no se queda «actual» para siempre.
  const hasRequirements = facts[2][2];
  const skipped = new Set<string>(!facts[1][2] && hasRequirements ? ['discovery'] : []);
  const firstOpen = facts.findIndex(([id, , ok]) => !ok && !skipped.has(id));
  const stages: FlowStage[] = facts.map(([id, label, ok, because], index) => ({
    id,
    label,
    status: skipped.has(id)
      ? 'skipped'
      : ok && (firstOpen === -1 || index < firstOpen)
      ? 'done'
      : index === firstOpen
        ? (id === 'validate' && blocking > 0) || (id === 'approve' && cards.length > 0) ? 'blocked' : 'current'
        : ok ? 'done' : 'pending',
    because: skipped.has(id) ? 'sin brief.md: se empezó directamente por los requisitos' : because,
  }));
  const currentIndex = firstOpen === -1 ? stages.length - 1 : firstOpen;

  const progress = await runProgress(cwd, feature);
  const state = await readState(cwd, feature);
  const currentStep = progress?.current?.id ?? null;
  const decided = trail.records.filter((r) => r.feature === feature);
  const first = decided[0]?.at;
  const last = decided[decided.length - 1]?.at;

  const chainsIntact = trail.chains.every((c) => c.ok);
  const finops = JSON.parse((await readFile(path.join(cwd, sddDir, 'settings', 'finops.json'), 'utf8').catch(() => '{}')) || '{}') as FinOps;
  const metered = decided.filter((r) => typeof r.tokens === 'number');
  const tokens = metered.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
  const price = finops.usdPerMillionTokens;
  const costUsd = price
    ? Math.round(metered.reduce((sum, r) => sum + ((r.tokens ?? 0) / 1e6) * (price[r.model ?? ''] ?? price.default ?? 0), 0) * 100) / 100
    : null;
  const usage = {
    tokens,
    models: [...new Set(metered.map((r) => r.model).filter((m): m is string => !!m))].sort(),
    durationS: decided.reduce((sum, r) => sum + (r.durationS ?? 0), 0),
    costUsd,
    budgetTokens: finops.budgetTokens ?? null,
    overBudget: typeof finops.budgetTokens === 'number' && tokens > finops.budgetTokens,
  };
  const blockedBy = [
    ...(blocking > 0 ? [`${blocking} tarea(s) hechas sin la validación que exigen las reglas`] : []),
    ...(!chainsIntact ? ['el registro de auditoría está manipulado'] : []),
    ...(progress?.parked ? [`ejecución detenida: ${progress.parked}`] : []),
  ];
  const stage = stages[currentIndex];
  const allDone = firstOpen === -1;
  const notStarted = !hasRequirements && plan.length === 0;
  const flowState: FlowState = allDone && !blockedBy.length ? 'done' : blockedBy.length ? 'blocked' : cards.length ? 'waiting-decision' : notStarted ? 'not-started' : 'in-progress';
  const NEXT: Record<string, string> = {
    constitution: 'steelforge assist constitution',
    discovery: `steelforge assist discover "<idea>" --feature ${feature}`,
    requirements: `steelforge brownfield specify ${feature} "<qué debe hacer>" --write`,
    clarify: `steelforge brownfield clarify ${feature}`,
    design: `/sdd-spec-design ${feature}`,
    tasks: `/sdd-spec-tasks ${feature}`,
    implement: `steelforge impl ${feature}`,
    validate: `steelforge validation ${feature}`,
    approve: `steelforge decide ${feature}`,
  };
  const next = !chainsIntact
    ? `steelforge audit trail ${feature}`
    : blocking > 0
      ? `steelforge validation ${feature}`
      : cards.length
        ? `steelforge decide ${feature}`
        : allDone
          ? `steelforge check`
          : NEXT[stage.id];
  const LABEL: Record<FlowState, string> = {
    'not-started': 'SIN EMPEZAR',
    'in-progress': 'EN CURSO',
    'waiting-decision': 'ESPERA UNA DECISIÓN',
    blocked: 'BLOQUEADO',
    done: 'TERMINADO',
  };
  const headline = `${LABEL[flowState]} · etapa ${currentIndex + 1}/${stages.length} ${stage.label} · tareas ${done}/${plan.length}${
    cards.length ? ` · ${cards.length} decisión(es) pendiente(s)` : ''
  }${blockedBy.length ? ` · bloqueado por: ${blockedBy.join('; ')}` : ''}`;

  return {
    schema: 'open-sdd.flow/1',
    feature,
    generatedAt: new Date().toISOString(),
    current: { stage: stages[currentIndex].id, index: currentIndex + 1, of: stages.length, label: stages[currentIndex].label },
    status: { state: flowState, headline, blockedBy, warnings: usage.overBudget ? [`consumo ${usage.tokens} tokens > presupuesto ${usage.budgetTokens}`] : [], next },
    stages,
    run: progress && state
      ? {
          playbook: progress.playbook,
          percent: progress.percent,
          steps: state.steps
            .filter((s) => s.status !== 'skipped')
            .map((s) => ({ phase: s.phase, id: s.id, status: s.status, current: s.id === currentStep, humanGate: s.review === 'human' })),
        }
      : null,
    tasks: plan.map((t) => ({ id: t.task, title: t.title, status: t.status, requirements: t.requirements, required: t.required, missing: t.missing, blocking: t.blocking })),
    pendingDecisions: cards,
    metrics: {
      tasksDone: done,
      tasksTotal: plan.length,
      percent: plan.length ? Math.round((done / plan.length) * 100) : 0,
      wip: plan.filter((t) => t.status === 'in_progress').length,
      blockedTasks: blocking,
      validationGaps: gaps,
      openQuestions,
      decisions: {
        human: decided.filter((r) => r.actor.kind === 'human').length,
        agent: decided.filter((r) => r.actor.kind === 'agent').length,
        rule: decided.filter((r) => r.actor.kind === 'rule').length,
      },
      auditChainsIntact: chainsIntact,
      leadTimeHours: first && last ? Math.round(((Date.parse(last) - Date.parse(first)) / 36e5) * 10) / 10 : null,
      usage,
    },
  };
};

const STATE_EMOJI: Record<FlowState, string> = {
  'not-started': '⚪',
  'in-progress': '🔵',
  'waiting-decision': '🟣',
  blocked: '🔴',
  done: '🟢',
};

/** Estado en Markdown para un PR o el resumen de un job de CI (`$GITHUB_STEP_SUMMARY`). */
export const flowMarkdown = (flows: Flow[]): string => {
  const rows = flows.map(
    (f) =>
      `| ${STATE_EMOJI[f.status.state]} \`${f.feature}\` | ${f.status.state} | ${f.current.index}/${f.current.of} ${f.current.label} | ${f.metrics.tasksDone}/${f.metrics.tasksTotal} | ${f.status.blockedBy.join('; ') || '—'} | \`${f.status.next}\` |`,
  );
  return [
    '## Estado de las specs',
    '',
    '| Feature | Estado | Etapa | Tareas | Bloqueado por | Siguiente |',
    '|---|---|---|---|---|---|',
    ...(rows.length ? rows : ['| — | sin specs | | | | `steelforge start "<lo que quieres>"` |']),
    '',
  ].join('\n');
};
