/**
 * The engine: one directive contract for every host (REQ-PB-006, REQ-PB-008/009/010/013).
 *
 * Adopted from AI-DLC's engine/conductor split. `next` reads state and emits EXACTLY ONE directive
 * of a declared kind, validated against its schema, and changes nothing. `report` applies one
 * transition atomically and appends one audit event. Every host — a CLI user, the MCP server, the
 * skills of any agent — drives a run only through these two calls, so adding a host means adding a
 * thin loop, never logic.
 *
 * Guards on the way to a gate (deterministic, all of them):
 *   - declared outputs that open-sdd can locate must exist (artifact guard);
 *   - a step with a handoff pack must have passed the recall check (`RECALL_MISMATCH` blocks);
 *   - answers confirmed for the step must still hash the same, and produced artifacts must carry
 *     the confirmation id;
 *   - a review receipt for the step must be fresh;
 *   - `approved` never comes from `report`: only a named answer to a prepared card approves;
 *   - the last step of a phase runs the traceability gate, which blocks on an orphan requirement.
 */
import { appendFile, mkdir, open, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkConsistency } from './consistency.js';
import type { CardAnswer, DecisionCard } from './hilCards.js';
import { listCards, overdueCards, recordAnswer } from './hilCards.js';
import { capture } from './memoryStore.js';
import { topologicalWaves } from './waveReferee.js';
import { readPack, readRecall, resolveArtifact, staleItems } from './handoff.js';
import { checkPlaybook, findPlaybook, stepCatalogue } from './playbook.js';
import type { SignalValue } from './profile.js';
import { checkQuestions, parseQuestions, questionFile, readConfirmation, unstampedArtifacts } from './questions.js';
import { readReceipt, receiptFreshness } from './reviewReceipts.js';

export type StepStatus = 'pending' | 'in-progress' | 'awaiting' | 'revising' | 'done' | 'skipped';

export interface EngineStep {
  id: string;
  phase: string;
  use: string;
  checks: string[];
  review: 'human' | 'auto';
  status: StepStatus;
  revisions: number;
  reason?: string;
}

export interface EngineState {
  schema: 'open-sdd.engine/1';
  feature: string;
  playbook: string;
  lead: 'opensdd' | 'aidlc';
  autonomous: boolean;
  startedAt: string;
  parked: string | null;
  budget: { handoff_tokens: number; improve_probes: number; always_on_chars: number };
  steps: EngineStep[];
  /** Units of work and their dependencies (REQ-V37-008); absent for single-unit runs. */
  units?: { id: string; deps: string[] }[];
  waves?: string[][];
  /** Level of the work L0…L6 and its ceremony (REQ-MK-002); absent on runs started before v3.8. */
  level?: string;
  ceremony?: Ceremony;
}

export type Ceremony = 'minimal' | 'standard' | 'strict';

// ── Directives ────────────────────────────────────────────────────────────────────────────────

export type Directive =
  | { kind: 'run-step'; feature: string; step: string; use: string; phase: string; gate: boolean; checks: string[]; pack: string | null; restate: boolean; stale: string[] }
  | { kind: 'ask'; feature: string; step: string; file: string; open: string[] }
  | { kind: 'present-gate'; feature: string; step: string; card: string | null; prepare: string; revisions: number }
  | { kind: 'handoff'; feature: string; step: string; command: string }
  | { kind: 'parked'; feature: string; reason: string }
  | { kind: 'done'; feature: string; summary: { done: number; skipped: number } }
  | { kind: 'error'; message: string };

export const DIRECTIVE_SCHEMA: Record<Directive['kind'], string[]> = {
  'run-step': ['kind', 'feature', 'step', 'use', 'phase', 'gate', 'checks', 'pack', 'restate', 'stale'],
  ask: ['kind', 'feature', 'step', 'file', 'open'],
  'present-gate': ['kind', 'feature', 'step', 'card', 'prepare', 'revisions'],
  handoff: ['kind', 'feature', 'step', 'command'],
  parked: ['kind', 'feature', 'reason'],
  done: ['kind', 'feature', 'summary'],
  error: ['kind', 'message'],
};

