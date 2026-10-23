/**
 * Prepared human decisions (REQ-PB-012, REQ-PB-013, REQ-PB-016).
 *
 * When an escalation trigger fires (`hitl.ts`) or a step marked `review: human` is reached, the agent
 * stops only AFTER a decision card exists, so the reviewer is never asked to rebuild context:
 *
 *   one question · 2–4 options, each with its consequence and effect · a recommendation ·
 *   evidence lines `<kept|revised|dropped> -> <change> -> <evidence with counts>` (Harness²'s
 *   decision-note format) · the diff under review · what happens without an answer.
 *
 * The model may draft the text; this module decides whether the card is presentable. Rules that
 * come from AI-DLC's gate protocol: `accept-as-is` appears from the third revision, an override of a
 * blocking gate is its own named decision and is refused in autonomous mode, and an irreversible
 * action is never the default. Alternatives produced by agents are shown under ids shuffled by a
 * seed derived from feature and step, so the reviewer judges content, not origin.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const EVIDENCE_LINE = /^(kept|revised|dropped)\s*->\s*.+\s*->\s*.*\d.*$/i;
export const IRREVERSIBLE = 'irreversible-damage';
const hilDir = (cwd, feature) => path.join(cwd, '.sdd', 'hil', feature);
export const validateCard = (card, ctx = {}) => {
    const errors = [];
    if (!card.question?.trim())
        errors.push('the card needs exactly one question');
    if ((card.question.match(/\?/g) ?? []).length > 1)
        errors.push('one question per card: split the others into their own cards');
    if (card.options.length < 2 || card.options.length > 4)
        errors.push(`2–4 options, got ${card.options.length}`);
    const keys = card.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length)
        errors.push('option keys must be unique');
    for (const o of card.options)
        if (!o.consequence?.trim())
            errors.push(`option ${o.key} has no consequence`);
    if (!keys.includes(card.recommend))
        errors.push(`recommendation ${card.recommend} is not an option`);
    if (!keys.includes(card.default))
        errors.push(`default ${card.default} is not an option`);
    if (card.evidence.length === 0)
        errors.push('a card without evidence lines cannot be presented');
    for (const line of card.evidence)
        if (!EVIDENCE_LINE.test(line))
            errors.push(`evidence line must read "<kept|revised|dropped> -> <change> -> <evidence with counts>": «${line}»`);
    const def = card.options.find((o) => o.key === card.default);
    if (def && (def.effect === 'approve' || def.effect === 'override' || def.effect === 'accept-as-is'))
        errors.push('the action taken without an answer may only park or reject: nothing is approved by silence');
    if (card.trigger === IRREVERSIBLE && def && def.effect !== 'park')
        errors.push('an irreversible-damage card must default to park');
    if (card.options.some((o) => o.effect === 'accept-as-is') && (ctx.revisions ?? 0) < 3)
        errors.push('accept-as-is is only offered from the third revision');
    return errors;
};
const nextId = async (cwd, feature) => {
    const names = await readdir(hilDir(cwd, feature)).catch(() => []);
    const max = names.map((n) => Number(n.match(/^HIL-(\d+)\.json$/)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0);
    return `HIL-${String(max + 1).padStart(4, '0')}`;
};
export const renderCard = (card) => {
    const lines = [
        `# ${card.id} · ${card.trigger} · step ${card.step}`,
        '',
        `**Question:** ${card.question}`,
        '',
        '| Option | Consequence | Effect |',
        '|---|---|---|',
        ...card.options.map((o) => `| ${o.key}${o.key === card.recommend ? ' (recommended)' : ''} · ${o.label} | ${o.consequence} | ${o.effect} |`),
        '',
        '**Evidence**',
        ...card.evidence.map((e) => `- ${e}`),
        '',
        card.diff ? `**Diff under review:** \`${card.diff}\`` : '**Diff under review:** none attached',
        '',
        `**If nobody answers in ${card.deadlineHours} h:** ${card.default} (${card.options.find((o) => o.key === card.default)?.effect}). Nothing is approved by silence.`,
        '',
        `Answer: \`open-sdd hil answer ${card.feature} ${card.id} <option> --by "<name>"\``,
        '',
    ];
    return lines.join('\n');
};
export const prepareCard = async (cwd, input, ctx = {}) => {
    const errors = validateCard(input, ctx);
    if (errors.length)
        return { ok: false, errors };
    const card = { ...input, id: await nextId(cwd, input.feature), createdAt: (ctx.now ?? new Date()).toISOString() };
    await mkdir(hilDir(cwd, input.feature), { recursive: true });
    const base = path.join(hilDir(cwd, input.feature), card.id);
    await writeFile(`${base}.json`, `${JSON.stringify(card, null, 2)}\n`, 'utf8');
    await writeFile(`${base}.md`, renderCard(card), 'utf8');
    return { ok: true, errors: [], card, file: `${base}.md` };
};
export const readCard = async (cwd, feature, id) => {
    const raw = await readFile(path.join(hilDir(cwd, feature), `${id}.json`), 'utf8').catch(() => null);
    return raw ? JSON.parse(raw) : null;
};
export const readAnswer = async (cwd, feature, id) => {
    const raw = await readFile(path.join(hilDir(cwd, feature), `${id}.answer.json`), 'utf8').catch(() => null);
    return raw ? JSON.parse(raw) : null;
};
export const listCards = async (cwd, feature) => {
    const names = (await readdir(hilDir(cwd, feature)).catch(() => [])).filter((n) => /^HIL-\d+\.json$/.test(n)).sort();
    const out = [];
    for (const n of names) {
        const id = n.replace(/\.json$/, '');
        const card = await readCard(cwd, feature, id);
        if (card)
            out.push({ card, answer: await readAnswer(cwd, feature, id) });
    }
    return out;
};
export const recordAnswer = async (cwd, feature, id, option, by, opts = {}) => {
    const card = await readCard(cwd, feature, id);
    if (!card)
        return { ok: false, message: `no card ${id} for ${feature}` };
    if (await readAnswer(cwd, feature, id))
        return { ok: false, message: `${id} is already answered` };
    if (!by.trim())
        return { ok: false, message: 'an answer needs --by "<name>": approvals require a present, named person' };
    const picked = card.options.find((o) => o.key === option.toUpperCase());
    if (!picked)
        return { ok: false, message: `option ${option} is not one of ${card.options.map((o) => o.key).join(', ')}` };
    if (picked.effect === 'override' && opts.autonomous)
        return { ok: false, message: 'an override of a blocking gate is refused in autonomous mode' };
    const answer = {
        id,
        option: picked.key,
        effect: picked.effect,
        by,
        at: (opts.now ?? new Date()).toISOString(),
        recommended: picked.key === card.recommend,
        changed: Boolean(opts.changed),
    };
    await writeFile(path.join(hilDir(cwd, feature), `${id}.answer.json`), `${JSON.stringify(answer, null, 2)}\n`, 'utf8');
    return { ok: true, message: `${id}: ${picked.key} (${picked.effect}) by ${by}`, answer, card };
};
/** Deterministic order for comparing agent-produced alternatives: sha1(seed + item). */
export const seededOrder = (items, seed) => [...items].sort((a, b) => {
    const ha = createHash('sha1').update(`${seed}|${a}`).digest('hex');
    const hb = createHash('sha1').update(`${seed}|${b}`).digest('hex');
    return ha < hb ? -1 : ha > hb ? 1 : 0;
});
/** Neutral labels (`ALT-1`, `ALT-2`, …) for alternatives, shuffled by feature and step. */
export const anonymize = (alternatives, feature, step) => seededOrder(alternatives, `${feature}|${step}`).map((source, i) => ({ label: `ALT-${i + 1}`, source }));
export const triggerStats = (records) => {
    const by = new Map();
    for (const { card, answer } of records) {
        if (!answer)
            continue;
        const s = by.get(card.trigger) ?? { trigger: card.trigger, decisions: 0, useless: 0, share: 0 };
        s.decisions += 1;
        if (answer.recommended && !answer.changed && (answer.effect === 'approve' || answer.effect === 'accept-as-is'))
            s.useless += 1;
        s.share = s.useless / s.decisions;
        by.set(card.trigger, s);
    }
    return [...by.values()].sort((a, b) => a.trigger.localeCompare(b.trigger));
};
/** A proposal, never a change: it is applied only through `playbook save`. */
export const thresholdProposals = (stats, maxUseless, minDecisions = 10) => stats
    .filter((s) => s.decisions >= minDecisions && s.share > maxUseless)
    .map((s) => ({
    trigger: s.trigger,
    evidence: `kept -> raise the ${s.trigger} threshold -> ${s.useless}/${s.decisions} escalations answered with the recommendation and no change (${(s.share * 100).toFixed(0)}% > ${(maxUseless * 100).toFixed(0)}%)`,
    proposal: `relax the ${s.trigger} trigger one step (or mark its steps review: auto)`,
}));
