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
import { approverAllowed } from './hilIdentity.js';
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
    const identity = opts.identity ?? { name: '', email: '' };
    if (opts.requireApprovers && opts.channel !== 'deadline' && !opts.approvers)
        return { ok: false, message: 'APPROVERS_REQUIRED: this run has strict ceremony; declare who may answer in .sdd/settings/approvers.json' };
    if (opts.channel !== 'deadline' && !approverAllowed(opts.approvers ?? null, by, identity))
        return { ok: false, message: `APPROVER_NOT_LISTED: «${by}» (${identity.email || 'no git email'}) is not in .sdd/settings/approvers.json` };
    const grants = picked.effect === 'approve' || picked.effect === 'override' || picked.effect === 'accept-as-is';
    if (grants && opts.agent && opts.confirm !== id)
        return { ok: false, message: `AGENT_SESSION: an approval from an agent session needs \`--confirm ${id}\` typed by the person (set OPEN_SDD_HUMAN=1 in a human shell without TTY)` };
    const answer = {
        id,
        option: picked.key,
        effect: picked.effect,
        by,
        at: (opts.now ?? new Date()).toISOString(),
        recommended: picked.key === card.recommend,
        changed: Boolean(opts.changed),
        ...(opts.identity ? { identity: opts.identity } : {}),
        channel: opts.channel ?? (opts.agent ? 'agent-confirmed' : 'human'),
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
/** Unanswered cards whose deadline has passed (REQ-V37-002). */
export const overdueCards = async (cwd, feature, now = new Date()) => (await listCards(cwd, feature))
    .filter((r) => !r.answer && Date.parse(r.card.createdAt) + r.card.deadlineHours * 3_600_000 <= now.getTime())
    .map((r) => r.card);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * One self-contained review page for the open cards of a feature (REQ-V37-003): no script, no
 * network. Each card shows its question, options with consequences, evidence, an optional diff and
 * the exact command a person types to answer.
 */
export const renderReviewHtml = (feature, cards, diffs = {}) => {
    const body = cards
        .map((c) => {
        const opts = c.options
            .map((o) => `<tr${o.key === c.recommend ? ' class="rec"' : ''}><td><b>${o.key}</b></td><td>${esc(o.label)}</td><td>${esc(o.consequence)}</td><td><code>${o.effect}</code></td><td><code>open-sdd hil answer ${esc(feature)} ${c.id} ${o.key} --by "&lt;name&gt;"${o.effect === 'approve' || o.effect === 'override' || o.effect === 'accept-as-is' ? ` --confirm ${c.id}` : ''}</code></td></tr>`)
            .join('');
        const diff = diffs[c.id] ?? c.diff;
        return `<section><h2>${c.id} · ${esc(c.step)} <small>${esc(c.trigger)}</small></h2><p class="q">${esc(c.question)}</p>
<table><thead><tr><th></th><th>Option</th><th>Consequence</th><th>Effect</th><th>Answer with</th></tr></thead><tbody>${opts}</tbody></table>
<p><b>Recommended:</b> ${c.recommend} · <b>Default after ${c.deadlineHours} h:</b> ${c.default} (never approves)</p>
<h3>Evidence</h3><ul>${c.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${diff ? `<h3>Diff</h3><pre>${esc(diff)}</pre>` : ''}</section>`;
    })
        .join('\n');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HIL review · ${esc(feature)}</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#1e293b;--mut:#64748b;--line:#e2e8f0;--rec:#dcfce7}@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--mut:#94a3b8;--line:#334155;--rec:#14532d}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px}section{border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:16px 0}
h2 small{color:var(--mut);font-weight:400}.q{font-size:1.1em}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}tr.rec{background:var(--rec)}pre{overflow-x:auto;border:1px solid var(--line);padding:8px}</style></head>
<body><h1>Decisions waiting for a person · ${esc(feature)}</h1><p>${cards.length} open card(s). Nothing is approved by silence; an approval from an agent session needs <code>--confirm &lt;id&gt;</code> typed by you.</p>
${body || '<p>No open cards.</p>'}</body></html>
`;
};