/** Exactly the declared keys, no more, no fewer. */
export const validateDirective = (d: unknown): string[] => {
  if (!d || typeof d !== 'object') return ['directive is not an object'];
  const kind = (d as { kind?: string }).kind as Directive['kind'];
  const allowed = DIRECTIVE_SCHEMA[kind];
  if (!allowed) return [`unknown directive kind «${String(kind)}»`];
  const keys = Object.keys(d);
  const errors = keys.filter((k) => !allowed.includes(k)).map((k) => `unexpected key «${k}» in ${kind}`);
  for (const k of allowed) if (!(k in (d as object))) errors.push(`missing key «${k}» in ${kind}`);
  return errors;
};

// ── State and audit ───────────────────────────────────────────────────────────────────────────

const engineDir = (cwd: string): string => path.join(cwd, '.sdd', 'engine');
const stateFile = (cwd: string, feature: string): string => path.join(engineDir(cwd), `${feature}.state.json`);
export const auditFile = (cwd: string, feature: string): string => path.join(engineDir(cwd), `${feature}.audit.jsonl`);

export const readState = async (cwd: string, feature: string): Promise<EngineState | null> => {
  const raw = await readFile(stateFile(cwd, feature), 'utf8').catch(() => null);
  return raw ? (JSON.parse(raw) as EngineState) : null;
};

export const lockFile = (cwd: string, feature: string): string => path.join(engineDir(cwd), `${feature}.lock`);
const LOCK_WAIT_MS = 5_000;
const LOCK_STALE_MS = 60_000;

/** One writer per feature (REQ-V37-008): a held lock refuses a concurrent writer after 5 s. */
const withLock = async <T>(cwd: string, feature: string, fn: () => Promise<T>): Promise<T> => {
  await mkdir(engineDir(cwd), { recursive: true });
  const file = lockFile(cwd, feature);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const h = await open(file, 'wx');
      await h.writeFile(`${process.pid}\n`);
      await h.close();
      break;
    } catch {
      const st = await stat(file).catch(() => null);
      if (st && Date.now() - st.mtimeMs > LOCK_STALE_MS) {
        await unlink(file).catch(() => {});
        continue;
      }
      if (Date.now() > deadline) throw new Error(`LOCK_HELD: another writer holds ${path.relative(cwd, file)}; retry when it finishes`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await unlink(file).catch(() => {});
  }
};

