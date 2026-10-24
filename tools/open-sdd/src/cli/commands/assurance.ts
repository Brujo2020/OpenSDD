/**
 * `validation`, `flow` y `audit trail`: la exigencia de pruebas por reglas, el estado del flujo para
 * tableros y el registro de decisiones para auditoría.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CliIO } from '../io.js';
import { colors, formatHeading } from '../ui/colors.js';
import { appendAudit } from '../../core/engine.js';
import { filterTrail, readAuditTrail, trailCsv, type ActorKind } from '../../core/auditTrail.js';
import { buildFlow } from '../../core/flow.js';
import { parseConstitution } from '../../core/constitution.js';
import { resolveSddDir } from '../../core/specManager.js';
import { listFeatures } from '../../core/trace.js';
import { featureValidation } from '../../core/validationRules.js';
import { sha256 } from '../../core/questions.js';

const valueOf = (args: string[], name: string): string | undefined => {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = (args: string[], skip: string[] = []): string | undefined =>
  args.find((a, i) => !a.startsWith('-') && !skip.includes(args[i - 1] ?? ''));

// ── validation ──────────────────────────────────────────────────────────────────────────────

export const handleValidationCommand = async (args: string[], io: CliIO, cwd: string): Promise<number> => {
  const feature = positional(args);
  if (!feature) {
    io.error('usage: open-sdd validation <feature> [--record] [--json]');
    return 2;
  }
  const sddDir = await resolveSddDir(cwd);
  const result = await featureValidation(cwd, sddDir, feature);
  if (!result) {
    io.error(`no hay spec "${feature}" (requirements.md o tasks.md)`);
    return 1;
  }
  const constitutionText = await readFile(path.join(cwd, sddDir, 'steering', 'constitution.md'), 'utf8').catch(() => '');
  const known = new Set(parseConstitution(constitutionText).principles.map((p) => p.id));
  const unknownPrinciples = [...new Set(result.plan.flatMap((t) => t.matches.map((m) => m.principle)).filter((p): p is string => !!p && !known.has(p)))];

  // --record: una fila de auditoría por tarea cuya exigencia cambió (misma exigencia = no se repite).
  let recorded = 0;
  if (args.includes('--record')) {
    const trail = await readAuditTrail(cwd, { feature });
    for (const t of result.plan) {
      if (t.matches.length === 0) continue;
      const digest = sha256(JSON.stringify({ r: t.required, c: t.minCoverage, m: t.matches.map((m) => m.rule) })).slice(0, 12);
      const already = trail.records.some((r) => r.feature === feature && r.event === 'VALIDATION_REQUIRED' && r.step === `task-${t.task}` && r.evidence.includes(`plan ${digest}`));
      if (already) continue;
      await appendAudit(cwd, feature, {
        event: 'VALIDATION_REQUIRED',
        step: `task-${t.task}`,
        detail: `${t.required.join(', ')}${t.minCoverage !== null ? ` · cobertura ≥ ${Math.round(t.minCoverage * 100)} %` : ''}`,
        actor: { name: t.matches.map((m) => m.rule).join(', '), kind: 'rule' },
        rule: t.matches.map((m) => m.rule).join(', '),
        why: t.matches.map((m) => `${m.rule} (${m.matched}): ${m.rationale}`).join(' · '),
        requirements: t.requirements,
        principles: [...new Set(t.matches.map((m) => m.principle).filter((p): p is string => !!p))],
        evidence: [`plan ${digest}`, `exige ${t.required.join(', ')}`],
      });
      recorded += 1;
    }
  }

  const blocking = result.plan.filter((t) => t.blocking);
  if (args.includes('--json')) {
    io.log(JSON.stringify({ schema: 'open-sdd.validation/1', feature, source: result.source, errors: result.errors, unknownPrinciples, recorded, plan: result.plan }, null, 2));
    return blocking.length > 0 || result.errors.length > 0 ? 1 : 0;
  }
  io.log('');
  io.log(formatHeading(`Validación exigida — ${feature}`));
  io.log(colors.dim(`  reglas: ${result.source === 'default' ? 'de partida (.sdd/settings/validation-rules.json para las tuyas)' : 'del proyecto + de partida'}`));
  for (const error of result.errors) io.log(`  ${colors.red('✗')} ${error}`);
  for (const t of result.plan) {
    const mark = t.blocking ? colors.red('✗') : t.status === 'completed' && (t.missing.length || t.coverageShort) ? colors.yellow('!') : t.status === 'completed' ? colors.green('✓') : '○';
    io.log(`  ${mark} ${t.task.padEnd(5)} ${t.title.slice(0, 60)}`);
    io.log(`      exige: ${t.required.join(', ')}${t.minCoverage !== null ? ` · cobertura ≥ ${Math.round(t.minCoverage * 100)} %` : ''}${t.requirements.length ? colors.dim(`  (${t.requirements.join(', ')})`) : ''}`);
    for (const m of t.matches) io.log(colors.dim(`      ${m.rule} ${m.severity} · ${m.matched}${m.principle ? ` · ${m.principle}` : ''}`));
    if (t.status === 'completed' && t.missing.length) io.log(`      ${t.blocking ? colors.red('falta') : colors.yellow('falta')}: ${t.missing.map((k) => `[${k === 'independent-review' ? 'review: <nombre>' : k}]`).join(' ')}`);
    if (t.status === 'completed' && t.coverageShort) io.log(`      ${colors.yellow('cobertura')}: ${t.coverage === null ? 'no declarada' : `${Math.round(t.coverage * 100)} %`} < ${Math.round((t.minCoverage ?? 0) * 100)} %`);
  }
  if (unknownPrinciples.length) io.log(`  ${colors.yellow('!')} reglas que citan principios que la constitución no tiene: ${unknownPrinciples.join(', ')}`);
  if (recorded) io.log(colors.dim(`  ${recorded} decisión(es) registradas en la auditoría`));
  io.log(colors.dim('  la tarea lo demuestra en su evidencia: _Evidence:_ [unit] [integration] … [review: Nombre] [coverage 92%]'));
  io.log('');
  return blocking.length > 0 || result.errors.length > 0 ? 1 : 0;
};

const STATE_ICON = {
  'not-started': colors.dim('○'),
  'in-progress': colors.cyan('▶'),
  'waiting-decision': colors.magenta('?'),
  blocked: colors.red('■'),
  done: colors.green('✓'),
} as const;

// ── flow ────────────────────────────────────────────────────────────────────────────────────

export const handleFlowCommand = async (args: string[], io: CliIO, cwd: string): Promise<number> => {
  const feature = positional(args);
  const sddDir = await resolveSddDir(cwd);
  if (!feature) {
    // Sin feature: el estado de TODAS, una línea cada una.
    const features = await listFeatures(cwd, sddDir);
    const flows = [];
    for (const name of features) flows.push(await buildFlow(cwd, name, sddDir));
    if (args.includes('--json')) {
      io.log(JSON.stringify({ schema: 'open-sdd.flow-list/1', features: flows.map((f) => ({ feature: f.feature, status: f.status, current: f.current, metrics: f.metrics })) }, null, 2));
      return 0;
    }
    io.log('');
    if (flows.length === 0) io.log('  no hay specs todavía: open-sdd start "<lo que quieres>"');
    for (const f of flows) {
      io.log(`  ${STATE_ICON[f.status.state]} ${colors.bold(f.feature)} — ${f.status.headline}`);
      io.log(colors.dim(`      siguiente: ${f.status.next}`));
    }
    io.log('');
    return 0;
  }
  const flow = await buildFlow(cwd, feature, sddDir);
  if (args.includes('--json')) {
    io.log(JSON.stringify(flow, null, 2));
    return 0;
  }
  io.log('');
  io.log(`  ${STATE_ICON[flow.status.state]} ${colors.bold(flow.status.headline)}`);
  io.log(`  siguiente: ${colors.cyan(flow.status.next)}`);
  const icon = { done: colors.green('✓'), current: colors.cyan('▶'), pending: colors.dim('○'), blocked: colors.red('■'), skipped: colors.dim('–') } as const;
  io.log('');
  io.log(formatHeading(`Etapas — ${feature}`));
  for (const s of flow.stages) io.log(`  ${icon[s.status]} ${s.label.padEnd(26)} ${colors.dim(s.because)}`);
  if (flow.run) {
    io.log('');
    io.log(`  ${colors.bold('Pasos del playbook')} ${flow.run.playbook} · ${flow.run.percent} %`);
    for (const step of flow.run.steps) io.log(`    ${step.current ? colors.cyan('▶') : step.status === 'done' ? colors.green('✓') : colors.dim('○')} ${step.phase}/${step.id}${step.humanGate ? colors.dim(' (persona)') : ''} ${colors.dim(step.status)}`);
  }
  const m = flow.metrics;
  io.log('');
  io.log(`  tareas ${m.tasksDone}/${m.tasksTotal} (${m.percent} %) · en curso ${m.wip} · bloqueadas ${m.blockedTasks} · sin validación ${m.validationGaps} · preguntas ${m.openQuestions}`);
  io.log(`  decisiones: personas ${m.decisions.human} · agentes ${m.decisions.agent} · reglas ${m.decisions.rule} · auditoría ${m.auditChainsIntact ? colors.green('íntegra') : colors.red('MANIPULADA')}`);
  for (const d of flow.pendingDecisions) io.log(`  ${colors.magenta('?')} ${d.id} (${d.step}): ${d.question}`);
  io.log(colors.dim(`  para un tablero: open-sdd flow ${feature} --json  (schema open-sdd.flow/1)`));
  io.log('');
  return 0;
};

// ── audit trail ─────────────────────────────────────────────────────────────────────────────

export const handleAuditTrailCommand = async (args: string[], io: CliIO, cwd: string): Promise<number> => {
  const valued = ['--requirement', '--principle', '--actor', '--who', '--out'];
  const feature = positional(args.slice(1), valued);
  const trail = await readAuditTrail(cwd, feature ? { feature } : {});
  const actor = valueOf(args, '--actor') as ActorKind | undefined;
  const records = filterTrail(trail, {
    requirement: valueOf(args, '--requirement'),
    principle: valueOf(args, '--principle'),
    actor,
    who: valueOf(args, '--who'),
    decisionsOnly: args.includes('--decisions'),
  });
  const broken = trail.chains.filter((c) => !c.ok);
  if (args.includes('--json')) {
    io.log(JSON.stringify({ ...trail, records }, null, 2));
  } else if (args.includes('--csv')) {
    io.log(trailCsv(records).trimEnd());
  } else {
    io.log('');
    io.log(formatHeading(`Registro de decisiones${feature ? ` — ${feature}` : ''} · ${records.length} fila(s)`));
    for (const r of records) {
      const who = `${r.actor.name}${r.actor.email ? ` <${r.actor.email}>` : ''}`;
      io.log(`  ${colors.dim(r.at.replace('T', ' ').slice(0, 19))} ${r.feature} ${colors.bold(r.event)}${r.step ? ` ${r.step}` : ''}`);
      io.log(`      quién: ${who} (${r.actor.kind})${r.rule ? ` · regla ${r.rule}` : ''}`);
      if (r.why) io.log(`      por qué: ${r.why}`);
      if (r.requirements.length || r.principles.length) io.log(`      sobre: ${[...r.requirements, ...r.principles].join(', ')}`);
      if (r.evidence.length) io.log(colors.dim(`      evidencia: ${r.evidence.join(' | ').slice(0, 220)}`));
    }
    io.log('');
    io.log(`  personas ${trail.byActorKind.human} · agentes ${trail.byActorKind.agent} · reglas ${trail.byActorKind.rule} · sistema ${trail.byActorKind.system}`);
    for (const c of trail.chains) io.log(`  ${c.ok ? colors.green('✓') : colors.red('✗')} cadena ${c.feature}: ${c.lines} línea(s)${c.ok ? '' : ` · rota en la línea ${c.brokenAt}`}`);
    io.log('');
  }
  return broken.length > 0 ? 1 : 0;
};
