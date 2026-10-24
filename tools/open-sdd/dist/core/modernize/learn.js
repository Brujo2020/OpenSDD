/**
 * Learning from events (REQ-MK-009). A resolved event becomes (1) a reflection draft for the memory
 * pipeline — confounded while fewer than two resolved events of that type exist, so one incident is a
 * hypothesis, not a lesson — and (2) a rule candidate when the event shows a structural gap. A rule
 * candidate changes the process only when a named, confirmed person adopts it.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readAudit } from '../engine.js';
import { listEventRecords, projectRulesFile, readEventRecord } from '../dynamicRules.js';
import { stepCatalogue } from '../playbook.js';
import { modernizeDir } from './portfolio.js';
export const eventMetrics = async (cwd, feature, id) => {
    const rec = await readEventRecord(cwd, feature, id);
    if (!rec)
        return null;
    const cat = stepCatalogue();
    const steps = rec.decision.steps;
    const ids = new Set(steps.map((s) => s.id));
    const audit = await readAudit(cwd, feature);
    const durationS = rec.resolvedAt ? Math.round((Date.parse(rec.resolvedAt) - Date.parse(rec.decision.event.at)) / 1000) : null;
    return {
        event: id,
        type: rec.decision.event.type,
        severity: rec.decision.severity,
        steps: steps.length,
        cost: steps.reduce((a, s) => a + (cat.get(s.use)?.cost ?? 1), 0),
        cards: rec.revisions.reduce((a, r) => a + r.cards.length, 0),
        rejections: audit.filter((e) => e.step && ids.has(e.step) && e.event === 'STEP_REJECTED').length,
        proposals: { admitted: rec.proposals.filter((p) => p.status === 'admitted').length, rejected: rec.proposals.filter((p) => p.status === 'rejected').length },
        durationS,
        deadlineHours: rec.decision.deadlineHours,
        withinDeadline: durationS === null || rec.decision.deadlineHours === null ? null : durationS <= rec.decision.deadlineHours * 3600,
    };
};
const candidatesDir = (cwd) => modernizeDir(cwd, 'rule-candidates');
export const learnFromEvent = async (cwd, feature, id) => {
    const rec = await readEventRecord(cwd, feature, id);
    if (!rec)
        return { ok: false, message: `no event ${id}` };
    if (!rec.resolvedAt)
        return { ok: false, message: `${id} is not resolved yet: steelfoundry migrate resolve ${feature} --event ${id}` };
    const m = (await eventMetrics(cwd, feature, id));
    const sameType = (await listEventRecords(cwd, feature)).filter((r) => r.resolvedAt && r.decision.event.type === m.type);
    const runs = sameType.length;
    const assessed = rec.decision.steps.filter((s) => s.use === 'opensdd:modernize/exposure-assessment').map((s) => s.component);
    const dual = rec.decision.steps.filter((s) => /:(legacy|modern)$/.test(s.id)).map((s) => s.component);
    const observed = `${m.steps} step(s), cost ${m.cost}, ${m.cards} card(s), ${m.rejections} rejection(s)${m.withinDeadline === null ? '' : m.withinDeadline ? ', within deadline' : ', beyond deadline'}`;
    const reflection = {
        rows: [{ component: 'dynamic-rules', change: `${m.type} handled by ${[...new Set(rec.decision.steps.map((s) => s.rule))].join(', ')}`, observed, runs, ...(runs >= 2 ? { verdict: m.withinDeadline === false ? 'hurt' : 'helped' } : {}) }],
        lesson: {
            cue: assessed.length ? `${m.type} on a component without a dependency inventory` : `${m.type} handling`,
            lesson: assessed.length
                ? `Scan dependencies (SBOM) at wave start: the next advisory on ${[...new Set(assessed)].join(', ')} becomes a lookup instead of an exposure assessment.`
                : dual.length
                    ? `During parallel run every patch is double work (${[...new Set(dual)].join(', ')}); keep parallel-run windows short.`
                    : `The ${m.type} lane completed: ${observed}.`,
            evidence: [0],
            confidence: runs >= 2 ? 'medium' : 'low',
            kind: 'invariant',
            stepType: '*',
            origins: sameType.map((r) => r.decision.event.id),
            tags: ['modernize', m.type],
        },
    };
    let candidate;
    let candidateFile;
    if (assessed.length) {
        candidate = {
            id: 'LEARNED-SBOM-AT-WAVE-START',
            on: 'wave-start',
            when: 'sbom != true & disposition != retire & disposition != retain',
            priority: 5,
            rationale: `learned from ${id}: components without an SBOM needed a ${m.cost}-cost exposure assessment under a ${m.deadlineHours ?? '?'} h deadline`,
            actions: [{ type: 'insert-steps', steps: [{ id: 'dependency-scan', use: 'opensdd:modernize/dependency-scan' }] }],
            provenance: { fromEvent: id, digest: rec.decision.digest, metrics: m },
        };
        await mkdir(candidatesDir(cwd), { recursive: true });
        candidateFile = path.join(candidatesDir(cwd), `${candidate.id}.json`);
        const existing = JSON.parse((await readFile(candidateFile, 'utf8').catch(() => 'null')));
        const seen = [...new Set([...(existing?.seen ?? []), id])];
        await writeFile(candidateFile, `${JSON.stringify({ ...candidate, seen, ...(existing?.adopted ? { adopted: existing.adopted } : {}) }, null, 2)}\n`, 'utf8');
    }
    return { ok: true, message: `${id}: ${observed}; ${runs} resolved ${m.type} event(s)${candidate ? `; rule candidate ${candidate.id}` : ''}`, metrics: m, reflection, candidate, candidateFile };
};
export const listCandidates = async (cwd) => {
    const names = (await readdir(candidatesDir(cwd)).catch(() => [])).filter((n) => n.endsWith('.json')).sort();
    return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(candidatesDir(cwd), n), 'utf8'))));
};
/** A person adopts a candidate: it is appended to the project rules (REQ-MK-009). */
export const adoptCandidate = async (cwd, id, by) => {
    const file = path.join(candidatesDir(cwd), `${id}.json`);
    const raw = await readFile(file, 'utf8').catch(() => null);
    if (!raw)
        return { ok: false, message: `no rule candidate ${id}` };
    const cand = JSON.parse(raw);
    if (cand.adopted)
        return { ok: false, message: `${id} is already adopted` };
    const rulesRaw = await readFile(projectRulesFile(cwd), 'utf8').catch(() => null);
    const set = rulesRaw ? JSON.parse(rulesRaw) : { schema: 'open-sdd.dynamic-rules/1', rules: [] };
    const { seen: _seen, adopted: _adopted, ...rule } = cand;
    set.rules = [...set.rules.filter((r) => r.id !== id), { ...rule, provenance: { ...(rule.provenance ?? {}), adoptedBy: by.name, adoptedEmail: by.email, adoptedAt: new Date().toISOString() } }];
    await mkdir(path.dirname(projectRulesFile(cwd)), { recursive: true });
    await writeFile(projectRulesFile(cwd), `${JSON.stringify(set, null, 2)}\n`, 'utf8');
    await writeFile(file, `${JSON.stringify({ ...cand, adopted: { by: by.name, email: by.email, at: new Date().toISOString() } }, null, 2)}\n`, 'utf8');
    return { ok: true, message: `${id} adopted by ${by.name}: appended to .sdd/settings/dynamic-rules.json` };
};
