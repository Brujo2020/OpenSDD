/**
 * The memory pipeline, wired (REQ-PB-014, REQ-PB-015).
 *
 * `memory.ts` declares the model (capture → distillation → promotion → injection, provenance
 * decides). This module runs it on disk:
 *
 *   .sdd/memory/inbox/inbox.jsonl     append-only, quarantined, never injected
 *   .sdd/memory/quarantine/<id>.json  reflections the admission gate refused, with the reasons
 *   .sdd/memory/candidates/<id>.json  admitted, waiting for a named person
 *   .sdd/memory/lessons/<id>.json     promoted; the only items a handoff pack may inject
 *   .sdd/memory/lessons/INDEX.md      regenerated from disk
 *
 * The reflection schema comes from Harness²: one row per changed component with a verdict
 * (`helped | hurt | no-effect | confounded`), at most one lesson `{cue, lesson, evidence,
 * confidence}` or `NO_ENTRY`. `confounded` is forced whenever more than one component changed or a
 * single run stands behind the difference, and a lesson resting only on confounded rows is a guess:
 * it stays in quarantine. Harness² has no consolidation; here lessons with the same cue and step
 * type merge, keeping every evidence id, and withdrawal by origin removes everything a bad source
 * produced.
 */
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './questions.js';

export type CaptureKind = 'gate-block' | 'hil-answer' | 'human-edit' | 'recall-mismatch';

export interface InboxItem {
  id: string;
  kind: CaptureKind;
  origin: string;
  author: string;
  at: string;
  feature?: string;
  step?: string;
  text: string;
  sha256: string;
}

export type Verdict = 'helped' | 'hurt' | 'no-effect' | 'confounded';

export interface ReflectionRow {
  component: string;
  change: string;
  observed: string;
  verdict?: Verdict;
  /** How many runs support the observed difference. */
  runs?: number;
}

export interface LessonDraft {
  cue: string;
  lesson: string;
  /** Indices (0-based) of the rows the lesson rests on. */
  evidence: number[];
  confidence: 'high' | 'medium' | 'low';
  kind: 'invariant' | 'domain';
  stepType: string;
  /** Origins (inbox ids, HIL ids) — withdrawal works through these. */
  origins: string[];
  tags?: string[];
  paths?: string[];
  /** A structured playbook change the lesson suggests; `playbook improve` probes it. */
  proposal?: { when?: string; add?: { phase: string; use: string; after?: string; id?: string }[]; skip?: string[] };
}

export interface Reflection {
  rows: ReflectionRow[];
  lesson: LessonDraft | 'NO_ENTRY';
}

export interface Lesson extends LessonDraft {
  id: string;
  rows: ReflectionRow[];
  createdAt: string;
  promotedBy?: string;
  promotedAt?: string;
  withdrawn?: boolean;
}

export interface AdmissionIssue {
  code: 'EMPTY_FIELD' | 'ONLY_CONFOUNDED' | 'UNKNOWN_EVIDENCE' | 'SECRET' | 'GRADER_TEXT' | 'INVARIANT_TOUCHES_DOMAIN' | 'DOMAIN_TOUCHES_PROCESS' | 'BAD_KIND';
  message: string;
}

const dir = (cwd: string, ...p: string[]): string => path.join(cwd, '.sdd', 'memory', ...p);
const SECRET = /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/i;
const GRADER = /\b(rubric|grader|expected score|the grader expects|answer key)\b/i;
const DOMAIN_PATH = /^(\.sdd\/specs\/|\.sdd\/steering\/product\.md|docs\/domain\/)/;
const PROCESS_PATH = /^(\.sdd\/playbooks\/|\.sdd\/settings\/|templates\/)|\/skills\/|hooks/;

export const capture = async (cwd: string, item: Omit<InboxItem, 'id' | 'sha256' | 'at'> & { at?: string }): Promise<InboxItem> => {
  const digest = sha256(`${item.kind}|${item.origin}|${item.text}`);
  const full: InboxItem = { ...item, at: item.at ?? new Date().toISOString(), id: `IN-${digest.slice(0, 10)}`, sha256: digest };
  await mkdir(dir(cwd, 'inbox'), { recursive: true });
  await appendFile(dir(cwd, 'inbox', 'inbox.jsonl'), `${JSON.stringify(full)}\n`, 'utf8');
  return full;
};

