/**
 * Question files (REQ-PB-013): the human answers in a file, not in a chat.
 *
 * Format (adopted from AI-DLC's stage protocol):
 *
 *   ## Q1 — Which store keeps sessions?
 *   A. Redis
 *   B. The database
 *   X. Other (please specify)
 *   [Answer]: B
 *
 * Options are A–E plus a mandatory `X. Other`. A blank `[Answer]:` is an open question; the checker
 * exits 1 listing them. `confirm` hashes the whole file and records a confirmation id; artifacts
 * produced afterwards must carry `Confirmation: <id>` so an answer cannot be edited after the work
 * that depends on it was written.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Question {
  id: string;
  title: string;
  options: string[];
  answer: string;
  line: number;
}

export interface QuestionIssue {
  id: string;
  code: 'EMPTY_ANSWER' | 'NO_OTHER_OPTION' | 'TOO_MANY_OPTIONS' | 'ANSWER_NOT_AN_OPTION';
  message: string;
}

export const questionFile = (cwd: string, feature: string, step: string): string => path.join(cwd, '.sdd', 'questions', feature, `${step}.md`);
const confirmFile = (file: string): string => file.replace(/\.md$/, '.confirm.json');

export const parseQuestions = (text: string): Question[] => {
  const out: Question[] = [];
  let current: Question | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const head = line.match(/^##\s+(Q\d+)\b\s*[—:-]?\s*(.*)$/);
    if (head) {
      current = { id: head[1], title: head[2].trim(), options: [], answer: '', line: i + 1 };
      out.push(current);
      return;
    }
    if (!current) return;
    const opt = line.match(/^\s*([A-EX])\.\s+(.+)$/);
    if (opt) current.options.push(opt[1]);
    const ans = line.match(/^\s*\[Answer\]:\s*(.*)$/);
    if (ans) current.answer = ans[1].trim();
  });
  return out;
};

export const checkQuestions = (questions: Question[]): QuestionIssue[] => {
  const issues: QuestionIssue[] = [];
  for (const q of questions) {
    const letters = q.options.filter((o) => o !== 'X');
    if (!q.options.includes('X')) issues.push({ id: q.id, code: 'NO_OTHER_OPTION', message: `${q.id}: missing the mandatory \`X. Other (please specify)\`` });
    if (letters.length > 5) issues.push({ id: q.id, code: 'TOO_MANY_OPTIONS', message: `${q.id}: more than five lettered options` });
    if (!q.answer) {
      issues.push({ id: q.id, code: 'EMPTY_ANSWER', message: `${q.id} (line ${q.line}): [Answer]: is empty` });
      continue;
    }
    const picked = q.answer.split(',').map((a) => a.trim().charAt(0).toUpperCase());
    if (picked.some((p) => !q.options.includes(p))) issues.push({ id: q.id, code: 'ANSWER_NOT_AN_OPTION', message: `${q.id}: answer «${q.answer}» is not one of ${q.options.join(', ')}` });
  }
  return issues;
};

export interface Confirmation {
  id: string;
  sha256: string;
  file: string;
  by: string;
  at: string;
}

export const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

/** Confirm a fully answered file. Refuses while any issue remains. */
export const confirmQuestions = async (file: string, by: string, now = new Date()): Promise<{ ok: boolean; issues: QuestionIssue[]; confirmation?: Confirmation }> => {
  const text = await readFile(file, 'utf8');
  const issues = checkQuestions(parseQuestions(text));
  if (issues.length > 0) return { ok: false, issues };
  const digest = sha256(text);
  const confirmation: Confirmation = { id: `QC-${digest.slice(0, 12)}`, sha256: digest, file, by, at: now.toISOString() };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(confirmFile(file), `${JSON.stringify(confirmation, null, 2)}\n`, 'utf8');
  return { ok: true, issues: [], confirmation };
};

/** The confirmation of a question file, valid only while the file still hashes the same. */
export const readConfirmation = async (file: string): Promise<{ confirmation: Confirmation | null; fresh: boolean }> => {
  const raw = await readFile(confirmFile(file), 'utf8').catch(() => null);
  if (!raw) return { confirmation: null, fresh: false };
  const confirmation = JSON.parse(raw) as Confirmation;
  const text = await readFile(file, 'utf8').catch(() => '');
  return { confirmation, fresh: sha256(text) === confirmation.sha256 };
};

/** Artifacts written after a confirmation must carry its id. */
export const unstampedArtifacts = async (cwd: string, paths: string[], confirmationId: string): Promise<string[]> => {
  const missing: string[] = [];
  for (const p of paths) {
    const text = await readFile(path.resolve(cwd, p), 'utf8').catch(() => '');
    if (!text.includes(`Confirmation: ${confirmationId}`)) missing.push(p);
  }
  return missing;
};
