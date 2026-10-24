/**
 * One playbook, native in every host (REQ-PB-018, REQ-PB-011).
 *
 * The emitted artefacts are thin: a host never receives logic, only the loop over the engine's
 * two calls (`steelforge next --json` → do the step → `steelforge report …`) and the step list. That is
 * what makes the playbook portable: adding a host is adding a template.
 *
 * Harness²'s ablation is the budget rule: on-demand skills and scripts carried most of the gain
 * (removing skills cost 5.3 points on average, scripts 3.7, the always-on prompt group 1.5), so the
 * always-on text stays within `budget.always_on_chars` and procedure lives in the on-demand skill.
 *
 * For AI-DLC, `when` was already evaluated by the checker, so the scope is emitted only as plain
 * membership (`adds.scopes` contributions), the one routing mechanism AI-DLC actually honours.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { agentDefinitions } from '../agents/registry.js';
export const skillsHosts = () => Object.entries(agentDefinitions)
    .filter(([id, def]) => id.endsWith('-skills') && !def.hidden)
    .map(([id, def]) => ({ id, dir: def.layout.commandsDir }))
    .sort((a, b) => a.id.localeCompare(b.id));
export const BUILD_TARGETS = () => [...skillsHosts().map((h) => h.id), 'prompt', 'mcp', 'aidlc'];
const slug = (name) => name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
const loop = (name) => [
    'Loop until the engine says `done` or `parked`:',
    '',
    '1. Run `steelforge next <feature> --json` and act on the ONE directive it prints:',
    '   - `handoff` → run the command it gives; `ask` → ask the open questions in the file it names, write the answers there, then `steelforge questions confirm`;',
    '   - `run-step` → read the pack, restate the goal and acceptance ids with `steelforge handoff recall`, do the step, then `steelforge report <feature> --step <id> --result completed|awaiting-approval`;',
    '   - `present-gate` → prepare the decision card if none exists and STOP: a named person answers with `steelforge hil answer`.',
    '2. Never write `approved` yourself; never override a gate in autonomous mode.',
    '',
    `Playbook: \`${name}\`. Every verdict comes from the engine, not from this text.`,
];
const stepTable = (r) => [
    '| Phase | Step | Type | Checks | Review |',
    '|---|---|---|---|---|',
    ...r.steps.filter((s) => s.decision === 'EXECUTE').map((s) => `| ${s.phase} | ${s.id} | \`${s.use}\` | ${s.checks.join(', ') || '—'} | ${s.review} |`),
];
export const buildFor = (target, r) => {
    const name = slug(r.name);
    const errors = [];
    const files = [];
    const host = skillsHosts().find((h) => h.id === target);
    if (host) {
        const always = `---\nname: sdd-playbook-${name}\ndescription: Run the "${r.name}" playbook through the steelforge engine (next/report). Use when working on a feature planned with this playbook.\n---\n`;
        const body = [`# Playbook ${r.name}`, '', ...loop(r.name), '', '## Steps', '', ...stepTable(r), ''].join('\n');
        if (always.length > r.budget.always_on_chars)
            errors.push(`always-on text ${always.length} > budget ${r.budget.always_on_chars}`);
        files.push({ path: `${host.dir}/sdd-playbook-${name}/SKILL.md`, content: `${always}\n${body}` });
    }
    else if (target === 'prompt') {
        files.push({ path: `.sdd/build/prompt/${name}.md`, content: [`# ${r.name}`, '', ...loop(r.name), '', ...stepTable(r), ''].join('\n') });
    }
    else if (target === 'mcp') {
        files.push({
            path: `.sdd/build/mcp/${name}.tools.json`,
            content: `${JSON.stringify({
                playbook: r.name,
                tools: [
                    { name: 'open_sdd_next', description: `Next directive for a feature planned with ${r.name}`, command: 'steelforge next <feature> --json' },
                    { name: 'open_sdd_report', description: 'Report a step result (never approved)', command: 'steelforge report <feature> --step <id> --result <result>' },
                ],
                steps: r.steps.filter((s) => s.decision === 'EXECUTE').map((s) => ({ id: s.id, use: s.use, checks: s.checks, review: s.review })),
            }, null, 2)}\n`,
        });
    }
    else if (target === 'aidlc') {
        const scope = `opensdd-${name}`;
        const aidlcSteps = r.steps.filter((s) => s.decision === 'EXECUTE' && s.use.startsWith('aidlc:stage/'));
        files.push({
            path: `.sdd/build/aidlc/opensdd/scopes/${scope}.md`,
            content: `---\nname: ${scope}\nplugin: opensdd\ndepth: standard\nkeywords: []\ndescription: Compiled from the steelforge playbook "${r.name}". Stage membership is plain; steelforge evaluated every condition.\n---\n\n# ${scope}\n\n${aidlcSteps.length} AI-DLC stage(s) run under this scope; steelforge sensors gate them.\n`,
        });
        for (const s of aidlcSteps) {
            const slugName = s.use.split('/')[1];
            const phase = s.type?.phase ?? 'inception';
            const sensors = s.checks.map((c) => (c === 'opensdd:gates-c1-c3' ? 'opensdd-gates' : c.startsWith('opensdd:gate/') ? 'opensdd-gates' : `opensdd-${c.split(':')[1]}`));
            files.push({
                path: `.sdd/build/aidlc/opensdd/contributions/${phase}/${slugName}.md`,
                content: `---\ntarget: ${slugName}\nplugin: opensdd\nadds:\n  scopes:\n    - ${scope}\n${sensors.length ? `  sensors:\n${[...new Set(sensors)].map((x) => `    - ${x}`).join('\n')}\n` : ''}---\n`,
            });
        }
    }
    else
        errors.push(`unknown target «${target}»; known: ${BUILD_TARGETS().join(', ')}`);
    return { files, errors };
};
export const writeBuilt = async (cwd, files) => {
    for (const f of files) {
        await mkdir(path.dirname(path.join(cwd, f.path)), { recursive: true });
        await writeFile(path.join(cwd, f.path), f.content, 'utf8');
    }
    return files.map((f) => f.path);
};
