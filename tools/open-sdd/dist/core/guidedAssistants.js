/**
 * Guided assistants (REQ-VR-006…008); complements `assistants.ts` (on-demand hints inside commands): BMAD-style discovery by roles, steering drafts, and the "what next"
 * menu. Deterministic: which questions are asked, which files are drafted and what is marked as
 * inferred are decided by rules over the intent, the level, the variant and the workspace. People
 * answer; agents may propose answers only as `ASSUMPTION`, which blocks the brief until confirmed.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lintBrief } from './discoveryBrief.js';
import { classifyLevel, rank } from './levels.js';
import { intentSignals } from './playbookPlanner.js';
import { detectProfile, profileValues } from './profile.js';
import { checkQuestions, parseQuestions } from './questions.js';
import { discoverModules } from './reverse.js';
export const QUESTION_BANK = [
    { key: 'problem', role: 'analyst', section: 'Problem', title: 'What problem does this remove? (add the detail after a colon)', options: ['Manual work is too slow', 'Errors or rework', 'A capability users ask for is missing', 'Compliance or risk exposure'], when: () => true },
    { key: 'users', role: 'analyst', section: 'Users', title: 'Who has the problem?', options: ['End customers', 'Internal operators', 'Developers / other systems', 'Regulators or auditors'], when: (c) => c.level >= 2 },
    { key: 'current', role: 'analyst', section: 'Current State', title: 'How is it handled today?', options: ['Manually', 'An existing system does it poorly', 'Not at all', 'Partially built'], when: (c) => c.level >= 1 },
    { key: 'outcome', role: 'pm', section: 'Desired Outcome', title: 'What observable result says it worked? (include a number or a deadline)', options: ['Time saved (%)', 'Fewer errors (count or %)', 'Adoption (users)', 'Revenue or cost (amount)'], when: () => true },
    { key: 'in', role: 'pm', section: 'Scope In', title: 'What is in scope for the first release?', options: ['One user flow end to end', 'The core capability, no admin', 'Core capability with admin', 'A pilot for one team or region'], when: (c) => c.level >= 2 },
    { key: 'out', role: 'pm', section: 'Scope Out', title: 'What is explicitly out of scope?', options: ['Mobile apps', 'Integrations beyond the first one', 'Migration of historical data', 'Admin / back-office UI'], when: () => true },
    { key: 'approach', role: 'architect', section: 'Approach', title: 'Which approach?', options: ['Extend an existing module', 'A new service or component', 'Buy / SaaS', 'Configuration only'], when: (c) => c.level >= 1 },
    { key: 'constraints', role: 'architect', section: 'Constraints', title: 'Which constraints or integrations bind the design?', options: ['Must reuse the current platform', 'Must integrate with a named system', 'Fixed deadline or budget', 'Data must stay in a region'], when: (c) => c.level >= 3 || c.brown },
    { key: 'nfr', role: 'architect', section: 'Constraints', title: 'Which quality attribute matters most? (give the target)', options: ['Latency (p95 ms)', 'Availability (%)', 'Throughput (per second)', 'Cost per month'], when: (c) => c.level >= 3 },
    { key: 'ux', role: 'ux', section: 'Approach', title: 'Which experience must the first release get right?', options: ['First-time onboarding', 'A frequent daily task', 'Accessibility (WCAG level)', 'Mobile-first layout'], when: (c) => c.ui },
    { key: 'acceptance', role: 'qa', section: 'Acceptance', title: 'What evidence will accept it?', options: ['Automated acceptance tests', 'A demo to named users', 'Production metrics after N days', 'An audit or sign-off'], when: (c) => c.level >= 2 },
    { key: 'security', role: 'security', section: 'Risks', title: 'Which data and controls are involved?', options: ['Personal data (minimise, mask)', 'Payments (PCI scope)', 'Authentication / authorization', 'Regulated records (retention, audit)'], when: (c) => c.risks.length > 0 },
    { key: 'regression', role: 'qa', section: 'Risks', title: 'What existing behaviour must not change?', options: ['Public APIs', 'Reports and exports', 'Batch jobs and schedules', 'Nothing user-visible'], when: (c) => c.brown && c.level >= 2 },
];
export const discoveryFile = (cwd, feature) => path.join(cwd, '.sdd', 'questions', feature, 'discovery.md');
export const planDiscovery = async (cwd, feature, idea, profile) => {
    const prof = profile ?? (await detectProfile(cwd));
    const decision = classifyLevel(idea, prof, cwd);
    const v = profileValues(prof);
    const ctx = { level: rank(decision.level), brown: decision.variant === 'brownfield', ui: v.ui === true || /\b(screen|portal|app|ui|ux|dashboard|page)\b/i.test(idea), risks: intentSignals(idea).risks.map((r) => r.tag) };
    const qs = QUESTION_BANK.filter((q) => q.when(ctx)).map((q, i) => ({ ...q, id: `Q${i + 1}` }));
    const markdown = [
        `# Discovery — ${idea}`,
        '',
        `Level ${decision.level} (${decision.label}) · ${decision.variant} · roles: ${[...new Set(qs.map((q) => q.role))].join(', ')}.`,
        'Fill each question\'s answer line with a letter and the detail after a colon, e.g. `C: customers cannot export invoices (40 tickets/month)`.',
        'An agent may only propose an answer as `ASSUMPTION: …`; it blocks the brief until a person confirms it.',
        '',
        ...qs.flatMap((q) => [`## ${q.id} — [${q.role}] ${q.title}`, ...q.options.map((o, i) => `${'ABCDE'[i]}. ${o}`), 'X. Other (please specify)', '[Answer]:', '']),
    ].join('\n');
    return { decision, questions: qs, roles: [...new Set(qs.map((q) => q.role))], file: discoveryFile(cwd, feature), markdown };
};
export const writeDiscovery = async (plan, force = false) => {
    if (existsSync(plan.file) && !force)
        return false;
    await mkdir(path.dirname(plan.file), { recursive: true });
    await writeFile(plan.file, plan.markdown, 'utf8');
    return true;
};
/** Compose `brief.md` from the answered discovery file and lint it (REQ-VR-006). */
export const composeBrief = async (cwd, feature, opts = {}) => {
    const text = await readFile(discoveryFile(cwd, feature), 'utf8').catch(() => null);
    if (text === null)
        return { ok: false, issues: [`no discovery for ${feature}: open-sdd assist discover "<idea>" --feature ${feature}`] };
    const questions = parseQuestions(text);
    const open = checkQuestions(questions);
    if (open.length)
        return { ok: false, issues: open.map((i) => i.message) };
    const title = text.split('\n')[0].replace(/^# Discovery — /, '');
    const sec = new Map();
    const assumptions = [];
    for (const q of questions) {
        const head = text.split('\n')[q.line - 1];
        const m = head.match(/\[(\w+)\]\s+(.*)$/);
        const bank = QUESTION_BANK.find((b) => m && b.title === m[2]);
        if (!bank)
            continue;
        const lines = text.split('\n').slice(q.line);
        const ans = q.answer;
        const letter = ans.charAt(0).toUpperCase();
        const detail = ans.includes(':') ? ans.slice(ans.indexOf(':') + 1).trim() : '';
        const label = letter === 'X' ? '' : (lines.find((l) => l.startsWith(`${letter}. `)) ?? '').slice(3);
        let content = [label, detail].filter(Boolean).join(': ');
        const asm = /^ASSUMPTION\b/i.test(detail);
        if (asm) {
            assumptions.push(detail.replace(/^ASSUMPTION:?\s*/i, ''));
            content = `${label} [ASSUMPTION A${assumptions.length}]`;
        }
        sec.set(bank.section, [...(sec.get(bank.section) ?? []), content]);
    }
    const bullets = (k) => (sec.get(k) ?? []).map((x) => `- ${x}`);
    const brief = [
        `# Brief: ${title}`,
        '',
        '## Problem',
        ...bullets('Problem'),
        ...(sec.get('Users') ?? []).map((x) => `- Users: ${x}`),
        '',
        '## Current State',
        ...(bullets('Current State').length ? bullets('Current State') : ['- [to be described]']),
        '',
        '## Desired Outcome',
        ...bullets('Desired Outcome'),
        ...(sec.get('Acceptance') ?? []).map((x) => `- Accepted by: ${x}`),
        '',
        '## Approach',
        ...(bullets('Approach').length ? bullets('Approach') : ['- [to be decided in design]']),
        ...(sec.get('Constraints') ?? []).map((x) => `- Constraint: ${x}`),
        '',
        '## Scope',
        `- **In**: ${(sec.get('Scope In') ?? ['the first release described above']).join('; ')}`,
        `- **Out**: ${(sec.get('Scope Out') ?? []).join('; ')}`,
        ...((sec.get('Risks') ?? []).length ? ['', '## Risks', ...bullets('Risks')] : []),
        ...(assumptions.length ? ['', '## Assumptions', '| ID | Assumption | State |', '|---|---|---|', ...assumptions.map((a, i) => `| A${i + 1} | ${a} | to confirm |`)] : []),
        '',
    ].join('\n');
    const lint = lintBrief(brief);
    const file = path.join(cwd, '.sdd', 'specs', feature, 'brief.md');
    if (opts.write) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, brief, 'utf8');
    }
    return { ok: lint.ok, issues: lint.problems, brief, lint, file };
};
// ── Steering drafts ─────────────────────────────────────────────────────────────────────────
const LANG = [[/\.(ts|tsx)$/, 'TypeScript'], [/\.(js|jsx|mjs|cjs)$/, 'JavaScript'], [/\.py$/, 'Python'], [/\.java$/, 'Java'], [/\.kt$/, 'Kotlin'], [/\.go$/, 'Go'], [/\.rs$/, 'Rust'], [/\.cs$/, 'C#'], [/\.rb$/, 'Ruby'], [/\.php$/, 'PHP'], [/\.(cbl|cob)$/i, 'COBOL'], [/\.swift$/, 'Swift']];
const FRAMEWORKS = ['react', 'vue', '@angular/core', 'svelte', 'next', 'nuxt', 'express', 'fastify', '@nestjs/core', 'spring-boot', 'django', 'flask', 'vitest', 'jest', 'mocha', 'playwright', 'typescript'];
const langCount = async (dir, acc, depth = 5) => {
    if (depth < 0)
        return;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (['node_modules', '.git', 'dist', 'build', '.sdd', 'vendor', 'target', 'coverage'].includes(e.name))
            continue;
        if (e.isDirectory())
            await langCount(path.join(dir, e.name), acc, depth - 1);
        else
            for (const [re, l] of LANG)
                if (re.test(e.name))
                    acc.set(l, (acc.get(l) ?? 0) + 1);
    }
};
/** Drafts that say what the workspace shows, marked `(inferred)`, and ask for what it cannot show. */
export const draftSteering = async (cwd) => {
    const pkg = JSON.parse((await readFile(path.join(cwd, 'package.json'), 'utf8').catch(() => '{}')));
    const readme = (await readFile(path.join(cwd, 'README.md'), 'utf8').catch(() => '')).split(/\r?\n\r?\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('![') && !p.startsWith('<'));
    const langs = new Map();
    await langCount(cwd, langs);
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const fw = FRAMEWORKS.filter((f) => f in deps);
    const modules = await discoverModules(cwd);
    const testDirs = ['test', 'tests', '__tests__', 'spec'].filter((d) => existsSync(path.join(cwd, d)));
    const fm = '---\ninclusion: always\n---\n';
    const product = [
        fm,
        '# Product',
        '',
        `- Name: ${String(pkg.name ?? path.basename(cwd))} (inferred)`,
        readme ? `- Purpose: ${readme.replace(/\s+/g, ' ').slice(0, 240)} (inferred)` : '- Purpose: [NEEDS CLARIFICATION] what does it do, in one sentence?',
        '- Users: [NEEDS CLARIFICATION] who uses it and for what job?',
        '- Outcomes: [NEEDS CLARIFICATION] which measurable results matter (adoption, time, errors, revenue)?',
        '- Non-goals: [NEEDS CLARIFICATION] what this product deliberately does not do?',
        '',
    ].join('\n');
    const tech = [
        fm,
        '# Technology',
        '',
        ...([...langs.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `- Language: ${l} (${n} files) (inferred)`)),
        ...(fw.length ? fw.map((f) => `- Uses ${f} ${deps[f]} (inferred)`) : ['- Frameworks: [NEEDS CLARIFICATION] none detected in package.json']),
        ...(existsSync(path.join(cwd, 'package-lock.json')) ? ['- Package manager: npm (inferred)'] : existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? ['- Package manager: pnpm (inferred)'] : []),
        '- Deployment target: [NEEDS CLARIFICATION] where does it run?',
        '- Standards: [NEEDS CLARIFICATION] coding standards, review rules, supported runtimes',
        '',
    ].join('\n');
    const structure = [
        fm,
        '# Structure',
        '',
        ...(modules.length ? modules.map((m) => `- \`${m.path}/\` — module ${m.id} (${m.files} source files) (inferred)`) : ['- Modules: [NEEDS CLARIFICATION] no source directories yet — describe the intended layout']),
        ...(testDirs.length ? testDirs.map((d) => `- \`${d}/\` — tests (inferred)`) : ['- Tests: [NEEDS CLARIFICATION] where do tests live?']),
        '- Naming and boundaries: [NEEDS CLARIFICATION] which module may depend on which?',
        '',
    ].join('\n');
    const count = (s) => ({ inferred: (s.match(/\(inferred\)/g) ?? []).length, questions: (s.match(/\[NEEDS CLARIFICATION\]/g) ?? []).length });
    return { files: [{ name: 'product.md', content: product, ...count(product) }, { name: 'tech.md', content: tech, ...count(tech) }, { name: 'structure.md', content: structure, ...count(structure) }] };
};
/** Deterministic "what helps next" from the repository state (REQ-VR-008). */
export const suggestAssistants = async (cwd) => {
    const out = [];
    const prof = await detectProfile(cwd);
    const v = profileValues(prof);
    const steer = path.join(cwd, '.sdd', 'steering');
    if (!existsSync(path.join(steer, 'product.md')))
        out.push({ assistant: 'steering', why: 'no steering yet: hosts load nothing about the project', command: 'open-sdd assist steering --write' });
    if (!existsSync(path.join(steer, 'constitution.md')))
        out.push({ assistant: 'constitution', why: 'no constitution: blocking verdicts have no authority to cite', command: v.terrain === 'brownfield' ? 'open-sdd assist constitution --draft' : 'open-sdd assist constitution --interview' });
    if (v.terrain === 'brownfield' && !existsSync(path.join(cwd, '.sdd', 'reverse', 'inventory.json')))
        out.push({ assistant: 'reverse', why: 'existing code without a recovered inventory', command: 'open-sdd reverse init' });
    const specs = (await readdir(path.join(cwd, '.sdd', 'specs'), { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const f of specs) {
        const dir = path.join(cwd, '.sdd', 'specs', f);
        if (!existsSync(path.join(dir, 'brief.md')) && !existsSync(path.join(dir, 'requirements.md')))
            out.push({ assistant: 'discover', why: `${f} has neither brief nor requirements`, command: `open-sdd assist discover "<idea>" --feature ${f}` });
        else if (existsSync(path.join(dir, 'requirements.md')))
            out.push({ assistant: 'ears', why: `review ${f}/requirements.md against EARS`, command: `open-sdd assist ears review ${f}` });
    }
    if (!specs.length)
        out.push({ assistant: 'start', why: 'no work started', command: 'open-sdd start "<intent>" --dry-run' });
    return out;
};
