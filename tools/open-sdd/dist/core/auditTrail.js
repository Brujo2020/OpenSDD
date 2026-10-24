/**
 * Registro de decisiones para auditoría: una fila por paso que respondió a las preguntas de un auditor
 * (por ejemplo de un banco): QUIÉN decidió (persona, agente, regla o sistema), QUÉ, CUÁNDO, POR QUÉ y
 * sobre qué REQUISITOS y PRINCIPIOS de la constitución, con su evidencia.
 *
 * Fuente: los registros `.sdd/engine/<feature>.audit.jsonl` (encadenados por hash) más
 * `_governance` (ratificaciones). Se lee; nunca se reescribe. Cada fila dice si su registro conserva la
 * cadena íntegra: una fila de un registro manipulado no se presenta como prueba.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyAuditChain } from './engine.js';
/** Eventos que el motor emite por sí mismo (sin persona ni regla detrás). */
const SYSTEM_EVENTS = /^(RUN_STARTED|PHASE_|STEPS_INSERTED|LEVEL_RAISED|GATE_REFUSED|CHECK_|DEADLINE_APPLIED)/;
const actorOf = (e) => {
    if (e.actor)
        return e.actor;
    if (e.event === 'DEADLINE_APPLIED')
        return { name: e.by ?? 'deadline', kind: 'system' };
    if (e.event.startsWith('EVENT_'))
        return { name: 'dynamic-rules', kind: 'rule' };
    if (e.by && !SYSTEM_EVENTS.test(e.event))
        return { name: e.by, kind: 'human' };
    if (e.event.startsWith('STEP_'))
        return { name: e.by ?? 'agent', kind: e.by ? 'human' : 'agent' };
    return { name: 'open-sdd', kind: 'system' };
};
export const readAuditTrail = async (cwd, opts = {}) => {
    const dir = path.join(cwd, '.sdd', 'engine');
    const files = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.audit.jsonl')).sort();
    const wanted = files
        .map((name) => name.replace(/\.audit\.jsonl$/, ''))
        .filter((feature) => !opts.feature || feature === opts.feature || feature === '_governance');
    const records = [];
    const chains = [];
    for (const feature of wanted) {
        const text = await readFile(path.join(dir, `${feature}.audit.jsonl`), 'utf8').catch(() => '');
        const lines = text.split('\n').filter(Boolean);
        const chain = verifyAuditChain(text);
        chains.push({ feature, ok: chain.ok, ...(chain.brokenAt ? { brokenAt: chain.brokenAt } : {}), lines: lines.length });
        lines.forEach((line, index) => {
            let e;
            try {
                e = JSON.parse(line);
            }
            catch {
                return;
            }
            records.push({
                seq: index + 1,
                at: e.at,
                feature,
                event: e.event,
                step: e.step ?? null,
                actor: actorOf(e),
                why: e.why ?? e.detail ?? '',
                requirements: e.requirements ?? [],
                principles: e.principles ?? [],
                rule: e.rule ?? null,
                evidence: e.evidence ?? e.problems ?? [],
                chainIntact: chain.ok,
            });
        });
    }
    records.sort((a, b) => a.at.localeCompare(b.at) || a.feature.localeCompare(b.feature) || a.seq - b.seq);
    const byActorKind = { human: 0, agent: 0, rule: 0, system: 0 };
    for (const record of records)
        byActorKind[record.actor.kind] += 1;
    return { schema: 'open-sdd.audit-trail/1', features: wanted, records, chains, byActorKind };
};
/** Filtros de la pregunta del auditor: un requisito, un principio, un tipo de actor, una persona. */
export const filterTrail = (trail, f) => trail.records.filter((r) => (!f.requirement || r.requirements.includes(f.requirement)) &&
    (!f.principle || r.principles.includes(f.principle)) &&
    (!f.actor || r.actor.kind === f.actor) &&
    (!f.who || r.actor.name.toLowerCase().includes(f.who.toLowerCase())) &&
    (!f.decisionsOnly || r.actor.kind !== 'system'));
const cell = (v) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const trailCsv = (records) => `${[
    ['at', 'feature', 'event', 'step', 'actor', 'actor_kind', 'email', 'why', 'requirements', 'principles', 'rule', 'evidence', 'chain_intact'],
    ...records.map((r) => [
        r.at,
        r.feature,
        r.event,
        r.step ?? '',
        r.actor.name,
        r.actor.kind,
        r.actor.email ?? '',
        r.why,
        r.requirements.join(' '),
        r.principles.join(' '),
        r.rule ?? '',
        r.evidence.join(' | '),
        String(r.chainIntact),
    ]),
]
    .map((row) => row.map(cell).join(','))
    .join('\n')}\n`;
