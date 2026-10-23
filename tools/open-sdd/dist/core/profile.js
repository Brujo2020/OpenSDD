/**
 * Project profile: a deterministic fingerprint of a workspace (REQ-PB-002).
 *
 * Every signal carries the file or rule that produced it, so a wrong guess is visible and
 * correctable. A signal that cannot be decided is reported `unknown` together with the one
 * question that resolves it — never guessed. No network, no model.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.sdd', 'aidlc', '.venv', 'vendor', 'target', '.next', 'coverage']);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|rs|rb|php|cs|swift|scala|c|cc|cpp|h)$/i;
const TEST_FILE = /(\.|_)(test|spec)\.[a-z]+$|^test_.*\.py$|Test\.java$/i;
const IAC_FILES = new Set(['cdk.json', 'template.yaml', 'template.yml', 'Pulumi.yaml', 'serverless.yml', 'serverless.yaml']);
const UI_DEPS = ['react', 'vue', '@angular/core', 'svelte', 'solid-js', 'next', 'nuxt'];
const MAX_FILES = 20_000;
const exists = async (p) => (await stat(p).catch(() => null)) !== null;
const readJson = async (p) => {
    try {
        return JSON.parse(await readFile(p, 'utf8'));
    }
    catch {
        return null;
    }
};
const walk = async (root) => {
    const files = [];
    const queue = [''];
    while (queue.length > 0 && files.length < MAX_FILES) {
        const rel = queue.shift();
        const entries = await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (IGNORED.has(entry.name))
                continue;
            const child = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory())
                queue.push(child);
            else
                files.push(child);
            if (files.length >= MAX_FILES)
                break;
        }
    }
    return { files, truncated: files.length >= MAX_FILES };
};
/** The newest AI-DLC intent record in any space, or null. */
export const latestAidlcIntent = async (cwd) => {
    const spaces = path.join(cwd, 'aidlc', 'spaces');
    const found = [];
    for (const space of (await readdir(spaces).catch(() => [])).sort()) {
        for (const intent of (await readdir(path.join(spaces, space, 'intents')).catch(() => [])).sort()) {
            if (await exists(path.join(spaces, space, 'intents', intent, 'inception')))
                found.push(`aidlc/spaces/${space}/intents/${intent}`);
        }
    }
    return found.sort().pop() ?? null;
};
/** Units of work declared by AI-DLC (`## <unit>` headings in unit-of-work.md). */
export const readAidlcUnits = async (cwd, intent) => {
    const text = await readFile(path.join(cwd, intent, 'inception', 'units-generation', 'unit-of-work.md'), 'utf8').catch(() => '');
    return [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
};
export const detectProfile = async (cwd) => {
    const { files, truncated } = await walk(cwd);
    const sources = files.filter((f) => SOURCE_EXT.test(f));
    const tests = files.filter((f) => TEST_FILE.test(path.basename(f)) || /(^|\/)(tests?|__tests__)\//.test(f));
    const signals = [];
    signals.push({
        id: 'terrain',
        value: sources.length > 0 ? 'brownfield' : 'greenfield',
        source: `${sources.length} source file(s)${truncated ? ' (scan stopped at 20000 files)' : ''}`,
    });
    const nested = [];
    for (const entry of (await readdir(cwd, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && !IGNORED.has(entry.name) && (await exists(path.join(cwd, entry.name, '.git'))))
            nested.push(entry.name);
    }
    const root = await exists(path.join(cwd, '.git'));
    signals.push({
        id: 'repos',
        value: Math.max(1, nested.length + (root && nested.length === 0 ? 1 : 0)),
        source: nested.length ? `sibling repositories: ${nested.join(', ')}` : root ? '.git at the root' : 'no .git found; counted as 1',
    });
    const intent = await latestAidlcIntent(cwd);
    const units = intent ? await readAidlcUnits(cwd, intent) : [];
    const pkg = await readJson(path.join(cwd, 'package.json'));
    const workspaces = Array.isArray(pkg?.workspaces) ? (pkg?.workspaces).length : 0;
    if (units.length > 0)
        signals.push({ id: 'units', value: units.length, source: `${intent}/inception/units-generation/unit-of-work.md` });
    else if (workspaces > 0)
        signals.push({ id: 'units', value: workspaces, source: 'package.json workspaces' });
    else
        signals.push({
            id: 'units',
            value: 'unknown',
            source: 'no unit-of-work.md and no workspaces',
            question: 'How many independently deliverable units (services, packages, apps) does this work touch?',
        });
    signals.push({ id: 'tests', value: tests.length > 0, source: `${tests.length} test file(s)` });
    const iac = files.filter((f) => IAC_FILES.has(path.basename(f)) || f.endsWith('.tf'));
    signals.push({ id: 'iac', value: iac.length > 0, source: iac.length ? iac.slice(0, 3).join(', ') : 'no cdk/terraform/sam/pulumi files' });
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    const ui = UI_DEPS.filter((d) => d in deps);
    signals.push({ id: 'ui', value: ui.length > 0, source: ui.length ? `package.json: ${ui.join(', ')}` : 'no UI framework in package.json' });
    const governance = await readJson(path.join(cwd, '.sdd', 'settings', 'governance.json'));
    const gov = typeof governance?.profile === 'string' ? governance.profile : null;
    signals.push({ id: 'governance', value: gov ?? 'solo', source: gov ? '.sdd/settings/governance.json' : 'default (no governance.json)' });
    signals.push({ id: 'aidlc', value: intent ? 'present' : 'absent', source: intent ?? 'no aidlc/spaces/*/intents/*' });
    const size = files.length < 200 ? 'S' : files.length < 2000 ? 'M' : 'L';
    signals.push({ id: 'size', value: size, source: `${files.length} file(s); S<200, M<2000, L otherwise` });
    const v = profileValues({ signals });
    const repos = Number(v.repos);
    const unitCount = typeof v.units === 'number' ? v.units : 0;
    let type = v.terrain === 'brownfield' ? (v.tests ? 'brownfield-extension' : 'legacy-untested') : 'greenfield';
    let typeReason = v.terrain === 'brownfield' ? (v.tests ? 'source with tests' : 'source without tests') : 'no source yet';
    if (repos >= 2 || unitCount >= 2) {
        type = 'multi-unit';
        typeReason = repos >= 2 ? `${repos} repositories` : `${unitCount} units of work`;
    }
    return { signals, type, typeReason };
};
/** Flat map used by `when` expressions. */
export const profileValues = (profile) => Object.fromEntries(profile.signals.map((s) => [s.id, s.value]));