export const readInbox = async (cwd: string): Promise<InboxItem[]> =>
  (await readFile(dir(cwd, 'inbox', 'inbox.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as InboxItem);

/** Apply the `confounded` default: more than one component changed, or one run is all the evidence. */
export const normalizeRows = (rows: ReflectionRow[]): ReflectionRow[] =>
  rows.map((r) => ({ ...r, verdict: rows.length > 1 || (r.runs ?? 1) < 2 ? 'confounded' : r.verdict ?? 'confounded' }));

export const admit = (reflection: Reflection): { rows: ReflectionRow[]; issues: AdmissionIssue[] } => {
  const rows = normalizeRows(reflection.rows ?? []);
  if (reflection.lesson === 'NO_ENTRY') return { rows, issues: [] };
  const l = reflection.lesson;
  const issues: AdmissionIssue[] = [];
  for (const key of ['cue', 'lesson', 'confidence', 'kind', 'stepType'] as const)
    if (!l[key] || String(l[key]).trim() === '') issues.push({ code: 'EMPTY_FIELD', message: `lesson.${key} is empty` });
  if (!Array.isArray(l.evidence) || l.evidence.length === 0) issues.push({ code: 'EMPTY_FIELD', message: 'lesson.evidence is empty' });
  if (!Array.isArray(l.origins) || l.origins.length === 0) issues.push({ code: 'EMPTY_FIELD', message: 'lesson.origins is empty: withdrawal by origin needs it' });
  if (l.kind && !['invariant', 'domain'].includes(l.kind)) issues.push({ code: 'BAD_KIND', message: `lesson.kind «${l.kind}» is neither invariant nor domain` });
  const cited = (l.evidence ?? []).map((i) => rows[i]);
  if (cited.some((r) => r === undefined)) issues.push({ code: 'UNKNOWN_EVIDENCE', message: 'lesson.evidence cites a row that does not exist' });
  else if (cited.length > 0 && cited.every((r) => r.verdict === 'confounded'))
    issues.push({ code: 'ONLY_CONFOUNDED', message: 'every cited row is confounded: the lesson is a guess, not evidence' });
  const text = JSON.stringify(reflection);
  if (SECRET.test(text)) issues.push({ code: 'SECRET', message: 'the reflection contains something shaped like a secret' });
  if (GRADER.test(text)) issues.push({ code: 'GRADER_TEXT', message: 'the reflection references grading material (oracle leakage)' });
  for (const p of l.paths ?? []) {
    if (l.kind === 'invariant' && DOMAIN_PATH.test(p)) issues.push({ code: 'INVARIANT_TOUCHES_DOMAIN', message: `invariant lesson edits domain path ${p}` });
    if (l.kind === 'domain' && PROCESS_PATH.test(p)) issues.push({ code: 'DOMAIN_TOUCHES_PROCESS', message: `domain lesson edits process path ${p}` });
  }
  return { rows, issues };
};

/** Admit a reflection: candidates/ on success, quarantine/ with the reasons otherwise. */
export const reflect = async (
  cwd: string,
  reflection: Reflection,
  now = new Date(),
): Promise<{ outcome: 'NO_ENTRY' | 'candidate' | 'quarantined'; id?: string; issues: AdmissionIssue[] }> => {
  const { rows, issues } = admit(reflection);
  if (reflection.lesson === 'NO_ENTRY') return { outcome: 'NO_ENTRY', issues: [] };
  const id = `L-${sha256(JSON.stringify(reflection.lesson)).slice(0, 10)}`;
  const lesson: Lesson = { ...reflection.lesson, id, rows, createdAt: now.toISOString() };
  const where = issues.length ? 'quarantine' : 'candidates';
  await mkdir(dir(cwd, where), { recursive: true });
  await writeFile(dir(cwd, where, `${id}.json`), `${JSON.stringify(issues.length ? { ...lesson, issues } : lesson, null, 2)}\n`, 'utf8');
  return { outcome: issues.length ? 'quarantined' : 'candidate', id, issues };
};

const readDirJson = async <T>(p: string): Promise<T[]> => {
  const names = (await readdir(p).catch(() => [])).filter((n) => n.endsWith('.json')).sort();
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(p, n), 'utf8')) as T));
};