const writeState = async (cwd: string, state: EngineState): Promise<void> =>
  withLock(cwd, state.feature, async () => {
    const tmp = `${stateFile(cwd, state.feature)}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const { rename } = await import('node:fs/promises');
    await rename(tmp, stateFile(cwd, state.feature));
  });

export interface AuditEvent {
  at: string;
  event: string;
  step?: string;
  detail?: string;
  by?: string;
  tokens?: number;
  model?: string;
  durationS?: number;
}

export const appendAudit = async (cwd: string, feature: string, event: Omit<AuditEvent, 'at'>): Promise<void> => {
  await mkdir(engineDir(cwd), { recursive: true });
  await appendFile(auditFile(cwd, feature), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
};

export const readAudit = async (cwd: string, feature: string): Promise<AuditEvent[]> =>
  (await readFile(auditFile(cwd, feature), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AuditEvent);

export const startRun = async (
  cwd: string,
  feature: string,
  playbookName: string,
  values: Record<string, SignalValue | 'unknown'>,
  opts: { autonomous?: boolean; units?: { id: string; deps: string[] }[]; waves?: string[][]; level?: string; ceremony?: Ceremony } = {},
): Promise<{ ok: boolean; message: string; state?: EngineState }> => {
  let waves: string[][] | undefined;
  if (opts.units && opts.units.length && opts.waves) {
    // Explicit waves (a modernization wave plan): every unit exactly once.
    const flat = opts.waves.flat();
    const ids = opts.units.map((u) => u.id);
    if (flat.length !== new Set(flat).size || flat.length !== ids.length || ids.some((id) => !flat.includes(id))) return { ok: false, message: 'units: explicit waves must list every unit exactly once' };
    waves = opts.waves;
  } else if (opts.units && opts.units.length) {
    const t = topologicalWaves(opts.units.map((u) => ({ id: u.id, depends: u.deps, done: false })));
    if (t.error) return { ok: false, message: `units: ${t.error}` };
    waves = t.waves;
  }
  if (await readState(cwd, feature)) return { ok: false, message: `a run for ${feature} already exists (.sdd/engine/${feature}.state.json)` };
  const found = await findPlaybook(cwd, playbookName);
  if (!found) return { ok: false, message: `playbook «${playbookName}» not found` };
  const checked = await checkPlaybook(cwd, found.playbook, values);
  if (!checked.ok) return { ok: false, message: `playbook does not pass the checker:\n  ${checked.issues.map((i) => `${i.code}: ${i.message}`).join('\n  ')}` };
  const state: EngineState = {
    schema: 'open-sdd.engine/1',
    feature,
    playbook: checked.name,
    lead: checked.lead,
    autonomous: Boolean(opts.autonomous),
    startedAt: new Date().toISOString(),
    parked: null,
    budget: checked.budget,
    steps: checked.steps.map((s) => ({ id: s.id, phase: s.phase, use: s.use, checks: s.checks, review: s.review, status: s.decision === 'SKIP' ? 'skipped' : 'pending', revisions: 0, reason: s.reason })),
    ...(opts.units && opts.units.length ? { units: opts.units, waves } : {}),
    ...(opts.level ? { level: opts.level } : {}),
    ...(opts.ceremony ? { ceremony: opts.ceremony } : {}),
  };
  await writeState(cwd, state);
  await appendAudit(cwd, feature, { event: 'RUN_STARTED', detail: `${checked.name} · ${state.steps.filter((s) => s.status === 'pending').length} steps · ${state.steps.filter((s) => s.review === 'human' && s.status !== 'skipped').length} human gates` });
  return { ok: true, message: `run started for ${feature} with ${checked.name}`, state };
};

const openQuestions = async (cwd: string, feature: string, step: string): Promise<{ file: string; open: string[] } | null> => {
  const file = questionFile(cwd, feature, step);
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text === null) return null;
  const open = checkQuestions(parseQuestions(text)).map((i) => i.message);
  const { confirmation, fresh } = await readConfirmation(file);
  if (open.length === 0 && confirmation && fresh) return { file, open: [] };
  if (open.length === 0) open.push('answers complete but not confirmed: run `open-sdd questions confirm`');
  return { file, open };
};

/** The single next directive. Reads only. */
export const nextDirective = async (cwd: string, feature: string): Promise<Directive> => {
  const state = await readState(cwd, feature);
  if (!state) return { kind: 'error', message: `no run for ${feature}: run \`open-sdd engine start ${feature} --playbook <name>\`` };
  // Deadlines (REQ-V37-002): an unanswered card past its deadline takes its default (park/reject only).
  const overdue = await overdueCards(cwd, feature);
  if (overdue.length) {
    for (const card of overdue) {
      const r = await recordAnswer(cwd, feature, card.id, card.default, 'deadline', { channel: 'deadline' });
      if (!r.ok || !r.answer) continue;
      await appendAudit(cwd, feature, { event: 'DEADLINE_APPLIED', step: card.step, detail: `${card.id} ${card.default} ${r.answer.effect}`, by: 'deadline' });
      await applyDecision(cwd, card, r.answer);
    }
    return nextDirective(cwd, feature);
  }
  if (state.parked) return { kind: 'parked', feature, reason: state.parked };
  const rel = (p: string) => path.relative(cwd, p).split(path.sep).join('/');

  // Stale propagation: a completed step whose consumed inputs changed must run again first.
  for (const s of state.steps.filter((x) => x.status === 'done')) {
    const pack = await readPack(cwd, feature, s.id);
    const stale = pack ? await staleItems(cwd, pack) : [];
    if (stale.length) return { kind: 'run-step', feature, step: s.id, use: s.use, phase: s.phase, gate: s.review === 'human', checks: s.checks, pack: rel(path.join(cwd, '.sdd', 'handoff', feature, `${s.id}.json`)), restate: true, stale };
  }

  const s = state.steps.find((x) => x.status !== 'done' && x.status !== 'skipped');
  if (!s) return { kind: 'done', feature, summary: { done: state.steps.filter((x) => x.status === 'done').length, skipped: state.steps.filter((x) => x.status === 'skipped').length } };

  if (s.status === 'awaiting') {
    const cards = (await listCards(cwd, feature)).filter((c) => c.card.step === s.id && !c.answer);
    const card = cards.length ? rel(path.join(cwd, '.sdd', 'hil', feature, `${cards[cards.length - 1].card.id}.md`)) : null;
    return { kind: 'present-gate', feature, step: s.id, card, prepare: `open-sdd hil prepare ${feature} --step ${s.id} --card <card.json>`, revisions: s.revisions };
  }
  const q = await openQuestions(cwd, feature, s.id);
  if (q && q.open.length) return { kind: 'ask', feature, step: s.id, file: rel(q.file), open: q.open };
  const pack = await readPack(cwd, feature, s.id);
  // Minimal ceremony (L0–L1): no context pack and no recall — a typo does not need a handoff.
  if (!pack && state.ceremony === 'minimal') return { kind: 'run-step', feature, step: s.id, use: s.use, phase: s.phase, gate: s.review === 'human', checks: s.checks, pack: null, restate: false, stale: [] };
  if (!pack) return { kind: 'handoff', feature, step: s.id, command: `open-sdd handoff write ${feature} ${s.id}` };
  return { kind: 'run-step', feature, step: s.id, use: s.use, phase: s.phase, gate: s.review === 'human', checks: s.checks, pack: rel(path.join(cwd, '.sdd', 'handoff', feature, `${s.id}.json`)), restate: true, stale: await staleItems(cwd, pack) };
};

