/**
 * Who is answering a decision card (REQ-V37-001). An approval is only as good as the identity behind
 * it: the git identity is recorded next to `--by`, an approvers list can restrict who may answer, and
 * an agent session cannot approve without repeating the card id (`--confirm`).
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface GitIdentity {
  name: string;
  email: string;
}

export const gitIdentity = (cwd: string): GitIdentity => {
  const get = (key: string) => {
    const r = spawnSync('git', ['config', '--get', key], { cwd, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
  };
  return { name: get('user.name'), email: get('user.email') };
};

/** `.sdd/settings/approvers.json`: `{ "approvers": [{ "name": "Ana", "email": "ana@x.com" }] }`. */
export const readApprovers = async (cwd: string): Promise<{ name?: string; email?: string }[] | null> => {
  const raw = await readFile(path.join(cwd, '.sdd', 'settings', 'approvers.json'), 'utf8').catch(() => null);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { approvers?: { name?: string; email?: string }[] };
  return Array.isArray(parsed.approvers) ? parsed.approvers : [];
};

export const isAgentSession = (env: NodeJS.ProcessEnv = process.env, tty = Boolean(process.stdin.isTTY)): boolean =>
  env.OPEN_SDD_AGENT === '1' || env.CLAUDECODE === '1' || (!tty && env.OPEN_SDD_HUMAN !== '1');

export const approverAllowed = (list: { name?: string; email?: string }[] | null, by: string, id: GitIdentity): boolean => {
  if (list === null) return true;
  const lc = (s?: string) => (s ?? '').trim().toLowerCase();
  return list.some((a) => (a.name && lc(a.name) === lc(by)) || (a.email && (lc(a.email) === lc(id.email) || lc(a.email) === lc(by))));
};