export const listLessons = (cwd: string): Promise<Lesson[]> => readDirJson<Lesson>(dir(cwd, 'lessons'));
export const listCandidates = (cwd: string): Promise<Lesson[]> => readDirJson<Lesson>(dir(cwd, 'candidates'));

const writeIndex = async (cwd: string): Promise<void> => {
  const lessons = (await listLessons(cwd)).filter((l) => !l.withdrawn);
  const lines = ['# Lessons (promoted)', '', 'Regenerated by `steelfoundry memory`. Each lesson is a hypothesis to re-verify in the current workspace.', '', '| id | kind | step type | cue | confidence | promoted by |', '|---|---|---|---|---|---|'];
  for (const l of lessons) lines.push(`| ${l.id} | ${l.kind} | ${l.stepType} | ${l.cue.replace(/\|/g, '/')} | ${l.confidence} | ${l.promotedBy ?? ''} |`);
  await mkdir(dir(cwd, 'lessons'), { recursive: true });
  await writeFile(dir(cwd, 'lessons', 'INDEX.md'), `${lines.join('\n')}\n`, 'utf8');
};

/** A named person promotes a candidate. Same cue + step type merges into the existing lesson. */
export const promote = async (cwd: string, id: string, by: string, now = new Date()): Promise<{ ok: boolean; message: string; lessonId?: string }> => {
  if (!by.trim()) return { ok: false, message: 'promotion needs --by "<name>"' };
  const src = dir(cwd, 'candidates', `${id}.json`);
  const raw = await readFile(src, 'utf8').catch(() => null);
  if (!raw) return { ok: false, message: `no candidate ${id} (quarantined items cannot be promoted)` };
  const lesson = JSON.parse(raw) as Lesson;
  const existing = (await listLessons(cwd)).find((l) => !l.withdrawn && l.cue.trim().toLowerCase() === lesson.cue.trim().toLowerCase() && l.stepType === lesson.stepType);
  await mkdir(dir(cwd, 'lessons'), { recursive: true });
  if (existing) {
    const offset = existing.rows.length;
    const merged: Lesson = {
      ...existing,
      rows: [...existing.rows, ...lesson.rows],
      evidence: [...existing.evidence, ...lesson.evidence.map((i) => i + offset)],
      origins: [...new Set([...existing.origins, ...lesson.origins])],
    };
    await writeFile(dir(cwd, 'lessons', `${existing.id}.json`), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    await rename(src, dir(cwd, 'candidates', `${id}.merged`));
    await writeIndex(cwd);
    return { ok: true, message: `${id} merged into ${existing.id} (same cue and step type)`, lessonId: existing.id };
  }
  await writeFile(dir(cwd, 'lessons', `${id}.json`), `${JSON.stringify({ ...lesson, promotedBy: by, promotedAt: now.toISOString() }, null, 2)}\n`, 'utf8');
  await rename(src, dir(cwd, 'candidates', `${id}.promoted`));
  await writeIndex(cwd);
  return { ok: true, message: `${id} promoted by ${by}`, lessonId: id };
};

export const withdrawByOrigin = async (cwd: string, origin: string): Promise<string[]> => {
  const removed: string[] = [];
  for (const l of await listLessons(cwd)) {
    if (!l.withdrawn && l.origins.includes(origin)) {
      await writeFile(dir(cwd, 'lessons', `${l.id}.json`), `${JSON.stringify({ ...l, withdrawn: true }, null, 2)}\n`, 'utf8');
      removed.push(l.id);
    }
  }
  if (removed.length) await writeIndex(cwd);
  return removed;
};

const RANK = { high: 0, medium: 1, low: 2 } as const;

/** Lessons a handoff pack may inject: promoted, not withdrawn, created before the run, tag-matched. */
export const selectLessons = async (cwd: string, opts: { stepType: string; profileType?: string; before?: string; limit?: number }): Promise<Lesson[]> =>
  (await listLessons(cwd))
    .filter((l) => !l.withdrawn && l.promotedBy && (!opts.before || l.createdAt < opts.before))
    .filter((l) => l.stepType === opts.stepType || l.stepType === '*' || (opts.profileType !== undefined && (l.tags ?? []).includes(opts.profileType)))
    .sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, opts.limit ?? 5);
