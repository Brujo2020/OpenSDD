/**
 * Delta specs: the contract of change (brownfield objective, §12 of the reference architecture).
 *
 * In brownfield the existing code is the de facto source of truth, so the unit of specification is
 * not the system but the DELTA. A delta describes only what changes — ADDED, MODIFIED, REMOVED,
 * RENAMED (the ADSR mnemonic) — and every entry carries a DELTA-SCOPED requirement id
 * (`REQ-<AREA>-<NNN>`) rather than an identifier for the whole system. That scoping is what keeps
 * the obligation finite: a task traces to the delta's requirement, never to "everything".
 *
 * Three rules make the difference between a delta and a wish list, and all three are enforced here:
 *
 *   1. A modification must name the behaviour it replaces (`previous`), because "most work modifies
 *      existing behaviour" and a modification that cannot say what it changes is a rewrite.
 *   2. A modification or removal must name the CONTRACTS that cover that behaviour. Those contracts
 *      are the regression oracle: the extracted specification's first use is protecting what must
 *      not change, not producing documentation.
 *   3. A removal must state its rationale and migration path. Removing behaviour is a decision, and
 *      decisions are recorded (invariant I6 in spirit).
 *
 * Strangulation is modelled per entry (`legacy` → `both` → `new`), so moving a piece of the old
 * system into the new one is a change proposal with visible progress instead of a rewrite.
 */
import { validateEarsRequirement } from './ears.js';
export const DELTA_KINDS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];
/** The delta id grammar: REQ-<AREA>-<NNN>, scoped to the change rather than to the system. */
export const DELTA_ID_PATTERN = /^REQ-[A-Z0-9]+(-[A-Z0-9]+)*-\d{3}$/;
/** Above this size a "delta" is almost certainly a full-system spec in disguise. */
export const DELTA_SIZE_WARNING = 25;
/**
 * Validate a delta. Errors block; warnings are the honest signal that the artifact is drifting
 * towards a full-system specification, which is the failure mode this whole approach exists to
 * avoid.
 */
