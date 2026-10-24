/**
 * Reverse engineering mode (REQ-VR-002…004): recover an existing system in stages, module slice by
 * module slice, each stage closed only by a measurable criterion over files in `.sdd/reverse/`.
 *
 *   RE-1 inventory        inventory.json lists ≥ 1 module
 *   RE-2 architecture     architecture.md names every module
 *   RE-3 characterization characterization.json maps modules to existing test files: share ≥ minCharacterized, all critical covered
 *   RE-4 rules            rules.md has a RULE or a NONE line for every module
 *   RE-5 confirmation     confirmed share ≥ minConfirmed and no inferred rule on a critical module
 *   RE-6 spec baseline    every confirmed RULE id is cited in .sdd/specs/<feature>/requirements.md
 *
 * Agents write the drafts (architecture, characterization tests, inferred rules); people confirm rules.
 * The engine refuses to complete a reverse step whose stage is not done.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const DEFAULT_REVERSE_POLICY = { minCharacterized: 0.6, minConfirmed: 0.8 };
export const reverseDir = (cwd, ...p) => path.join(cwd, '.sdd', 'reverse', ...p);
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.sdd', 'vendor', 'target', 'coverage', '.venv', '.next', 'test', 'tests', '__tests__', 'docs']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|rs|rb|php|cs|swift|scala|c|cc|cpp|h|cbl|cob|sql)$/i;
const countSources = async (dir, depth = 6) => {
    if (depth < 0)
        return 0;
    let n = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (IGNORED.has(e.name))
            continue;
        if (e.isDirectory())
            n += await countSources(path.join(dir, e.name), depth - 1);
        else if (SOURCE.test(e.name))
            n += 1;
    }
    return n;
};
/** Modules = first-level directories holding source code, under src/, lib/, app/, packages/ or the root. */
export const discoverModules = async (cwd) => {
    const roots = ['src', 'lib', 'app', 'packages', 'services'].filter((r) => existsSync(path.join(cwd, r)));
    const out = [];
    for (const root of roots.length ? roots : ['.']) {
        for (const e of (await readdir(path.join(cwd, root), { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!e.isDirectory() || IGNORED.has(e.name) || e.name.startsWith('.'))
                continue;
            const files = await countSources(path.join(cwd, root, e.name));
            if (files > 0)
                out.push({ id: e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), path: path.posix.join(root === '.' ? '' : root, e.name), files });
        }
    }
    return out;
};
export const readInventory = async (cwd) => JSON.parse((await readFile(reverseDir(cwd, 'inventory.json'), 'utf8').catch(() => 'null')));
/** Create or extend the inventory; `scope` limits to those module ids; existing modules (and flags) are kept. */
export const initInventory = async (cwd, opts = {}) => {
    const found = await discoverModules(cwd);
    const current = (await readInventory(cwd)) ?? { schema: 'open-sdd.reverse-inventory/1', modules: [] };
    const wanted = opts.scope?.length ? found.filter((m) => opts.scope.includes(m.id)) : found;
    const unknown = (opts.scope ?? []).filter((id) => !found.some((m) => m.id === id));
    const added = [];
    for (const m of wanted)
        if (!current.modules.some((x) => x.id === m.id)) {
            current.modules.push(m);
            added.push(m.id);
        }
    for (const m of current.modules)
        if (opts.critical?.includes(m.id))
            m.critical = true;
    current.modules.sort((a, b) => a.id.localeCompare(b.id));
    await mkdir(reverseDir(cwd), { recursive: true });
    await writeFile(reverseDir(cwd, 'inventory.json'), `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    return { inventory: current, added, unknown };
};
const RULE_RE = /^- (RULE-[A-Z0-9-]+|NONE) \[([a-z0-9-]+)\] (.+?) — (inferred|confirmed by (.+?)(?: \(\d{4}-\d{2}-\d{2}\))?)\s*$/;
/** `- RULE-PAY-001 [payments] text — inferred` · `— confirmed by Ana (2026-10-23)` · `- NONE [module] no business rules — confirmed by Ana`. */
export const parseRules = (md) => {
    const rules = [];
    const malformed = [];
    md.split(/\r?\n/).forEach((l, i) => {
        if (!/^- (RULE-|NONE)/.test(l))
            return;
        const m = l.match(RULE_RE);
        if (!m)
            return void malformed.push(i + 1);
        rules.push({ id: m[1], module: m[2], text: m[3], status: m[1] === 'NONE' ? 'none' : m[4] === 'inferred' ? 'inferred' : 'confirmed', by: m[5], line: i + 1 });
    });
    return { rules, malformed };
};
const read = async (p) => readFile(p, 'utf8').catch(() => null);
export const readReversePolicy = async (cwd) => ({
    ...DEFAULT_REVERSE_POLICY,
    ...JSON.parse((await read(path.join(cwd, '.sdd', 'settings', 'reverse.json'))) ?? '{}'),
});
export const reverseStages = async (cwd, feature) => {
    const policy = await readReversePolicy(cwd);
    const inv = await readInventory(cwd);
    const modules = inv?.modules ?? [];
    const ids = modules.map((m) => m.id);
    const critical = modules.filter((m) => m.critical).map((m) => m.id);
    const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
    const stages = [];
    stages.push({ id: 'RE-1', name: 'inventory', done: modules.length > 0, metric: `${modules.length} module(s)`, unmet: modules.length ? [] : ['no modules: steelforge reverse init'], next: 'steelforge reverse init [--scope a,b] [--critical a]' });
    const arch = (await read(reverseDir(cwd, 'architecture.md'))) ?? '';
    const missingArch = ids.filter((id) => !new RegExp(`\\b${id.replace(/-/g, '[-_ ]?')}\\b`, 'i').test(arch));
    stages.push({ id: 'RE-2', name: 'architecture', done: Boolean(arch) && modules.length > 0 && missingArch.length === 0, metric: `${ids.length - missingArch.length}/${ids.length} modules described`, unmet: arch ? missingArch.map((m) => `architecture.md does not name ${m}`) : ['write .sdd/reverse/architecture.md (modules, responsibilities, dependencies, data flows)'], next: 'describe every module in .sdd/reverse/architecture.md' });
    const map = JSON.parse((await read(reverseDir(cwd, 'characterization.json'))) ?? '{}');
    const covered = ids.filter((id) => (map[id] ?? []).some((f) => existsSync(path.join(cwd, f))));
    const critMissing = critical.filter((id) => !covered.includes(id));
    const share = ids.length ? covered.length / ids.length : 0;
    const charUnmet = [
        ...(share < policy.minCharacterized ? [`characterized ${pct(covered.length, ids.length)} % < ${Math.round(policy.minCharacterized * 100)} %: ${ids.filter((i) => !covered.includes(i)).join(', ')}`] : []),
        ...critMissing.map((m) => `critical module ${m} has no characterization test`),
    ];
    stages.push({ id: 'RE-3', name: 'characterization', done: ids.length > 0 && charUnmet.length === 0, metric: `${covered.length}/${ids.length} modules (${pct(covered.length, ids.length)} %)`, unmet: charUnmet, next: 'write characterization tests and map them in .sdd/reverse/characterization.json {"module": ["path/to/test"]}' });
    const rmd = (await read(reverseDir(cwd, 'rules.md'))) ?? '';
    const { rules, malformed } = parseRules(rmd);
    const withRules = ids.filter((id) => rules.some((r) => r.module === id));
    const unknownMods = [...new Set(rules.map((r) => r.module).filter((m) => !ids.includes(m)))];
    const rulesUnmet = [
        ...ids.filter((id) => !withRules.includes(id)).map((m) => `no RULE or NONE line for ${m}`),
        ...malformed.map((l) => `rules.md line ${l} is malformed`),
        ...unknownMods.map((m) => `rules.md names unknown module ${m}`),
    ];
    stages.push({ id: 'RE-4', name: 'rules', done: ids.length > 0 && rulesUnmet.length === 0, metric: `${rules.filter((r) => r.status !== 'none').length} rule(s), ${withRules.length}/${ids.length} modules`, unmet: rulesUnmet, next: 'extract business rules into .sdd/reverse/rules.md as "- RULE-<AREA>-NNN [module] text — inferred"' });
    const real = rules.filter((r) => r.status !== 'none');
    const confirmed = real.filter((r) => r.status === 'confirmed');
    const critInferred = real.filter((r) => r.status === 'inferred' && critical.includes(r.module));
    const cshare = real.length ? confirmed.length / real.length : 1;
    const confUnmet = [
        ...(rules.length === 0 ? ['no rules to confirm yet (RE-4)'] : []),
        ...(cshare < policy.minConfirmed ? [`confirmed ${pct(confirmed.length, real.length)} % < ${Math.round(policy.minConfirmed * 100)} %`] : []),
        ...critInferred.map((r) => `${r.id} on critical module ${r.module} is still inferred`),
    ];
    stages.push({ id: 'RE-5', name: 'confirmation', done: rules.length > 0 && confUnmet.length === 0, metric: `${confirmed.length}/${real.length} confirmed`, unmet: confUnmet, next: 'a person confirms: steelforge reverse confirm <RULE-ID> --by "<name>"' });
    const req = feature ? ((await read(path.join(cwd, '.sdd', 'specs', feature, 'requirements.md'))) ?? '') : '';
    const untraced = confirmed.filter((r) => !req.includes(r.id)).map((r) => r.id);
    stages.push({ id: 'RE-6', name: 'spec baseline', done: Boolean(feature) && Boolean(req) && confirmed.length > 0 && untraced.length === 0, metric: `${confirmed.length - untraced.length}/${confirmed.length} confirmed rules traced${feature ? '' : ' (no feature)'}`, unmet: !feature ? ['pass the feature whose requirements.md is the baseline'] : !req ? [`write .sdd/specs/${feature}/requirements.md`] : untraced.map((id) => `${id} is not cited in requirements.md`), next: `cite each confirmed RULE id in the EARS requirement that captures it (steelforge ears convert helps)` });
    // A stage is not done while an earlier one is not (REQ-VR-003).
    for (let i = 1; i < stages.length; i += 1)
        if (!stages[i - 1].done && stages[i].done) {
            stages[i].done = false;
            stages[i].unmet.unshift(`${stages[i - 1].id} ${stages[i - 1].name} is not done`);
        }
    return { stages, current: stages.find((s) => !s.done) ?? null, modules };
};
export const STAGE_OF_STEP = {
    'opensdd:reverse/inventory': 'RE-1',
    'opensdd:reverse/architecture': 'RE-2',
    'opensdd:reverse/characterize': 'RE-3',
    'opensdd:reverse/rules': 'RE-4',
    'opensdd:reverse/confirm': 'RE-5',
    'opensdd:reverse/spec-baseline': 'RE-6',
};
/** Rewrite one rule line as confirmed by a person (REQ-VR-004). */
export const confirmRule = async (cwd, id, by, now = new Date()) => {
    const file = reverseDir(cwd, 'rules.md');
    const md = await read(file);
    if (md === null)
        return { ok: false, message: 'no .sdd/reverse/rules.md' };
    const { rules } = parseRules(md);
    const r = rules.find((x) => x.id === id);
    if (!r)
        return { ok: false, message: `no rule ${id}` };
    if (r.status === 'confirmed')
        return { ok: false, message: `${id} is already confirmed by ${r.by}` };
    const lines = md.split(/\r?\n/);
    lines[r.line - 1] = lines[r.line - 1].replace(/— inferred\s*$/, `— confirmed by ${by} (${now.toISOString().slice(0, 10)})`);
    await writeFile(file, lines.join('\n'), 'utf8');
    return { ok: true, message: `${id} confirmed by ${by}` };
};
