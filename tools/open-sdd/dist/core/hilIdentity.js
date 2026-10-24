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
/**
 * Ask on the controlling terminal for the card id, with a timeout. An agent's tool shell normally has
 * no controlling terminal, so this raises the bar from "type an id you just read" to "a person at the
 * terminal types it". It is NOT a proof of a person: an agent can allocate a pty (`script`, `expect`).
 * Every failure (no /dev/tty, Windows, timeout, wrong id) is a refusal, and it never prompts under the
 * test runner — that can only refuse, so it opens no bypass.
 */
export const confirmOnTty = (id, ttyPath = '/dev/tty', timeoutMs = 60_000, what = 'la aprobación') => {
    if (process.env.VITEST || process.platform === 'win32')
        return false;
    try {
        const r = spawnSync('sh', ['-c', 'printf "%s" "$1" > "$2" && IFS= read -r answer < "$2" && printf "%s" "$answer"', 'confirm', `Escribe ${id} para confirmar ${what}: `, ttyPath], { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] });
        return r.status === 0 && (r.stdout ?? '').trim() === id;
    }
    catch {
        return false;
    }
};
/**
 * Confirmación en terminal sustituible SOLO por los tests (el runner no tiene terminal y
 * `confirmOnTty` allí siempre rechaza). El producto usa siempre `confirmOnTty`.
 */
let terminalConfirmer = (id, what) => confirmOnTty(id, '/dev/tty', 60_000, what);
export const confirmOnTerminal = (id, what) => terminalConfirmer(id, what);
export const setTerminalConfirmerForTests = (fn) => {
    terminalConfirmer = fn ?? ((id, what) => confirmOnTty(id, '/dev/tty', 60_000, what));
};