// ── Guards ───────────────────────────────────────────────────────────────────────────────────

const CHECKABLE = /^sdd:(requirements|design|tasks|brief|delta|acceptance|spec|steering|constitution|portfolio-assessment|dispositions|wave-plan)$/;

const gateGuards = async (cwd: string, state: EngineState, step: EngineStep, produced: string[]): Promise<string[]> => {
  const problems: string[] = [];
  const type = stepCatalogue().get(step.use);
  const aidlcPresent = existsSync(path.join(cwd, 'aidlc', 'spaces'));
  const located: string[] = [];
  for (const artifact of type?.produces ?? []) {
    const checkable = CHECKABLE.test(artifact) || (!artifact.startsWith('sdd:') && aidlcPresent);
    if (!checkable) continue;
    const found = await resolveArtifact(cwd, state.feature, artifact);
    if (found.length === 0) problems.push(`ARTIFACT_MISSING: declared output «${artifact}» of ${step.id} was not found`);
    located.push(...found);
  }
  for (const p of produced) if (!existsSync(path.resolve(cwd, p))) problems.push(`ARTIFACT_MISSING: ${p} does not exist`);
  const pack = await readPack(cwd, state.feature, step.id);
  if (pack) {
    const recall = await readRecall(cwd, state.feature, step.id);
    if (!recall) problems.push(`RECALL_MISSING: restate goal and acceptance ids first (open-sdd handoff recall ${state.feature} ${step.id} --text "…")`);
    else if (!recall.ok) problems.push(`RECALL_MISMATCH: missing ${recall.missing.join(', ') || '—'}; unexpected ${recall.extra.join(', ') || '—'}${recall.goalRestated ? '' : '; step not named'}`);
  }
  const qFile = questionFile(cwd, state.feature, step.id);
  if (existsSync(qFile)) {
    const { confirmation, fresh } = await readConfirmation(qFile);
    if (!confirmation) problems.push('QUESTIONS_UNCONFIRMED: answers exist but were never confirmed');
    else if (!fresh) problems.push('QUESTIONS_CHANGED: the answers changed after confirmation');
    else {
      const unstamped = await unstampedArtifacts(cwd, [...produced, ...located], confirmation.id);
      for (const u of unstamped) problems.push(`UNSTAMPED_ARTIFACT: ${u} lacks "Confirmation: ${confirmation.id}"`);
    }
  }
  // Reverse engineering: a stage step closes only when the stage's exit criteria hold (REQ-VR-003).
  if (step.use.startsWith('opensdd:reverse/')) {
    const { reverseStages, STAGE_OF_STEP } = await import('./reverse.js');
    const { stages } = await reverseStages(cwd, state.feature);
    const st = stages.find((x) => x.id === STAGE_OF_STEP[step.use]);
    if (st && !st.done) problems.push(`REVERSE_STAGE_OPEN: ${st.id} ${st.name} (${st.metric}): ${st.unmet.join('; ')}`);
  }
  const receipt = await readReceipt(cwd, state.feature, step.id);
  if (receipt) {
    const f = await receiptFreshness(cwd, receipt);
    if (!f.fresh) problems.push(`RECEIPT_STALE: ${f.tampered ? 'receipt tampered; ' : ''}${[...f.changedArtifacts, ...f.changedSources].slice(0, 5).join(', ')} changed after review`);
  }
  return problems;
};

