/**
 * Review receipts bound to bytes (REQ-PB-009), adopted from AI-DLC's source-bound review receipts.
 *
 * A receipt pins the sha256 of every reviewed artifact and a snapshot of every file under the
 * reviewed source roots. While it is fresh, the pre-commit freeze refuses edits to the reviewed
 * artifacts; any change under the source roots after the review makes the receipt `stale`, and a
 * stale receipt refuses completion. The receipt digest is pinned in the engine audit log, so a
 * receipt rewritten afterwards no longer matches its own record.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './questions.js';

export interface ReviewReceipt {
  schema: 'open-sdd.review/1';
  feature: string;
  step: string;
  reviewer: string;
  at: string;
  artifacts: { path: string; sha256: string }[];
  roots: string[];
  snapshot: Record<string, string>;
  digest: string;
}

const receiptDir = (cwd: string, feature: string): string => path.join(cwd, '.sdd', 'reviews', feature);
const posix = (p: string): string => p.split(path.sep).join('/');
const SKIP = new Set(['node_modules', '.git', 'dist', '.sdd']);

const listFiles = async (cwd: string, root: string): Promise<string[]> => {
  const abs = path.join(cwd, root);
  const st = await stat(abs).catch(() => null);
  if (!st) return [];
  if (st.isFile()) return [posix(root)];
  const out: string[] = [];
  for (const e of (await readdir(abs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(e.name)) continue;
    out.push(...(await listFiles(cwd, path.join(root, e.name))));
  }
  return out;
};

const hashFile = async (cwd: string, rel: string): Promise<string | null> => {
  const buf = await readFile(path.join(cwd, rel)).catch(() => null);
  return buf ? sha256(buf) : null;
};

const snapshotOf = async (cwd: string, roots: string[]): Promise<Record<string, string>> => {
  const snap: Record<string, string> = {};
  for (const root of roots) for (const f of await listFiles(cwd, root)) snap[f] = (await hashFile(cwd, f)) ?? '';
  return snap;
};

export const recordReview = async (
  cwd: string,
  input: { feature: string; step: string; reviewer: string; artifacts: string[]; roots: string[]; now?: Date },
): Promise<{ ok: boolean; message: string; receipt?: ReviewReceipt }> => {
  if (!input.reviewer.trim()) return { ok: false, message: 'a review receipt needs --by "<reviewer>"' };
  const artifacts: ReviewReceipt['artifacts'] = [];
  for (const a of input.artifacts) {
    const h = await hashFile(cwd, a);
    if (!h) return { ok: false, message: `reviewed artifact ${a} does not exist` };
    artifacts.push({ path: posix(a), sha256: h });
  }
  const snapshot = await snapshotOf(cwd, input.roots);
  const body = { schema: 'open-sdd.review/1' as const, feature: input.feature, step: input.step, reviewer: input.reviewer, at: (input.now ?? new Date()).toISOString(), artifacts, roots: input.roots.map(posix), snapshot };
  const receipt: ReviewReceipt = { ...body, digest: sha256(JSON.stringify(body)) };
  await mkdir(receiptDir(cwd, input.feature), { recursive: true });
  await writeFile(path.join(receiptDir(cwd, input.feature), `${input.step}.json`), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { ok: true, message: `receipt ${receipt.digest.slice(0, 12)} for ${input.step}`, receipt };
};

export const readReceipt = async (cwd: string, feature: string, step: string): Promise<ReviewReceipt | null> => {
  const raw = await readFile(path.join(receiptDir(cwd, feature), `${step}.json`), 'utf8').catch(() => null);
  return raw ? (JSON.parse(raw) as ReviewReceipt) : null;
};

export interface Freshness {
  fresh: boolean;
  tampered: boolean;
  changedArtifacts: string[];
  changedSources: string[];
}

export const receiptFreshness = async (cwd: string, receipt: ReviewReceipt): Promise<Freshness> => {
  const { digest, ...body } = receipt;
  const tampered = sha256(JSON.stringify(body)) !== digest;
  const changedArtifacts: string[] = [];
  for (const a of receipt.artifacts) if ((await hashFile(cwd, a.path)) !== a.sha256) changedArtifacts.push(a.path);
  const now = await snapshotOf(cwd, receipt.roots);
  const keys = new Set([...Object.keys(now), ...Object.keys(receipt.snapshot)]);
  const changedSources = [...keys].filter((k) => now[k] !== receipt.snapshot[k]).sort();
  return { fresh: !tampered && changedArtifacts.length === 0 && changedSources.length === 0, tampered, changedArtifacts, changedSources };
};

/** Every receipt in the repository. */
export const allReceipts = async (cwd: string): Promise<ReviewReceipt[]> => {
  const out: ReviewReceipt[] = [];
  const root = path.join(cwd, '.sdd', 'reviews');
  for (const feature of (await readdir(root).catch(() => [])).sort())
    for (const f of (await readdir(path.join(root, feature)).catch(() => [])).filter((n) => n.endsWith('.json')).sort())
      out.push(JSON.parse(await readFile(path.join(root, feature, f), 'utf8')) as ReviewReceipt);
  return out;
};

/**
 * Pre-commit freeze: a staged file that is a reviewed artifact of a receipt is refused while the
 * receipt is still the latest word on it. Re-review (a new receipt) or a rejection lifts it.
 */
export const freezeViolations = async (cwd: string, staged: string[]): Promise<{ file: string; step: string; feature: string }[]> => {
  const set = new Set(staged.map(posix));
  const out: { file: string; step: string; feature: string }[] = [];
  for (const r of await allReceipts(cwd)) {
    for (const a of r.artifacts) {
      if (!set.has(a.path)) continue;
      if ((await hashFile(cwd, a.path)) !== a.sha256) out.push({ file: a.path, step: r.step, feature: r.feature });
    }
  }
  return out;
};