export const validateDeltaSpec = (delta) => {
    const issues = [];
    const seen = new Set();
    for (const kind of DELTA_KINDS) {
        if (delta.entries.length > 0 && !delta.entries.some((e) => e.kind === kind) && kind !== 'RENAMED') {
            issues.push({
                severity: 'warning',
                code: 'EMPTY_SECTION',
                id: delta.feature,
                message: `La sección ${kind} está vacía. Las deltas describen solo lo que cambia: si de verdad no cambia nada de este tipo, es correcto — pero conviene que sea una decisión y no un olvido (ADSR).`,
            });
        }
    }
    for (const entry of delta.entries) {
        if (!DELTA_ID_PATTERN.test(entry.id)) {
            issues.push({
                severity: 'error',
                code: 'ID_FORMAT',
                id: entry.id || '(sin id)',
                message: 'El identificador de una delta es propio del cambio y con forma REQ-<ÁREA>-<NNN> (p. ej. REQ-AUTH-001). Un id del sistema completo rompe la trazabilidad fina.',
            });
        }
        if (seen.has(entry.id)) {
            issues.push({ severity: 'error', code: 'DUPLICATE_ID', id: entry.id, message: 'Identificador duplicado en la delta.' });
        }
        seen.add(entry.id);
        if (!entry.statement.trim()) {
            issues.push({
                severity: 'error',
                code: 'NO_STATEMENT',
                id: entry.id,
                message: 'Falta el enunciado: la delta debe decir qué comportamiento resulta del cambio.',
            });
        }
        else {
            const verdict = validateEarsRequirement(entry.statement);
            if (!verdict.conforms) {
                issues.push({
                    severity: 'error',
                    code: 'EARS',
                    id: entry.id,
                    message: `El enunciado no es EARS: ${verdict.issues.map((i) => `${i.code} (${i.message})`).join('; ')}`,
                });
            }
        }
        if (entry.targets.length === 0) {
            issues.push({
                severity: 'error',
                code: 'NO_TARGETS',
                id: entry.id,
                message: 'Sin objetivos declarados no hay análisis de impacto posible: indica ficheros, símbolos, endpoints o esquemas.',
            });
        }
        if ((entry.kind === 'MODIFIED' || entry.kind === 'REMOVED' || entry.kind === 'RENAMED') && !entry.previous?.trim()) {
            issues.push({
                severity: 'error',
                code: 'MISSING_PREVIOUS',
                id: entry.id,
                message: `Una entrada ${entry.kind} debe nombrar el comportamiento existente que sustituye: la mayor parte del trabajo modifica lo que ya hay.`,
            });
        }
        if (entry.kind === 'REMOVED') {
            if (!entry.rationale?.trim()) {
                issues.push({
                    severity: 'error',
                    code: 'MISSING_RATIONALE',
                    id: entry.id,
                    message: 'Una eliminación sin motivo ni ruta de migración es un accidente, no una decisión.',
                });
            }
            if ((entry.contracts ?? []).length === 0) {
                issues.push({
                    severity: 'error',
                    code: 'MISSING_CONTRACTS',
                    id: entry.id,
                    message: 'Una eliminación debe declarar los contratos de ejecución que cubrían ese comportamiento: el oráculo de regresión es lo que convierte el cambio en algo revisable.',
                });
            }
        }
        if (entry.kind === 'MODIFIED' && (entry.contracts ?? []).length === 0) {
            issues.push({
                severity: 'warning',
                code: 'MISSING_CONTRACTS',
                id: entry.id,
                message: 'Una modificación sin contratos asociados no puede demostrar que lo existente sigue intacto. Añade las pruebas que cubren el comportamiento modificado.',
            });
        }
    }
    if (delta.entries.length > DELTA_SIZE_WARNING) {
        issues.push({
            severity: 'warning',
            code: 'NOT_A_DELTA',
            id: delta.feature,
            message: `${delta.entries.length} entradas superan el umbral de ${DELTA_SIZE_WARNING}: esto empieza a parecer una especificación del sistema completo. La unidad correcta es un cambio acotado e independientemente revisable.`,
        });
    }
    return issues;
};
export const deltaCounts = (delta) => {
    const counts = { ADDED: 0, MODIFIED: 0, REMOVED: 0, RENAMED: 0 };
    for (const entry of delta.entries)
        counts[entry.kind] += 1;
    return counts;
};
/** Strangulation progress: how much of the change still runs on the legacy path. */
export const strangulationReport = (delta) => {
    const byState = { legacy: 0, both: 0, new: 0 };
    const pending = [];
    for (const entry of delta.entries) {
        const state = entry.strangler ?? 'legacy';
        byState[state] += 1;
        if (state !== 'new')
            pending.push(entry.id);
    }
    const total = delta.entries.length;
    return {
        total,
        byState,
        pending,
        detail: total === 0
            ? 'Delta vacía.'
            : `Estrangulamiento: ${byState.new}/${total} entradas completamente en el camino nuevo; ${byState.both} conviven y ${byState.legacy} siguen en el legado.`,
    };
};
/**
 * Trace a delta to its tasks.
 *
 * The rule from the research document is explicit: a task carries the DELTA's requirement id, not
 * an id for the whole system. So a task citing an unknown id is reported as a phantom, and a
 * requirement with no task is reported as unmapped — both directions, because only one of them is
 * usually checked.
 */