/** Traceability at a phase boundary: an orphan requirement or a phantom id blocks. */
export const phaseTrace = async (cwd: string, feature: string): Promise<{ inspected: boolean; problems: string[] }> => {
  if (!existsSync(path.join(cwd, '.sdd', 'specs', feature, 'requirements.md'))) return { inspected: false, problems: [] };
  const report = await checkConsistency({ cwd, feature, changedFiles: [] });
  const problems = report.findings
    .filter((f) => f.severity === 'error' && ['PHANTOM_REQUIREMENT_ID', 'REQUIREMENT_WITHOUT_TASK', 'REQUIREMENT_NOT_IN_PLAN'].includes(f.code))
    .map((f) => `${f.code}: ${f.message}`);
  return { inspected: true, problems };
};

const isLastOfPhase = (state: EngineState, step: EngineStep): boolean =>
  state.steps.filter((s) => s.phase === step.phase && s.status !== 'skipped').every((s) => s.id === step.id || s.status === 'done');

const complete = async (cwd: string, state: EngineState, step: EngineStep, event: string, by?: string, extra: Partial<AuditEvent> = {}): Promise<{ ok: boolean; message: string }> => {
  if (isLastOfPhase(state, step)) {
    const trace = await phaseTrace(cwd, state.feature);
    if (trace.problems.length) {
      await appendAudit(cwd, state.feature, { event: 'PHASE_TRACE_FAILED', step: step.id, detail: trace.problems.join(' | ') });
      return { ok: false, message: `phase «${step.phase}» boundary blocked by the traceability gate:\n  ${trace.problems.join('\n  ')}` };
    }
    await appendAudit(cwd, state.feature, { event: trace.inspected ? 'PHASE_VERIFIED' : 'PHASE_TRACE_NOT_INSPECTED', step: step.id, detail: step.phase });
  }
  step.status = 'done';
  await writeState(cwd, state);
  await appendAudit(cwd, state.feature, { event, step: step.id, by, ...extra });
  return { ok: true, message: `${step.id} → done` };
};

// ── Report ───────────────────────────────────────────────────────────────────────────────────

export type ReportResult = 'started' | 'awaiting-approval' | 'rejected' | 'revised' | 'completed' | 'skipped' | 'park' | 'unpark' | 'approved';

