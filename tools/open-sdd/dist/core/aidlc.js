/**
 * AI-DLC interoperability (REQ-PB-011): read-only state, and the import mapping.
 *
 * AI-DLC writes its records under `aidlc/spaces/<space>/intents/<intent>/`. steelfoundry never writes
 * there. The import maps an intent into steelfoundry specs: one umbrella spec whose tasks are the units
 * of work (so `waves` and the wave referee order and verify them), and one spec per unit with its
 * requirements, plan and contracts. Every artifact without a triad role is skipped with a reason.
 * The unit dependency block's exact schema was not verified against AI-DLC source; the parser is
 * tolerant and a block it cannot read becomes an explicit skip, never a guessed order.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { latestAidlcIntent, readAidlcUnits } from './profile.js';
const MARKS = { ' ': 'not-started', '-': 'in-progress', '?': 'awaiting-approval', R: 'revising', x: 'completed', X: 'completed', S: 'skipped' };
export const readAidlcState = async (cwd) => {
    const intent = await latestAidlcIntent(cwd);
    if (!intent)
        return null;
    const text = await readFile(path.join(cwd, intent, 'aidlc-state.md'), 'utf8').catch(() => null);
    if (text === null)
        return { intent, stages: [] };
    const stages = [...text.matchAll(/^\s*[-*]\s*\[(.)\]\s+(.+?)\s*$/gm)].map((m) => ({ mark: m[1], name: m[2], status: MARKS[m[1]] ?? 'unknown' }));
    return { intent, stages };
};
export const summarizeAidlc = (stages) => {
    const done = stages.filter((s) => s.status === 'completed').length;
    const active = stages.filter((s) => s.status !== 'skipped').length;
    const current = stages.find((s) => ['in-progress', 'awaiting-approval', 'revising'].includes(s.status));
    return `${done}/${active} stages complete${current ? ` · ${current.status}: ${current.name}` : ''} (read-only)`;
};
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unit';
/** Tolerant parse of `unit-of-work-dependency.md`: `unit`/`name` entries with `depends_on`. */
export const parseUnitDependencies = (text, units) => {
    const block = text.match(/```ya?ml\s*\n([\s\S]*?)```/)?.[1] ?? '';
    const deps = Object.fromEntries(units.map((u) => [slugify(u), []]));
    if (!block.trim())
        return { deps, parsed: false };
    let current = null;
    let inList = false;
    for (const line of block.split('\n')) {
        const entry = line.match(/^\s*-?\s*(?:unit|name):\s*["']?(.+?)["']?\s*$/) ?? line.match(/^([A-Za-z0-9][\w -]*):\s*$/);
        if (entry) {
            current = slugify(entry[1]);
            deps[current] ??= [];
            inList = false;
            continue;
        }
        const inline = line.match(/^\s*depends_on:\s*\[(.*)\]\s*$/);
        if (inline && current) {
            deps[current] = inline[1].split(',').map((x) => slugify(x.replace(/["']/g, ''))).filter((x) => x && x !== 'unit');
            continue;
        }
        if (/^\s*depends_on:\s*$/.test(line)) {
            inList = true;
            continue;
        }
        const item = line.match(/^\s*-\s*["']?([^"']+?)["']?\s*$/);
        if (inList && item && current)
            deps[current].push(slugify(item[1]));
        else if (!/^\s*$/.test(line) && !/^\s*-/.test(line))
            inList = false;
    }
    return { deps, parsed: true };
};
const banner = (from, note) => `> Imported from AI-DLC \`${from}\` by \`steelfoundry import aidlc\`. ${note} This is a mapping, not a validated steelfoundry artifact: run \`steelfoundry requirements review\` and the gates before approving.\n\n`;
export const planAidlcImport = async (cwd) => {
    const intent = await latestAidlcIntent(cwd);
    if (!intent)
        return { found: null, conversions: [], warnings: [] };
    const conversions = [];
    const warnings = [];
    const read = (rel) => readFile(path.join(cwd, rel), 'utf8').catch(() => null);
    const label = slugify(intent.split('/').pop() ?? 'intent').replace(/^\d+-/, '') || 'intent';
    const units = await readAidlcUnits(cwd, intent);
    const reqRel = `${intent}/inception/requirements-analysis/requirements.md`;
    const requirements = await read(reqRel);
    const depRel = `${intent}/inception/units-generation/unit-of-work-dependency.md`;
    const depText = (await read(depRel)) ?? '';
    const { deps, parsed } = parseUnitDependencies(depText, units);
    if (units.length && !parsed)
        warnings.push(`${depRel}: no readable dependency block; units are imported without order`);
    // Umbrella spec: one task per unit, so `waves` orders units and the referee verifies them.
    if (units.length) {
        const ids = units.map(slugify);
        const lines = ['# Implementation Plan — ' + label, '', banner(`${intent}/inception/units-generation/`, 'One task per AI-DLC unit of work; `_Depends:_` comes from the unit dependency block.').trim(), '', '## Tasks', ''];
        ids.forEach((u, i) => {
            const dependsOn = (deps[u] ?? []).map((d) => ids.indexOf(d) + 1).filter((n) => n > 0);
            lines.push(`- [ ] ${i + 1}. Unit \`${u}\` — _Requirements: imported_${dependsOn.length ? ` — _Depends:_ ${dependsOn.map((n) => `\`${n}\``).join(', ')}_` : ''} — _Boundary:_ \`.sdd/specs/${u}/\`_`);
        });
        conversions.push({ from: `${intent}/inception/units-generation/unit-of-work.md`, to: `.sdd/specs/${label}/tasks.md`, action: 'convert', reason: 'units of work become umbrella tasks; dependencies become _Depends:_', content: `${lines.join('\n')}\n` });
    }
    if (requirements) {
        conversions.push({ from: reqRel, to: `.sdd/specs/${label}/requirements.md`, action: 'convert', reason: 'intent requirements, behind a provenance banner (not EARS-validated)', content: banner(reqRel, 'Requirements of the whole intent.') + requirements });
    }
    else
        warnings.push(`${reqRel} not found: requirements-analysis has not run`);
    const decisions = await read(`${intent}/inception/domain-design/decisions.md`);
    for (const unit of units) {
        const u = slugify(unit);
        if (requirements)
            conversions.push({ from: reqRel, to: `.sdd/specs/${u}/requirements.md`, action: 'convert', reason: `requirements for unit ${u}; not filtered to the unit (the story map is not parsed)`, content: banner(reqRel, `Unit ${u}; filter to the stories of this unit before approving.`) + requirements });
        const fdDir = `${intent}/construction/${u}/functional-design`;
        const fdFiles = (await readdir(path.join(cwd, fdDir)).catch(() => [])).filter((f) => f.endsWith('.md')).sort();
        const parts = [];
        for (const f of fdFiles)
            parts.push(`## ${f}\n\n${(await read(`${fdDir}/${f}`)) ?? ''}`);
        if (decisions)
            parts.push(`## decisions.md (intent ADR log)\n\n${decisions}`);
        if (parts.length)
            conversions.push({ from: fdDir, to: `.sdd/specs/${u}/plan.md`, action: 'convert', reason: 'functional design and ADRs become the plan', content: `# Plan — ${u}\n\n${banner(fdDir, '')}${parts.join('\n\n')}\n` });
        else
            conversions.push({ from: fdDir, to: `.sdd/specs/${u}/plan.md`, action: 'skip', reason: 'no functional design yet for this unit' });
    }
    const contract = `${intent}/inception/contract-design/contract-summary.md`;
    if (existsSync(path.join(cwd, contract)))
        conversions.push({ from: contract, to: `.sdd/specs/${label}/contracts/contract-summary.md`, action: 'copy', reason: 'inter-unit contracts keep their role' });
    for (const [rel, reason] of [
        ['ideation', 'ideation artifacts have no triad role; discovery lives in brief.md'],
        ['operation', 'operation runbooks stay in AI-DLC'],
        ['audit', 'AI-DLC audit shards stay authoritative for AI-DLC; steelfoundry keeps its own log'],
        ['aidlc-state.md', 'state is read live and read-only by `steelfoundry status`'],
        ['verification', 'phase checks are re-run by open-sdd\'s traceability gate'],
    ])
        if (existsSync(path.join(cwd, intent, rel)))
            conversions.push({ from: `${intent}/${rel}`, to: '—', action: 'skip', reason });
    return { found: intent, conversions, warnings };
};
