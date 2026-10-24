/**
 * Run `fn` as a person's shell: no agent markers, `OPEN_SDD_HUMAN=1` (a human shell without TTY).
 * Agent sessions can no longer approve or sign a human review (`--confirm <id>` is text an agent
 * can type), so tests that model a person say so explicitly.
 */
export const asPerson = async <T>(fn: () => Promise<T>): Promise<T> => {
  const keys = ['OPEN_SDD_HUMAN', 'OPEN_SDD_AGENT', 'CLAUDECODE'] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.OPEN_SDD_HUMAN = '1';
  delete process.env.OPEN_SDD_AGENT;
  delete process.env.CLAUDECODE;
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
};
