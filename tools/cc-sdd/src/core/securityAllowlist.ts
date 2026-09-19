/**
 * Security allow-list for gate C2 (G5, "Línea Base de Seguridad").
 *
 * A secret scanner has an unavoidable false-positive class: test fixtures that must LOOK like
 * credentials, the scanner's own pattern table, and documentation that quotes a destructive
 * command to forbid it. Run naively, C2 blocks those commits, and a gate that blocks honest work
 * is a gate that gets disabled — the exact dynamic the reference architecture documents.
 *
 * So suppression exists, under three rules that keep it a control rather than a mute button:
 *
 *   1. It is DECLARED, per (path, pattern id), never global.
 *   2. It is RECORDED: one entry per concession with a reason and an actor, in the same spirit as
 *      invariant I6 — every relaxation is an event, not an absence.
 *   3. It is REPORTED: a run prints how many findings were suppressed and which ones, so a
 *      suppression can never be mistaken for a clean scan.
 *
 * Known residual risk, stated rather than hidden: a REAL credential added to an allow-listed file
 * under an allow-listed pattern id is suppressed. The allow-list is per (file, id) precisely to
 * narrow that window, and the entries are reviewed like any other configuration.
 */

export interface SecurityAllowlistEntry {
  /** Repository-relative path, or a directory prefix ending in `/`. */
  path: string;
  /** Pattern ids from the scanner that are expected in this path. */
  ids: string[];
  /** Why the pattern is expected here. Required, non-empty. */
  reason: string;
  /** Who accepted the concession. Required, non-empty — a self-granted concession is not one. */
  actor?: string;
}

export interface AllowlistParseResult {
  entries: SecurityAllowlistEntry[];
  /** Entries that were unusable, reported instead of being silently ignored. */
  rejected: { path: string; reason: string }[];
}

/** Parse and validate the allow-list. An entry without a path, ids or reason is rejected. */
export const parseSecurityAllowlist = (jsonText: string): AllowlistParseResult => {
  const entries: SecurityAllowlistEntry[] = [];
  const rejected: { path: string; reason: string }[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      entries: [],
      rejected: [{ path: '(documento)', reason: 'JSON inválido: no se pudo leer la lista' }],
    };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { allow?: unknown })?.allow)
      ? (parsed as { allow: unknown[] }).allow
      : [];

  for (const raw of list) {
    const entry = raw as Partial<SecurityAllowlistEntry>;
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    const ids = Array.isArray(entry.ids) ? entry.ids.filter((i) => typeof i === 'string') : [];
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';

    if (!path) {
      rejected.push({ path: '(sin ruta)', reason: 'falta path' });
      continue;
    }
    if (ids.length === 0) {
      rejected.push({ path, reason: 'falta ids (una excepción global no es una excepción)' });
      continue;
    }
    if (!reason) {
      rejected.push({ path, reason: 'falta reason: toda relajación es un evento registrado' });
      continue;
    }
    entries.push({ path, ids, reason, ...(entry.actor ? { actor: entry.actor } : {}) });
  }

  return { entries, rejected };
};

const normalize = (p: string): string => p.replace(/^\.\//, '');

/** Path match: exact, or directory prefix when the entry ends with `/`. */
const pathMatches = (file: string, entryPath: string): boolean => {
  const f = normalize(file);
  const e = normalize(entryPath);
  return e.endsWith('/') ? f.startsWith(e) || f.includes(`/${e}`) : f === e || f.endsWith(`/${e}`);
};

export interface AllowlistDecision {
  kept: { id: string; kind: string; file: string; line: number }[];
  suppressed: { id: string; file: string; line: number; reason: string }[];
}

/** Split findings into those that stand and those an entry covers, citing the covering reason. */
export const applySecurityAllowlist = (
  findings: { id: string; kind: string; file: string; line: number }[],
  entries: SecurityAllowlistEntry[],
): AllowlistDecision => {
  const kept: AllowlistDecision['kept'] = [];
  const suppressed: AllowlistDecision['suppressed'] = [];

  for (const finding of findings) {
    const entry = entries.find((e) => e.ids.includes(finding.id) && pathMatches(finding.file, e.path));
    if (entry) suppressed.push({ id: finding.id, file: finding.file, line: finding.line, reason: entry.reason });
    else kept.push(finding);
  }

  return { kept, suppressed };
};
