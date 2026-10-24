/**
 * "Where are we?" (REQ-VR-009): for each run — current phase and step, progress in steps and in
 * cost-weighted %, what is pending, open cards and events — plus a checkpoint file to resume from.
 * Percentages are counts of planned work, not a schedule; the time estimate is labelled uncalibrated.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listRuns, nextDirective, readState, stepMetrics } from './engine.js';
import { listEventRecords } from './dynamicRules.js';
import { listCards } from './hilCards.js';
import { stepCatalogue } from './playbook.js';
export const bar = (pct, width = 24) => {
    const n = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
    return `[${'█'.repeat(n)}${'░'.repeat(width - n)}] ${String(Math.round(Math.max(0, Math.min(100, pct)))).padStart(3)}%`;
};
export const runProgress = async (cwd, feature) => {
    const s = await readState(cwd, feature);
    if (!s)
        return null;
    const cat = stepCatalogue();
    const active = s.steps.filter((x) => x.status !== 'skipped');
    const done = active.filter((x) => x.status === 'done');
    const cost = (x) => cat.get(x.use)?.cost ?? 1;
    const totalCost = active.reduce((a, x) => a + cost(x), 0);
    const doneCost = done.reduce((a, x) => a + cost(x), 0);
    const current = active.find((x) => x.status !== 'done') ?? null;
    const phases = [];
    for (const x of active) {
        const p = phases.find((q) => q.phase === x.phase) ?? (phases.push({ phase: x.phase, done: 0, total: 0 }), phases[phases.length - 1]);
        p.total += 1;
        if (x.status === 'done')
            p.done += 1;
    }
    const metrics = await stepMetrics(cwd, feature);
    const timed = metrics.filter((m) => m.elapsedS !== null && done.some((d) => d.id === m.step));
    const avg = timed.length >= 3 ? timed.reduce((a, m) => a + (m.elapsedS ?? 0), 0) / timed.length : null;
    const cards = (await listCards(cwd, feature)).filter((c) => !c.answer).map((c) => ({ id: c.card.id, step: c.card.step, question: c.card.question }));
    const events = (await listEventRecords(cwd, feature)).filter((r) => !r.resolvedAt && r.decision.event.type !== 'wave-start').map((r) => r.decision.event.id);
    return {
        feature,
        playbook: s.playbook,
        level: s.level ?? null,
        ceremony: s.ceremony ?? null,
        parked: s.parked,
        done: done.length,
        total: active.length,
        percent: active.length ? Math.round((done.length / active.length) * 100) : 100,
        weightedPercent: totalCost ? Math.round((doneCost / totalCost) * 100) : 100,
        currentPhase: current?.phase ?? null,
        current: current ? { id: current.id, status: current.status, use: current.use } : null,
        phases,
        pending: active.filter((x) => x.status !== 'done').map((x) => `${x.id} (${x.status}${x.review === 'human' ? ', human gate' : ''})`),
        openCards: cards,
        openEvents: events,
        elapsedS: Math.round((Date.now() - Date.parse(s.startedAt)) / 1000),
        estimateRemainingS: avg === null ? null : Math.round(avg * (active.length - done.length)),
        next: await nextDirective(cwd, feature),
    };
};
export const allProgress = async (cwd) => (await Promise.all((await listRuns(cwd)).map((r) => runProgress(cwd, r.feature)))).filter(Boolean);
const dur = (s) => (s >= 86400 ? `${Math.round(s / 3600)} h` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
export const renderProgress = (p) => [
    `${p.feature} · ${p.playbook}${p.level ? ` · ${p.level}` : ''}${p.parked ? ` · PARKED: ${p.parked}` : ''}`,
    `  ${bar(p.weightedPercent)}  ${p.done}/${p.total} steps · weighted by step cost (${p.percent}% by count)`,
    `  phase: ${p.currentPhase ?? 'done'}${p.current ? ` · now: ${p.current.id} (${p.current.status})` : ''}`,
    ...p.phases.map((ph) => `    ${ph.done === ph.total ? '✓' : ph.phase === p.currentPhase ? '▶' : '·'} ${ph.phase.padEnd(22)} ${ph.done}/${ph.total}`),
    ...(p.openCards.length ? [`  waiting for a person: ${p.openCards.map((c) => `${c.id} (${c.step})`).join(', ')}`] : []),
    ...(p.openEvents.length ? [`  open events: ${p.openEvents.join(', ')}`] : []),
    `  elapsed ${dur(p.elapsedS)}${p.estimateRemainingS !== null ? ` · remaining ~${dur(p.estimateRemainingS)} (uncalibrated: average of finished steps)` : ''}`,
];
export const progressLine = (ps) => ps.length ? ps.map((p) => `${p.feature} ${p.weightedPercent}%${p.current ? ` ${p.current.id}` : ' done'}${p.openCards.length ? ` ⚑${p.openCards.length}` : ''}`).join(' | ') : 'no runs';
/** A resume note anyone (person or agent) can pick up from (REQ-VR-009). */
export const saveCheckpoint = async (cwd, ps, note) => {
    const at = new Date().toISOString();
    const md = [
        '# Checkpoint — where we are',
        '',
        `Saved ${at}${note ? ` · ${note}` : ''}. Regenerate with \`steelfoundry where --save\`.`,
        '',
        ...ps.flatMap((p) => [
            `## ${p.feature} (${p.playbook}) — ${p.weightedPercent}%`,
            '',
            `- Phase: ${p.currentPhase ?? 'done'} · now: ${p.current ? `${p.current.id} (${p.current.status})` : '—'}`,
            `- Progress: ${p.done}/${p.total} steps`,
            `- Next: \`steelfoundry next ${p.feature}\` → ${p.next.kind}${'step' in p.next ? ` ${p.next.step}` : ''}`,
            ...(p.openCards.length ? [`- Waiting for a person: ${p.openCards.map((c) => `${c.id} — ${c.question}`).join('; ')}`] : []),
            ...(p.openEvents.length ? [`- Open events: ${p.openEvents.join(', ')}`] : []),
            '- Pending:',
            ...p.pending.map((x) => `  - ${x}`),
            '',
        ]),
    ].join('\n');
    const dir = path.join(cwd, '.sdd', 'state');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'checkpoint.md'), md, 'utf8');
    await writeFile(path.join(dir, 'checkpoint.json'), `${JSON.stringify({ at, note: note ?? null, runs: ps }, null, 2)}\n`, 'utf8');
    return { md: '.sdd/state/checkpoint.md', json: '.sdd/state/checkpoint.json' };
};
