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

export type StageStatus = 'done' | 'current' | 'pending' | 'blocked';

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
  };
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
    ['constitution', 'Constitución en vigor', constitution, constitution ? 'constitution.md con principios' : 'falta: open-sdd assist constitution'],
    ['discovery', 'Discovery (brief)', await has(path.join(spec, 'brief.md')), 'brief.md'],
    ['requirements', 'Requisitos EARS', await has(path.join(spec, 'requirements.md'), /REQ-[A-Z0-9]+-\d+/), 'requirements.md con REQ-…'],
    ['clarify', 'Ambigüedad resuelta', (await has(path.join(spec, 'requirements.md'))) && openQuestions === 0, `${openQuestions} pregunta(s) de clarify abiertas`],
    ['design', 'Diseño', (await has(path.join(spec, 'plan.md'))) || (await has(path.join(spec, 'design.md'))), 'plan.md o design.md'],
    ['tasks', 'Tareas', plan.length > 0, `${plan.length} tarea(s) en tasks.md`],
    ['implement', 'Implementación', plan.length > 0 && done === plan.length, `${done}/${plan.length} tareas hechas`],
    ['validate', 'Validación exigida', plan.length > 0 && done === plan.length && gaps === 0, `${gaps} tarea(s) hechas sin la validación exigida`],
    ['approve', 'Decisiones humanas', cards.length === 0, `${cards.length} decisión(es) pendientes`],
  ];
  const firstOpen = facts.findIndex(([, , ok]) => !ok);
  const stages: FlowStage[] = facts.map(([id, label, ok, because], index) => ({
    id,
    label,
    status: ok && (firstOpen === -1 || index < firstOpen)
      ? 'done'
      : index === firstOpen
        ? (id === 'validate' && blocking > 0) || (id === 'approve' && cards.length > 0) ? 'blocked' : 'current'
        : ok ? 'done' : 'pending',
    because,
  }));
  const currentIndex = firstOpen === -1 ? stages.length - 1 : firstOpen;

  const progress = await runProgress(cwd, feature);
  const state = await readState(cwd, feature);
  const currentStep = progress?.current?.id ?? null;
  const decided = trail.records.filter((r) => r.feature === feature);
  const first = decided[0]?.at;
  const last = decided[decided.length - 1]?.at;

  return {
    schema: 'open-sdd.flow/1',
    feature,
    generatedAt: new Date().toISOString(),
    current: { stage: stages[currentIndex].id, index: currentIndex + 1, of: stages.length, label: stages[currentIndex].label },
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
      auditChainsIntact: trail.chains.every((c) => c.ok),
      leadTimeHours: first && last ? Math.round(((Date.parse(last) - Date.parse(first)) / 36e5) * 10) / 10 : null,
    },
  };
};