export const report = async (
  cwd: string,
  feature: string,
  stepId: string,
  result: ReportResult,
  opts: { produced?: string[]; reason?: string; by?: string; tokens?: number; model?: string; durationS?: number } = {},
): Promise<{ ok: boolean; message: string }> => {
  const telemetry = {
    ...(opts.tokens !== undefined ? { tokens: opts.tokens } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.durationS !== undefined ? { durationS: opts.durationS } : {}),
  };
  const state = await readState(cwd, feature);
  if (!state) return { ok: false, message: `no run for ${feature}` };
  if (result === 'park' || result === 'unpark') {
    state.parked = result === 'park' ? opts.reason ?? 'parked' : null;
    await writeState(cwd, state);
    await appendAudit(cwd, feature, { event: result === 'park' ? 'RUN_PARKED' : 'RUN_UNPARKED', detail: opts.reason });
    return { ok: true, message: result === 'park' ? 'run parked' : 'run resumed' };
  }
  const step = state.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, message: `no step ${stepId} in the run` };
  if (result === 'approved') return { ok: false, message: 'approval comes only from a named answer: `open-sdd hil answer <feature> <card> <option> --by "<name>"`' };
  const pack = await readPack(cwd, feature, step.id);
  const stale = step.status === 'done' && pack ? (await staleItems(cwd, pack)).length > 0 : false;
  const allowed: Record<Exclude<ReportResult, 'park' | 'unpark' | 'approved'>, StepStatus[]> = {
    started: ['pending', 'revising'],
    'awaiting-approval': ['in-progress', 'revising'],
    rejected: ['awaiting'],
    revised: ['revising'],
    completed: ['in-progress'],
    skipped: ['pending', 'in-progress', 'revising', 'awaiting'],
  };
  if (!(allowed[result].includes(step.status) || (result === 'started' && stale)))
    return { ok: false, message: `cannot report «${result}» for ${step.id} while it is ${step.status}` };

  if (result === 'started') {
    step.status = 'in-progress';
  } else if (result === 'awaiting-approval' || result === 'completed') {
    if (result === 'completed' && step.review === 'human') return { ok: false, message: `${step.id} is a human gate: report awaiting-approval and answer its card` };
    const problems = await gateGuards(cwd, state, step, opts.produced ?? []);
    if (problems.length) {
      await appendAudit(cwd, feature, { event: 'GATE_REFUSED', step: step.id, detail: problems.join(' | '), ...telemetry });
      // Learning without being asked (REQ-V37-005): every refusal reaches the memory inbox.
      await capture(cwd, { kind: 'gate-block', origin: `gate:${feature}/${step.id}`, author: opts.by || 'open-sdd', feature, step: step.id, text: problems.map((p) => p.split(':')[0]).join(', ') });
      return { ok: false, message: `gate refused for ${step.id}:\n  ${problems.join('\n  ')}` };
    }
    if (result === 'completed') return complete(cwd, state, step, 'STEP_COMPLETED', opts.by, telemetry);
    // A card for this step answered before the work reached the gate (e.g. an emergency change
    // approved by the CAB while the patch was being prepared) completes it now.
    const early = (await listCards(cwd, feature)).find((c) => c.card.step === step.id && c.answer && ['approve', 'override', 'accept-as-is'].includes(c.answer.effect));
    if (early?.answer) return complete(cwd, state, step, 'GATE_APPROVED', early.answer.by, telemetry);
    step.status = 'awaiting';
  } else if (result === 'rejected') {
    step.status = 'revising';
    step.revisions += 1;
  } else if (result === 'revised') {
    step.status = 'awaiting';
  } else if (result === 'skipped') {
    step.status = 'skipped';
    step.reason = opts.reason ?? 'skipped by report';
  }
  await writeState(cwd, state);
  await appendAudit(cwd, feature, { event: `STEP_${result.toUpperCase().replace(/-/g, '_')}`, step: step.id, detail: opts.reason, by: opts.by, ...telemetry });
  return { ok: true, message: `${step.id} → ${step.status}` };
};

