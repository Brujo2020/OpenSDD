/**
 * Who is answering a decision card (REQ-V37-001). An approval is only as good as the identity behind
 * it: the git identity is recorded next to `--by`, an approvers list can restrict who may answer, and
 * an agent session cannot approve without repeating the card id (`--confirm`).
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const gitIdentity = (cwd) => {
    const get = (key) => {
        const r = spawnSync('git', ['config', '--get', key], { cwd, encoding: 'utf8' });
        return r.status === 0 ? r.stdout.trim() : '';
    };
    return { name: get('user.name'), email: get('user.email') };
};
/** `.sdd/settings/approvers.json`: `{ "approvers": [{ "name": "Ana", "email": "ana@x.com" }] }`. */
export const readApprovers = async (cwd) => {
    const raw = await readFile(path.join(cwd, '.sdd', 'settings', 'approvers.json'), 'utf8').catch(() => null);
    if (!raw)
        return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.approvers) ? parsed.approvers : [];
};
export const isAgentSession = (env = process.env, tty = Boolean(process.stdin.isTTY)) => env.OPEN_SDD_AGENT === '1' || env.CLAUDECODE === '1' || (!tty && env.OPEN_SDD_HUMAN !== '1');
/**
 * `--by` must name a listed approver, and when both the list entry and the shell have an email they
 * must be the same person: typing someone else's name from your own git identity is refused.
 */
export const approverAllowed = (list, by, id) => {
    if (list === null)
        return true;
    const lc = (s) => (s ?? '').trim().toLowerCase();
    const entry = list.find((a) => (a.name && lc(a.name) === lc(by)) || (a.email && lc(a.email) === lc(by)));
    if (!entry)
        return false;
    return !(entry.email && id.email) || lc(entry.email) === lc(id.email);
};