export const traceDelta = (delta, tasks) => {
    const ids = new Set(delta.entries.map((e) => e.id));
    const mapped = [];
    const unmapped = [];
    const phantomTasks = [];
    const matchedTasks = new Set();
    const declaredIds = (task) => {
        const declared = task.raw.match(/_Requirements:\s*([^_\n]+)_/i);
        const fromMetadata = declared
            ? declared[1]
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const fromRaw = Array.from(task.raw.matchAll(/REQ-[A-Z0-9-]+-\d{3}/gi)).map((m) => m[0].toUpperCase());
        return Array.from(new Set([...fromMetadata, ...fromRaw]));
    };
    for (const entry of delta.entries) {
        const owners = tasks.filter((t) => declaredIds(t).some((cited) => cited.toUpperCase() === entry.id));
        if (owners.length === 0) {
            unmapped.push(entry.id);
        }
        else {
            owners.forEach((o) => matchedTasks.add(o.id));
            mapped.push({ requirementId: entry.id, tasks: owners.map((o) => o.id), targets: entry.targets });
        }
    }
    for (const task of tasks) {
        for (const cited of declaredIds(task)) {
            if (!ids.has(cited.toUpperCase()))
                phantomTasks.push({ taskId: task.id, cited });
        }
    }
    const coverage = delta.entries.length === 0 ? 1 : mapped.length / delta.entries.length;
    return {
        mapped,
        unmapped,
        phantomTasks,
        coverage,
        detail: delta.entries.length === 0
            ? 'Delta sin entradas que trazar.'
            : `${mapped.length}/${delta.entries.length} requisito(s) de la delta con tarea (${Math.round(coverage * 100)}%)${unmapped.length > 0 ? `; sin tarea: ${unmapped.join(', ')}` : ''}${phantomTasks.length > 0 ? `; tareas citando ids inexistentes: ${phantomTasks.map((p) => `${p.taskId}→${p.cited}`).join(', ')}` : ''}.`,
    };
};
// ---------------------------------------------------------------------------------------------
// Markdown round-trip
// ---------------------------------------------------------------------------------------------
const SECTION_ORDER = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];
export const renderDeltaSpec = (delta) => {
    const lines = [];
    lines.push(`# Delta: ${delta.feature} — ${delta.title}`);
    lines.push('');
    lines.push(`Status: ${delta.status}`);
    if (delta.base)
        lines.push(`Base: ${delta.base}`);
    lines.push('');
    for (const kind of SECTION_ORDER) {
        lines.push(`## ${kind}`);
        for (const entry of delta.entries.filter((e) => e.kind === kind)) {
            lines.push('');
            lines.push(`### ${entry.id} — ${entry.title}`);
            lines.push(`- Statement: ${entry.statement}`);
            if (entry.previous)
                lines.push(`- Previous: ${entry.previous}`);
            lines.push(`- Targets: ${entry.targets.join(', ')}`);
            if ((entry.contracts ?? []).length > 0)
                lines.push(`- Contracts: ${(entry.contracts ?? []).join(', ')}`);
            if (entry.rationale)
                lines.push(`- Rationale: ${entry.rationale}`);
            lines.push(`- Strangler: ${entry.strangler ?? 'legacy'}`);
        }
        lines.push('');
    }
    return lines.join('\n');
};
export const parseDeltaSpec = (markdown) => {
    const header = markdown.match(/^# Delta:\s*(.+?)\s*—\s*(.+)$/m);
    const status = (markdown.match(/^Status:\s*(proposed|approved|merged)$/m)?.[1] ?? 'proposed');
    const base = markdown.match(/^Base:\s*(.+)$/m)?.[1]?.trim();
    const delta = {
        feature: header?.[1]?.trim() ?? 'unknown',
        title: header?.[2]?.trim() ?? '',
        status,
        ...(base ? { base } : {}),
        entries: [],
    };
    let kind = null;
    let current = null;
    const push = () => {
        if (current && kind)
            delta.entries.push(current);
        current = null;
    };
    // HTML comments are authoring guidance in the scaffold, not entries. Skipping them here keeps a
    // commented example from being parsed as a real requirement.
    let inComment = false;
    for (const raw of markdown.split('\n')) {
        const line = raw.trimEnd();
        if (inComment) {
            if (line.includes('-->'))
                inComment = false;
            continue;
        }
        if (line.trimStart().startsWith('<!--')) {
            if (!line.includes('-->'))
                inComment = true;
            continue;
        }
        const section = line.match(/^## (ADDED|MODIFIED|REMOVED|RENAMED)\s*$/);
        if (section) {
            push();
            kind = section[1];
            continue;
        }
        if (/^## /.test(line)) {
            push();
            kind = null;
            continue;
        }
        if (!kind)
            continue;
        const heading = line.match(/^### (REQ-[A-Z0-9-]+-\d{3})\s*—\s*(.+)$/);
        if (heading) {
            push();
            current = {
                id: heading[1],
                kind,
                title: heading[2].trim(),
                statement: '',
                targets: [],
            };
            continue;
        }
        const field = line.match(/^- (Statement|Previous|Targets|Contracts|Rationale|Strangler):\s*(.*)$/);
        if (field && current) {
            const [, key, value] = field;
            if (key === 'Statement')
                current.statement = value.trim();
            else if (key === 'Previous')
                current.previous = value.trim();
            else if (key === 'Targets')
                current.targets = value.split(',').map((t) => t.trim()).filter(Boolean);
            else if (key === 'Contracts')
                current.contracts = value.split(',').map((t) => t.trim()).filter(Boolean);
            else if (key === 'Rationale')
                current.rationale = value.trim();
            else if (key === 'Strangler')
                current.strangler = value.trim();
        }
    }
    push();
    return delta;
};
/** Where a delta spec lives inside a feature directory. */
export const deltaSpecFileName = () => 'delta.md';