/** Apply a recorded answer to a prepared card. The only path to an approval. */
export const applyDecision = async (cwd: string, card: DecisionCard, answer: CardAnswer): Promise<{ ok: boolean; message: string }> => {
  const state = await readState(cwd, card.feature);
  if (!state) return { ok: true, message: 'answer recorded (no engine run for this feature)' };
  const step = state.steps.find((s) => s.id === card.step);
  if (!step) return { ok: true, message: `answer recorded (step ${card.step} not in the run)` };
  await appendAudit(cwd, card.feature, { event: 'DECISION_RECORDED', step: step.id, detail: `${card.id} ${answer.option} ${answer.effect}`, by: answer.by });
  if (answer.effect === 'park') return report(cwd, card.feature, step.id, 'park', { reason: `${card.id}: parked by ${answer.by}` });
  if (answer.effect === 'reject') {
    if (step.status !== 'awaiting') return { ok: true, message: 'answer recorded' };
    return report(cwd, card.feature, step.id, 'rejected', { by: answer.by, reason: card.id });
  }
  if (step.status !== 'awaiting') return { ok: true, message: `answer recorded; ${step.id} is ${step.status}, not awaiting` };
  if (answer.effect === 'override' && state.autonomous) return { ok: false, message: 'override refused in autonomous mode' };
  return complete(cwd, state, step, answer.effect === 'approve' ? 'GATE_APPROVED' : answer.effect === 'override' ? 'GATE_OVERRIDDEN' : 'GATE_ACCEPTED_AS_IS', answer.by);
};

// ── Visibility (REQ-V37-006, REQ-V37-009) ───────────────────────────────────────────────────

export interface StepMetrics {
  step: string;
  elapsedS: number | null;
  tokens: number;
  models: string[];
}

/** Per step: seconds from the first STEP_STARTED to the last event, and the reported tokens. */
export const stepMetrics = async (cwd: string, feature: string): Promise<StepMetrics[]> => {
  const by = new Map<string, { start?: number; end?: number; tokens: number; models: Set<string> }>();
  for (const e of await readAudit(cwd, feature)) {
    if (!e.step) continue;
    const m = by.get(e.step) ?? { tokens: 0, models: new Set<string>() };
    const t = Date.parse(e.at);
    if (e.event === 'STEP_STARTED' && m.start === undefined) m.start = t;
    if (m.start !== undefined) m.end = t;
    m.tokens += e.tokens ?? 0;
    if (e.model) m.models.add(e.model);
    by.set(e.step, m);
  }
  return [...by.entries()].map(([step, m]) => ({
    step,
    elapsedS: m.start !== undefined && m.end !== undefined ? Math.round((m.end - m.start) / 1000) : null,
    tokens: m.tokens,
    models: [...m.models],
  }));
};

export interface RunSummary {
  feature: string;
  playbook: string;
  done: number;
  total: number;
  parked: string | null;
  current: string | null;
}

export const listRuns = async (cwd: string): Promise<RunSummary[]> => {
  const names = (await readdir(engineDir(cwd)).catch(() => [])).filter((n) => n.endsWith('.state.json')).sort();
  const out: RunSummary[] = [];
  for (const n of names) {
    const st = await readState(cwd, n.replace(/\.state\.json$/, ''));
    if (!st) continue;
    const active = st.steps.filter((x) => x.status !== 'skipped');
    out.push({ feature: st.feature, playbook: st.playbook, done: active.filter((x) => x.status === 'done').length, total: active.length, parked: st.parked, current: active.find((x) => x.status !== 'done')?.id ?? null });
  }
  return out;
};

const MERMAID_CLASS: Record<StepStatus, string> = { pending: 'pending', 'in-progress': 'running', awaiting: 'awaiting', revising: 'awaiting', done: 'done', skipped: 'skipped' };

/** Phases as subgraphs, steps coloured by status, human gates marked. */
export const runMermaid = (state: EngineState): string => {
  const id = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = [
    'flowchart LR',
    '  classDef done fill:#dcfce7,stroke:#15803d,color:#0b3a1c',
    '  classDef running fill:#dbeafe,stroke:#1d4ed8,color:#0b2559',
    '  classDef awaiting fill:#fef3c7,stroke:#b45309,color:#4a2a00',
    '  classDef pending fill:#f1f5f9,stroke:#64748b,color:#1e293b',
    '  classDef skipped fill:#f8fafc,stroke:#cbd5e1,color:#94a3b8,stroke-dasharray:4 3',
  ];
  const phases = [...new Set(state.steps.map((s) => s.phase))];
  for (const ph of phases) {
    lines.push(`  subgraph ${id(`ph_${ph}`)}["${ph}"]`);
    for (const s of state.steps.filter((x) => x.phase === ph)) lines.push(`    ${id(s.id)}["${s.review === 'human' ? '👤 ' : ''}${s.id}<br/>${s.status}"]:::${MERMAID_CLASS[s.status]}`);
    lines.push('  end');
  }
  const order = state.steps.filter((s) => s.status !== 'skipped');
  for (let i = 1; i < order.length; i += 1) lines.push(`  ${id(order[i - 1].id)} --> ${id(order[i].id)}`);
  if (state.waves?.length) {
    lines.push('  subgraph waves["units · waves"]');
    state.waves.forEach((w, i) => lines.push(`    ${id(`wave_${i + 1}`)}["wave ${i + 1}: ${w.join(', ')}"]`));
    lines.push('  end');
  }
  return lines.join('\n');
};

