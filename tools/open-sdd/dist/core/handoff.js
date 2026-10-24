/**
 * Handoff packs (REQ-PB-008): bounded, need-to-know, and shaped against "lost in the middle".
 *
 * Models recall the start and the end of a long context best. A pack is therefore BUILT, not
 * accumulated:
 *
 *   HEAD  goal · acceptance ids · principles in force · open decisions
 *   BODY  only the artifacts the step consumes: path · sha256 · ≤40-line summary;
 *         ≤5 promoted lessons, each labelled a hypothesis; omitted items by path
 *   TAIL  principles · acceptance ids · goal again, last — "restate these before writing"
 *
 * The step contract asks the agent to restate goal and acceptance ids before its first write; the
 * recall check compares ids deterministically and blocks the gate with `RECALL_MISMATCH`. On resume
 * the hashes tell which consumed files changed since the pack was written (`stale`).
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { latestAidlcIntent } from './profile.js';
import { sha256 } from './questions.js';
import { selectLessons } from './memoryStore.js';
const SUMMARY_LINES = 40;
export const handoffDir = (cwd, feature) => path.join(cwd, '.sdd', 'handoff', feature);
const posix = (p) => p.split(path.sep).join('/');
export const estimateTokens = (text) => Math.ceil(text.length / 4);
const TRIAD = {
    'sdd:requirements': ['requirements.md'],
    'sdd:design': ['plan.md', 'design.md'],
    'sdd:tasks': ['tasks.md'],
    'sdd:brief': ['brief.md'],
    'sdd:delta': ['delta.md'],
    'sdd:acceptance': ['acceptance.feature'],
    'sdd:spec': ['spec.json'],
};
/** Modernize Kit artifacts live once per repository, not per feature (REQ-MK-006/007). */
const MODERNIZE = {
    'sdd:portfolio-assessment': '.sdd/modernize/assessment.json',
    'sdd:dispositions': '.sdd/modernize/dispositions.json',
    'sdd:wave-plan': '.sdd/modernize/waves.json',
};
const findFile = async (root, name, depth = 5) => {
    if (depth < 0)
        return null;
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries)
        if (e.isFile() && e.name === name)
            return path.join(root, e.name);
    for (const e of entries)
        if (e.isDirectory()) {
            const hit = await findFile(path.join(root, e.name), name, depth - 1);
            if (hit)
                return hit;
        }
    return null;
};
/** Where an artifact lives: the steelfoundry triad, steering, or the newest AI-DLC intent record. */
export const resolveArtifact = async (cwd, feature, artifact) => {
    if (artifact in TRIAD) {
        const hit = TRIAD[artifact].map((f) => path.join(cwd, '.sdd', 'specs', feature, f)).find((p) => existsSync(p));
        return hit ? [posix(path.relative(cwd, hit))] : [];
    }
    if (artifact in MODERNIZE)
        return existsSync(path.join(cwd, MODERNIZE[artifact])) ? [MODERNIZE[artifact]] : [];
    if (artifact === 'sdd:steering') {
        const dir = path.join(cwd, '.sdd', 'steering');
        return (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.md')).sort().map((f) => posix(path.join('.sdd', 'steering', f)));
    }
    if (artifact === 'sdd:constitution')
        return existsSync(path.join(cwd, '.sdd', 'steering', 'constitution.md')) ? ['.sdd/steering/constitution.md'] : [];
    if (artifact.startsWith('sdd:'))
        return [];
    const intent = await latestAidlcIntent(cwd);
    if (!intent)
        return [];
    const hit = await findFile(path.join(cwd, intent), `${artifact}.md`);
    return hit ? [posix(path.relative(cwd, hit))] : [];
};
/** Requirement and acceptance ids of a feature, in document order. */
export const acceptanceIds = async (cwd, feature) => {
    const text = await readFile(path.join(cwd, '.sdd', 'specs', feature, 'requirements.md'), 'utf8').catch(() => '');
    return [...new Set([...text.matchAll(/\b(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*|AC-\d+)\b/g)].map((m) => m[1]))];
};
export const principleIds = async (cwd, feature) => {
    const plan = (await readFile(path.join(cwd, '.sdd', 'specs', feature, 'plan.md'), 'utf8').catch(() => '')) + (await readFile(path.join(cwd, '.sdd', 'specs', feature, 'design.md'), 'utf8').catch(() => ''));
    const declared = plan.match(/_Constitution:\s*([^_\n]+)_/);
    if (declared)
        return declared[1].split(',').map((s) => s.trim()).filter(Boolean);
    const constitution = await readFile(path.join(cwd, '.sdd', 'steering', 'constitution.md'), 'utf8').catch(() => '');
    return [...constitution.matchAll(/^###\s+(C-[A-Z0-9-]+)/gm)].map((m) => m[1]);
};
export const renderHandoffMarkdown = (pack) => {
    const ids = pack.acceptance.join(', ') || '(none declared)';
    const principles = pack.principles.join(', ') || '(none declared)';
    const head = [
        `# Handoff · ${pack.feature} · ${pack.step}`,
        '',
        `**Goal:** ${pack.goal}`,
        `**Acceptance ids:** ${ids}`,
        `**Principles in force:** ${principles}`,
        `**Open decisions:** ${pack.openDecisions.join(', ') || 'none'}`,
        '',
    ];
    const body = [
        '## Inputs (open on demand; hashes detect stale files)',
        '',
        ...pack.items.flatMap((it) => [`### ${it.artifact} — \`${it.path}\``, `sha256 \`${it.sha256.slice(0, 16)}…\``, '', '```', it.summary, '```', '']),
        pack.lessons.length ? '## Lessons (hypotheses — re-verify here before relying on them)' : '',
        ...pack.lessons.map((l) => `- **${l.id}** (${l.confidence}) when ${l.cue}: ${l.lesson}`),
        pack.omitted.length ? `\n## Omitted for budget (${pack.budget} tokens)\n${pack.omitted.map((p) => `- ${p}`).join('\n')}` : '',
        '',
    ];
    const tail = [
        '---',
        'Before your first write, restate the goal and these acceptance ids exactly:',
        `**Principles in force:** ${principles}`,
        `**Acceptance ids:** ${ids}`,
        `**Goal:** ${pack.goal}`,
        '',
    ];
    return [...head, ...body, ...tail].join('\n');
};
export const writePack = async (cwd, input) => {
    const acceptance = await acceptanceIds(cwd, input.feature);
    const principles = await principleIds(cwd, input.feature);
    const lessons = await selectLessons(cwd, { stepType: input.use, profileType: input.profileType, before: input.runStartedAt });
    const items = [];
    const omitted = [];
    const pack = {
        schema: 'open-sdd.handoff/1',
        feature: input.feature,
        step: input.step,
        use: input.use,
        goal: input.goal,
        acceptance,
        principles,
        openDecisions: input.openDecisions ?? [],
        items,
        lessons: lessons.map((l) => ({ id: l.id, cue: l.cue, lesson: l.lesson, confidence: l.confidence, hypothesis: true })),
        omitted,
        tokens: 0,
        budget: input.budget,
        writtenAt: (input.now ?? new Date()).toISOString(),
    };
    for (const artifact of input.consumes) {
        for (const rel of await resolveArtifact(cwd, input.feature, artifact)) {
            const text = await readFile(path.join(cwd, rel), 'utf8').catch(() => null);
            if (text === null)
                continue;
            const item = { artifact, path: rel, sha256: sha256(text), summary: text.split(/\r?\n/).slice(0, SUMMARY_LINES).join('\n') };
            const projected = estimateTokens(renderHandoffMarkdown({ ...pack, items: [...items, item] }));
            if (projected > input.budget)
                omitted.push(rel);
            else
                items.push(item);
        }
    }
    const markdown = renderHandoffMarkdown(pack);
    pack.tokens = estimateTokens(markdown);
    const dir = handoffDir(cwd, input.feature);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${input.step}.json`);
    await writeFile(file, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
    await writeFile(path.join(dir, `${input.step}.HANDOFF.md`), markdown, 'utf8');
    return { pack, file, markdown };
};
export const readPack = async (cwd, feature, step) => {
    const raw = await readFile(path.join(handoffDir(cwd, feature), `${step}.json`), 'utf8').catch(() => null);
    return raw ? JSON.parse(raw) : null;
};
/** Consumed files whose content changed since the pack was written. */
export const staleItems = async (cwd, pack) => {
    const stale = [];
    for (const it of pack.items) {
        const text = await readFile(path.join(cwd, it.path), 'utf8').catch(() => null);
        if (text === null || sha256(text) !== it.sha256)
            stale.push(it.path);
    }
    return stale;
};
/** Compare a restatement with the pack: the same acceptance ids, and the step named in the goal. */
export const checkRecall = (pack, restatement) => {
    const said = new Set([...restatement.matchAll(/\b(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*|AC-\d+)\b/g)].map((m) => m[1]));
    const expected = new Set(pack.acceptance);
    const missing = [...expected].filter((id) => !said.has(id));
    const extra = [...said].filter((id) => !expected.has(id));
    const goalRestated = restatement.toLowerCase().includes(pack.step.toLowerCase());
    return { ok: missing.length === 0 && extra.length === 0 && goalRestated, missing, extra, goalRestated };
};
export const recordRecall = async (cwd, feature, step, result) => {
    await mkdir(handoffDir(cwd, feature), { recursive: true });
    await writeFile(path.join(handoffDir(cwd, feature), `${step}.recall.json`), `${JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
};
export const readRecall = async (cwd, feature, step) => {
    const raw = await readFile(path.join(handoffDir(cwd, feature), `${step}.recall.json`), 'utf8').catch(() => null);
    return raw ? JSON.parse(raw) : null;
};