// ── Dynamic changes to a running workflow (REQ-MK-004) ──────────────────────────────────────

export interface InsertStep {
  id: string;
  use: string;
  review?: 'human' | 'auto';
  checks?: string[];
  reason?: string;
}

/**
 * Insert steps before the next pending step, under `phase`. Idempotent: an id already in the run is
 * left untouched. Returns the ids actually inserted.
 */
export const insertSteps = async (
  cwd: string,
  feature: string,
  phase: string,
  steps: InsertStep[],
  detail?: string,
  place: { afterPhasePrefix?: string; beforeUse?: string } = {},
): Promise<string[]> => {
  const state = await readState(cwd, feature);
  if (!state) throw new Error(`no run for ${feature}`);
  const fresh = steps.filter((x, i) => !state.steps.some((s) => s.id === x.id) && steps.findIndex((y) => y.id === x.id) === i);
  if (!fresh.length) return [];
  // Placement: steps added later to an existing lane go after that lane's last step; a lane of a kind
  // already present (e.g. waves) goes after the last lane of that kind; else before a named program step;
  // else (urgent events) before the next pending step.
  const phases = state.steps.map((s) => s.phase);
  const lastOfLane = phases.lastIndexOf(phase);
  const lastOfKind = place.afterPhasePrefix ? phases.map((p) => p.startsWith(place.afterPhasePrefix as string)).lastIndexOf(true) : -1;
  const beforeUse = place.beforeUse ? state.steps.findIndex((s) => s.use === place.beforeUse && s.status !== 'done' && s.status !== 'skipped') : -1;
  const at =
    lastOfLane >= 0 ? lastOfLane + 1
    : lastOfKind >= 0 ? lastOfKind + 1
    : beforeUse >= 0 ? beforeUse
    : state.steps.findIndex((s) => s.status !== 'done' && s.status !== 'skipped');
  const rows: EngineStep[] = fresh.map((x) => ({ id: x.id, phase, use: x.use, checks: x.checks ?? [], review: x.review ?? 'auto', status: 'pending', revisions: 0, reason: x.reason }));
  state.steps.splice(at < 0 ? state.steps.length : at, 0, ...rows);
  await writeState(cwd, state);
  await appendAudit(cwd, feature, { event: 'STEPS_INSERTED', detail: `${phase}: ${fresh.map((x) => x.id).join(', ')}${detail ? ` · ${detail}` : ''}` });
  return fresh.map((x) => x.id);
};

/** Raise the level (never lowers) and its ceremony. */
export const raiseLevel = async (cwd: string, feature: string, level: string, ceremony: Ceremony, detail?: string): Promise<boolean> => {
  const state = await readState(cwd, feature);
  if (!state) throw new Error(`no run for ${feature}`);
  const rank = (l?: string) => Number((l ?? 'L0').replace(/^L/, '')) || 0;
  if (state.level && rank(level) <= rank(state.level)) return false;
  const order: Ceremony[] = ['minimal', 'standard', 'strict'];
  state.level = level;
  if (order.indexOf(ceremony) > order.indexOf(state.ceremony ?? 'standard')) state.ceremony = ceremony;
  await writeState(cwd, state);
  await appendAudit(cwd, feature, { event: 'LEVEL_RAISED', detail: `${level} (${state.ceremony})${detail ? ` · ${detail}` : ''}` });
  return true;
};
