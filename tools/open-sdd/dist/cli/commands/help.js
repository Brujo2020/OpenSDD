/**
 * Ayuda — UNA tabla para `--help`, `help <command>` y `help <tema>`.
 *
 * ── El defecto que esto corrige ────────────────────────────────────────────────────────────────
 * `steelforge help` listaba 8 comandos contra los 58 de `--help`, e `help gates` ignoraba su
 * argumento. La causa era que el índice estaba escrito a mano y la ayuda por comando vivía en `if`s
 * separados. Aquí hay una sola tabla (`COMMANDS`): `renderFullHelp` la proyecta como índice y
 * `renderCommandHelp` extrae la ayuda del comando pedido. Añadir un comando sin su entrada aquí no
 * lo oculta: el despacho (`src/index.ts`) usa `KNOWN_COMMANDS` para decidir qué es un comando
 * conocido, y una prueba exige ayuda para todos los enrutados.
 *
 * ── El contrato de salida (tenet 11) ───────────────────────────────────────────────────────────
 * `EXIT` es la única definición de los códigos de salida; `help exit-codes` los documenta, incluido
 * el centinela del bucle del anfitrión (`exit 2 = bloqueado`), que NO es el `2` de uso del CLI.
 *
 * Los textos visibles son español, como el resto del CLI; los identificadores (`C1`, `gates chain`)
 * y los nombres de bandera permanecen en inglés.
 */
import { INSTALL_COMMAND } from '../packageIdentity.js';
import { SUPPORTED_LOCALES } from '../i18n.js';
import { listedAgentList as agentList, getAgentDefinition } from '../../agents/registry.js';
import { EXECUTABLE_CHAIN, getExecutableGate } from '../../core/gateCatalog.js';
import { RIGOR_LEVELS, RIGOR_ASPECTS } from '../../core/rigor.js';
import { HOST_INTEGRATIONS } from '../../core/integrations.js';
import { colors, formatHeading } from '../ui/colors.js';
// ---------------------------------------------------------------------------------------------
// Contrato de códigos de salida (tenet 11)
// ---------------------------------------------------------------------------------------------
export const EXIT = {
    /** El comando hizo lo que prometía. */
    PASSED: 0,
    /** TU repositorio falló una comprobación: un hallazgo, no un error de uso. */
    GATE_FAILED: 1,
    /** La línea de comandos estaba mal (bandera, comando o subcomando): nada se inspeccionó. */
    USAGE: 2,
    /** El entorno o la configuración faltan o son incorrectos. */
    ENVIRONMENT: 3,
    /** Un defecto de open-sdd: el fallo es nuestro, no tuyo. */
    TOOL_BUG: 4,
};
export const EXIT_CODES = [
    { code: EXIT.PASSED, name: 'passed', meaning: 'the command did what it promised' },
    { code: EXIT.GATE_FAILED, name: 'gate failed', meaning: 'your repository failed a check: a finding, not a usage mistake' },
    { code: EXIT.USAGE, name: 'usage error', meaning: 'a bad flag, command or subcommand: nothing was inspected' },
    { code: EXIT.ENVIRONMENT, name: 'environment or configuration', meaning: 'the environment or the configuration is missing or wrong' },
    { code: EXIT.TOOL_BUG, name: 'tool bug', meaning: 'steelforge itself failed: this is our defect, not yours' },
];
export const EXIT_CODES_BODY = `${EXIT_CODES.map((entry) => `  ${entry.code}  ${entry.name.padEnd(30)} ${entry.meaning}`).join('\n')}

  = note: a usage error (2) is never reported as a governance failure (1)
  = note: host-loop sentinel — inside a Stop hook, \`exit 2\` means "do not stop" (blocked), not
          "usage error". The installed hook adapter translates ANY non-zero steelforge exit into the
          host's 2, so a failure can never be read as a pass (fail-closed).
  = help: \`steelforge help formatting\` · \`steelforge explain C1\` · docs/PAPER-ALIGNMENT.md`;
export const EXIT_CODES_USAGE = `EXIT CODES — the contract\n\n${EXIT_CODES_BODY}`;
// ---------------------------------------------------------------------------------------------
// Sugerencias («did you mean») — distancia de edición con umbral y tope
// ---------------------------------------------------------------------------------------------
export const levenshtein = (a, b) => {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const previous = Array.from({ length: cols }, (_, j) => j);
    for (let i = 1; i < rows; i += 1) {
        const current = [i, ...new Array(cols - 1).fill(0)];
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
        }
        previous.splice(0, cols, ...current);
    }
    return previous[cols - 1];
};
/**
 * Las sugerencias más cercanas: distancia ≤ `maxDistance`, ordenadas por distancia y luego
 * alfabéticamente, sin duplicados y con tope de `limit` (el contrato pide ≤ 3).
 */
export const suggestCommands = (input, candidates, maxDistance = 2, limit = 3) => {
    const needle = input.trim().toLowerCase();
    if (needle.length === 0)
        return [];
    const scored = new Map();
    for (const candidate of candidates) {
        if (candidate === input || candidate.toLowerCase() === needle)
            continue;
        const distance = levenshtein(needle, candidate.toLowerCase());
        if (distance <= maxDistance)
            scored.set(candidate, distance);
    }
    return [...scored.entries()]
        .sort(([a, da], [b, db]) => da - db || a.localeCompare(b))
        .slice(0, limit)
        .map(([candidate]) => candidate);
};
const SUB = (name, summary) => (summary ? { name, summary } : { name });
export const COMMANDS = [
    {
        name: 'setup',
        group: 'essential',
        summary: 'Install steelforge into this repository (same as `init`): detects the agent and the terrain; plan first, --write applies',
        usage: 'steelforge setup [target] [--agent <id>] [--write] [--json]',
        indexLines: ['  setup [--write]                              Install into this repo (same as init); plan first, --write applies'],
        examples: ['steelforge setup', 'steelforge setup --write'],
    },
    {
        name: 'check',
        group: 'essential',
        summary: 'One verdict: run the whole gate chain (same as `gates run`); exit 1 when it fails',
        usage: 'steelforge check [--profile <solo|team|regulated>] [--staged|--base <ref>] [--strict]',
        indexLines: ['  check                                        One verdict: the whole gate chain (same as gates run)'],
        examples: ['steelforge check', 'steelforge check --staged', 'steelforge check --base main'],
    },
    {
        name: 'decide',
        group: 'essential',
        summary: 'Human decisions waiting for you (cards and human gates), each with the exact command to resolve it',
        usage: 'steelforge decide [feature] [card option --by "<name>"] [--json]',
        indexLines: ['  decide [feature] [card option --by <name>]   Human decisions waiting, with the exact command; answers a card'],
        examples: ['steelforge decide', 'steelforge decide payments', 'steelforge decide payments HIL-001 a --by "Ana"'],
    },
    {
        name: 'templates',
        group: 'templates',
        summary: 'The 22 command templates: what each one writes and where each host reads it',
        usage: 'steelforge templates [--json] [--host <id>]',
        indexLines: [
            '  templates [--json] [--host <id>]            List the 22 templates, what each one writes, and where each host reads them',
            `  ${INSTALL_COMMAND} init . --write          Install them as the host's own chat commands (plan only without --write)`,
            '    MCP is opt-in (--mcp); the default path needs neither MCP nor the network.',
        ],
        details: ['Read-only: it lists the templates and their installation state. Nothing is written without a separate write command.'],
        examples: ['steelforge templates', 'steelforge templates --host claude-code', 'steelforge templates --json'],
    },
    {
        name: 'gates',
        group: 'console',
        summary: 'Resolve and run the Zero-Trust gate chain',
        usage: 'steelforge gates <chain|crosswalk|list|enforcement|run> [--profile <solo|team|regulated>] [--staged|--base <ref>] [--strict]',
        indexLines: ['  gates [chain|crosswalk|list|enforcement|run]  Resolve and run the gate chain'],
        subcommands: [
            SUB('chain', 'resolve the effective chain for the profile, rigor and repository signals'),
            SUB('crosswalk', 'G1–G21 → C1–C7/O1–O7 plus the residue'),
            SUB('list', 'the executable chain with posture and whether each check inspects anything'),
            SUB('enforcement', 'levels A–D: the ceiling versus the floor'),
            SUB('run', 'run the chain (exit 1 when it fails)'),
        ],
        strictSubcommands: true,
        details: ['`gates run` resolves its own ids, profile and scope, so the score footer declares the gate component unmeasured rather than guessing.'],
        examples: ['steelforge gates chain --profile regulated', 'steelforge gates run --strict', 'steelforge gates run --staged'],
    },
    {
        name: 'govern',
        group: 'console',
        summary: 'Invariants, conformance, rigor, the constitution draft and the appeals channel',
        usage: 'steelforge govern <invariants|conformance|hitl|rigor|constitution|appeal|meta-eval|budget|discipline>',
        indexLines: [
            '  govern [invariants|conformance|hitl|rigor|constitution|appeal|meta-eval|budget|discipline]  Invariants, conformance, rigor and the constitution draft/ratify',
        ],
        subcommands: [
            SUB('invariants', 'I1–I6 with their evidence'),
            SUB('conformance', 'C0–C3 with per-invariant evidence'),
            SUB('hitl', 'quantified human-in-the-loop thresholds'),
            SUB('rigor', 'assess the repository against the declared rigor level'),
            SUB('constitution', 'matrix, draft, evidence pack and ratification'),
            SUB('appeal', 'the appeal channel for a blocking verdict'),
            SUB('meta-eval', 'evaluate the evaluator'),
            SUB('budget', 'the declared budgets'),
            SUB('discipline', '§9.7 decidable properties over the diff'),
        ],
        strictSubcommands: true,
        examples: ['steelforge govern conformance', 'steelforge govern rigor', 'steelforge govern constitution --matrix'],
    },
    {
        name: 'assure',
        group: 'console',
        summary: 'Threats, the claims registry, skills and memory',
        usage: 'steelforge assure <threats|lab|claims|calibrate|skills|memory>',
        indexLines: ['  assure [threats|lab|claims|calibrate|skills|memory]  OWASP/ATLAS threats, claims registry, detector calibration (κ), skills and memory'],
        subcommands: [
            SUB('threats', 'OWASP/ATLAS plus the regulatory crosswalk'),
            SUB('lab', 'the adversarial lab'),
            SUB('claims', 'the claims registry (`--verify` exits 1 only on a broken claim)'),
            SUB('calibrate', 'Cohen κ of each detector against a labelled corpus of seeded defects'),
            SUB('skills', 'the shipped skill set'),
            SUB('memory', 'the session memory ledger'),
        ],
        strictSubcommands: true,
        examples: ['steelforge assure threats', 'steelforge assure claims --verify'],
    },
    {
        name: 'start',
        group: 'essential',
        summary: 'One command for any size of work: level L0 tiny … L6 migration → playbook → run → first directive',
        usage: 'steelforge start "<intent>" [--feature f] [--level L0…L6] [--variant greenfield|brownfield] [--rigor tiny-spec|spec-first|spec-anchored|spec-as-code] [--dry-run] [--json]',
        indexLines: ['  start "<intent>"                             Level (tiny→migration), playbook, run and first step in one command'],
        details: ['L0–L1 run with minimal ceremony (no context pack, no recall); L5–L6 with strict ceremony (approvers required). Risk words only ever raise the level.'],
        examples: ['steelforge start "fix typo in README"', 'steelforge start "prototype voice search" --dry-run', 'steelforge start "add refunds to payments"'],
    },
    {
        name: 'where',
        group: 'console',
        summary: 'Where are we: phase, progress bar (% by step cost), pending steps, open cards and events; save a checkpoint to resume',
        usage: 'steelforge where [feature] [--line] [--save [--note "…"]] [--json]',
        indexLines: ['  where [feature] [--line] [--save]            Phase, % done, pending, waiting decisions; checkpoint to resume'],
        details: ['--line prints one line for a shell prompt or a status bar; --save writes .sdd/state/checkpoint.md and .json.'],
        examples: ['steelforge where', 'steelforge where bank-mod --save --note "before CAB"', 'steelforge where --line'],
    },
    {
        name: 'assist',
        group: 'console',
        summary: 'Assistants: which one helps now, BMAD-style discovery by roles, brief, EARS conversion, steering drafts, constitution',
        usage: 'steelforge assist [discover "<idea>" [--feature f] | brief <feature> [--write] | ears "<text>" [--feature f --write] | ears review <feature> | steering [--write] | constitution [--draft|--interview]]',
        indexLines: ['  assist [discover|brief|ears|steering|constitution]  Guided assistants; without arguments, which one helps now'],
        subcommands: [SUB('discover', 'role-based questions (analyst, PM, architect, UX, QA, security) chosen by level, variant and risk'), SUB('brief', 'compose and lint brief.md from the answered discovery'), SUB('ears', 'convert free text to EARS, or review a requirements.md'), SUB('steering', 'draft steering files marked (inferred)'), SUB('constitution', 'constitution draft from the code, or the interview')],
        strictSubcommands: true,
        examples: ['steelforge assist', 'steelforge assist discover "invoice export for customers"', 'steelforge assist ears "when a payment fails the system must notify the customer"', 'steelforge assist steering --write'],
    },
    {
        name: 'reverse',
        group: 'brownfield',
        summary: 'Reverse engineering mode: inventory → architecture → characterization → rules → confirmation → spec baseline, gated by exit criteria',
        usage: 'steelforge reverse <init [--scope a,b] [--critical a]|status [--feature f] [--mermaid]|next [--feature f]|confirm <RULE-ID> --by <name>>',
        indexLines: ['  reverse <init|status|next|confirm>            Reverse-engineer an existing system stage by stage, slice by slice'],
        subcommands: [SUB('init', 'create or extend the module inventory'), SUB('status', 'every stage with its metric and unmet criteria'), SUB('next', 'the open stage and what closes it'), SUB('confirm', 'a person confirms an inferred business rule')],
        strictSubcommands: true,
        examples: ['steelforge reverse init --critical payments', 'steelforge reverse status --feature billing-baseline', 'steelforge reverse confirm RULE-PAY-001 --by "Ana"'],
    },
    {
        name: 'migrate',
        aliases: ['modernize'],
        group: 'console',
        summary: 'Migration Kit (alias: modernize): enterprise portfolio, AWS 7 Rs, wave plan, strangler lifecycle, deterministic dynamic rules for events, learning',
        usage: 'steelforge migrate <init|assess|override|waves|estimate|plan|wave|advance|event|propose|resolve|learn|rules|status> [...]',
        indexLines: ['  migrate <init|assess|waves|plan|wave|advance|event|…>  Portfolio migration (alias: modernize) with deterministic dynamic workflows'],
        subcommands: [
            SUB('init', 'write .sdd/modernize/portfolio.json (--example banking|insurance-mainframe|datacenter-exit|database|monolith)'),
            SUB('assess', 'validate the portfolio, risk scores and 7 Rs dispositions'),
            SUB('override', 'record a named override of a disposition'),
            SUB('waves', 'retire first, pilot, dependency-ordered waves'),
            SUB('estimate', 'person-weeks P50/P90 per wave from the 7 Rs (declared, overridable weights)'),
            SUB('plan', 'start the L6 run with units and waves'),
            SUB('wave', 'start wave n: rules insert the steps of each component'),
            SUB('advance', 'move a component along its lifecycle (canary metrics, approvals)'),
            SUB('event', 'apply an event (security advisory, incident, regulatory change…)'),
            SUB('propose', 'submit an agent proposal on an event (validated; may only raise risk)'),
            SUB('resolve', 'close an event whose steps are done; unfreeze'),
            SUB('learn', 'reflection and rule candidate from a resolved event (--reflect)'),
            SUB('rules', 'list rules and candidates; adopt a candidate (--by, --confirm)'),
            SUB('status', 'text, --json, --mermaid or --html'),
        ],
        strictSubcommands: true,
        examples: ['steelforge migrate init --example insurance-mainframe', 'steelforge migrate assess', 'steelforge migrate event bank-mod --file cve.json', 'steelforge migrate status --html'],
    },
    {
        name: 'playbook',
        group: 'console',
        summary: 'Tailored playbooks: project profile, checker, planner, multi-host build and improvement',
        usage: 'steelforge playbook <profile|check|plan|build|improve|save|list|new|diff> [name|"intent"] [--target <host>] [--write] [--json]',
        indexLines: ['  playbook <profile|check|plan|build|improve|save|list>  Plan, check and build a playbook for this case'],
        subcommands: [
            SUB('profile', 'detected project signals and type'),
            SUB('check', 'validate a playbook (unknown keys, starved steps, `when`)'),
            SUB('plan', 'propose a playbook for an intent, without a model'),
            SUB('build', 'render the playbook for a host (--target, --write)'),
            SUB('improve', 'propose-probe-compose over recorded runs'),
            SUB('save', 'copy a checked playbook into .sdd/playbooks/'),
            SUB('list', 'library and project playbooks'),
            SUB('new', 'write a checked playbook from a base (--from, --add phase:use[:human], --skip id)'),
            SUB('diff', 'steps added, removed or changed between two playbooks'),
        ],
        strictSubcommands: true,
        examples: ['steelforge playbook profile', 'steelforge playbook plan "add refunds to billing"', 'steelforge playbook check brownfield-extension'],
    },
    {
        name: 'engine',
        group: 'console',
        summary: 'Start a playbook run for a feature and read its state',
        usage: 'steelforge engine <start|status|list> [feature] [--playbook <name>] [--units a,b:a] [--autonomous] [--mermaid] [--json]',
        indexLines: ['  engine <start|status> <feature>              Start or inspect a playbook run'],
        subcommands: [SUB('start', 'create the run from a checked playbook (--units a,b:a for waves)'), SUB('status', 'steps, time, tokens, waves (--mermaid for a diagram)'), SUB('list', 'every run with its progress'), SUB('event', 'apply an event to a run through the dynamic rules (--file event.json)')],
        strictSubcommands: true,
        examples: ['steelforge engine start refunds --playbook brownfield-extension', 'steelforge engine status refunds'],
    },
    {
        name: 'next',
        group: 'console',
        summary: 'The single next directive for a feature (the host-agnostic contract)',
        usage: 'steelforge next <feature> [--json] [--auto-handoff]',
        indexLines: ['  next <feature> [--json]                      What the agent must do now: run-step, ask, present-gate, handoff…'],
        examples: ['steelforge next refunds --json'],
    },
    {
        name: 'handoff',
        group: 'console',
        summary: 'Handoff packs: write the bounded context of a step, check recall, detect stale inputs',
        usage: 'steelforge handoff <write|recall|check> <feature> <step> [--text "<restatement>"] [--goal g]',
        indexLines: ['  handoff <write|recall|check> <feature> <step>  Bounded context pack, recall check, staleness'],
        subcommands: [SUB('write', 'write the pack'), SUB('recall', 'compare a restatement with the pack'), SUB('check', 'list stale inputs')],
        strictSubcommands: true,
        examples: ['steelforge handoff write refunds requirements', 'steelforge handoff recall refunds requirements --text "requirements: REQ-RF-001"'],
    },
    {
        name: 'questions',
        group: 'console',
        summary: 'Question files of a step: completeness check and named confirmation',
        usage: 'steelforge questions <check|confirm> <feature> <step> [--by <name>]',
        indexLines: ['  questions <check|confirm> <feature> <step>   Are the answers complete? Confirm them by name'],
        subcommands: [SUB('check', 'empty answers, missing X option'), SUB('confirm', 'stamp the answers with a confirmation id')],
        strictSubcommands: true,
        examples: ['steelforge questions check refunds requirements', 'steelforge questions confirm refunds requirements --by "Ana"'],
    },
    {
        name: 'hil',
        group: 'console',
        summary: 'Human-in-the-loop decision cards: prepare, answer by name, list and trigger statistics',
        usage: 'steelforge hil <prepare|answer|list|stats|review> <feature> [card-id option] [--card <file>] [--by <name>] [--confirm <card-id>] [--overdue]',
        indexLines: ['  hil <prepare|answer|list|stats> <feature>    Decision cards; approvals come only from a named answer'],
        subcommands: [SUB('prepare', 'validate and write a card'), SUB('answer', 'record a named answer and apply it'), SUB('list', 'cards and answers'), SUB('stats', 'useless escalations per trigger and threshold proposals'), SUB('review', 'one offline HTML page with every open card (--out f)')],
        strictSubcommands: true,
        examples: ['steelforge hil prepare refunds --card card.json', 'steelforge hil answer refunds HIL-001 A --by "Ana"'],
    },
    {
        name: 'memory',
        group: 'console',
        summary: 'Memory with provenance: capture, reflect with an admission gate, promote by name, withdraw',
        usage: 'steelforge memory <capture|reflect|promote|withdraw|list> [--kind k --text t] [--file f] [--by name] [--origin o]',
        indexLines: ['  memory <capture|reflect|promote|withdraw|list>  Lessons with provenance, never self-promoted'],
        subcommands: [SUB('capture'), SUB('reflect'), SUB('promote'), SUB('withdraw'), SUB('list')],
        strictSubcommands: true,
        examples: ['steelforge memory list', 'steelforge memory promote L-0123456789 --by "Ana"'],
    },
    {
        name: 'waves',
        group: 'console',
        summary: 'Transactional wave plan with the git commands',
        usage: 'steelforge waves <feature> | --baseline <n> --protect <paths> | --verify <n> --check "<cmd>" [--units a,b]',
        indexLines: ['  waves <feature>                             Transactional wave plan with git commands'],
        examples: ['steelforge waves stripe-billing'],
    },
    {
        name: 'floor',
        group: 'console',
        summary: 'The enforcement floor: commit hook plus the PR gate matrix',
        usage: 'steelforge floor <status|install> [target] [--ci]',
        indexLines: ['  floor [status|install] [target] [--ci]       Enforcement floor: commit hook + PR gate matrix'],
        subcommands: [
            SUB('status', 'is the commit/merge floor installed here?'),
            SUB('install', 'install the commit hook and the CI workflow'),
        ],
        strictSubcommands: true,
        examples: ['steelforge floor status', 'steelforge floor install . --ci'],
    },
    {
        name: 'standards',
        group: 'console',
        summary: 'The standards engine: list, show, explain, check and fix the catalogue',
        usage: 'steelforge standards <list|show|explain|check|fix> [<id>] [--apply] [--json]',
        indexLines: ['  standards [list|show|explain|check|fix]  The machine-checkable standards catalogue: findings with a graded remedy'],
        subcommands: [
            SUB('list', 'the catalogue entries and which ones block'),
            SUB('show', 'one entry in full'),
            SUB('explain', 'one entry and what it decides'),
            SUB('check', 'run every applicable standard over the declared artifacts'),
            SUB('fix', 'apply a remedy (`--apply` only auto-applies the safe class)'),
        ],
        strictSubcommands: true,
        examples: ['steelforge standards list', 'steelforge standards check --json', 'steelforge standards explain REQ-EARS-001'],
    },
    {
        name: 'requirements',
        group: 'console',
        summary: 'The requirements coach: quality review, an executable checklist and graded repairs',
        usage: 'steelforge requirements <review|checklist|fix> <feature> [--json] [--apply <id>]',
        indexLines: [
            '  requirements [review|checklist|fix] <feature>  The requirements coach: findings with a rewrite or a question',
        ],
        subcommands: [
            SUB('review', 'run the quality checks over the requirements and propose rewrites'),
            SUB('checklist', 'run the checklist predicates and record their digests'),
            SUB('fix', 'apply a graded remedy (`--apply <id>` only auto-applies the safe class)'),
        ],
        strictSubcommands: true,
        examples: ['steelforge requirements review stripe-billing', 'steelforge requirements checklist stripe-billing', 'steelforge requirements fix stripe-billing --apply REQ-RQC-001'],
    },
    {
        name: 'modes',
        group: 'console',
        summary: 'SDD modes: the six flows, the module matrix per rigor level and which skills fit each kind of project',
        usage: 'steelforge modes [--level <explore|spec-first|spec-anchored|spec-as-source>] [--brownfield] [--governance <solo|team|enterprise>] [--projects | --project <type>] [--json]',
        indexLines: ['  modes [--level <l>] [--projects]  Flows, module matrix and the skills for each kind of project'],
        examples: ['steelforge modes', 'steelforge modes --level spec-anchored --brownfield', 'steelforge modes --projects', 'steelforge modes --project legacy-untested'],
    },
    {
        name: 'trace',
        group: 'daily',
        summary: 'Requirement → task traceability of a feature; uncovered requirements named (exit 1 if any)',
        usage: 'steelforge trace <feature> [--mermaid|--csv] [--out <file>] [--json]',
        indexLines: ['  trace <feature> [--mermaid]       Requirement → task links; Mermaid with --mermaid; client acceptance matrix with --csv'],
        examples: ['steelforge trace stripe-billing', 'steelforge trace stripe-billing --mermaid --out trace.mmd'],
    },
    {
        name: 'report',
        group: 'daily',
        summary: 'One self-contained HTML page: requirements, tasks, evidence and the trace graph (no script, no network)',
        usage: 'steelforge report <feature> --html [--out <file>] | steelforge report <feature> --step <id> --result <started|awaiting-approval|rejected|revised|completed|skipped|park|unpark> [--produced a,b] [--reason r] [--by name] [--tokens n] [--model id] [--duration s]',
        indexLines: ['  report <feature> --html [--out f] Self-contained HTML report of a feature', '  report <feature> --step <id> --result <r>   Tell the engine what happened to a step (never `approved`)'],
        examples: ['steelforge report stripe-billing --html --out report.html'],
    },
    {
        name: 'badge',
        group: 'score',
        summary: 'Offline SVG badge of the composite SDD score for a README',
        usage: 'steelforge badge [--out <file>]',
        indexLines: ['  badge [--out sdd.svg]             SVG badge of the SDD score'],
        examples: ['steelforge badge --out docs/sdd-badge.svg'],
    },
    {
        name: 'stages',
        group: 'console',
        summary: 'The stage guide of a feature: where it is and what it needs to advance',
        usage: 'steelforge stages <feature> [--level <l>] [--json]',
        indexLines: ['  stages <feature>                  Where the feature is and what the next stage needs'],
        examples: ['steelforge stages stripe-billing'],
    },
    {
        name: 'gherkin',
        group: 'console',
        summary: 'EARS acceptance criteria → acceptance.feature, one scenario per criterion tagged with its REQ id',
        usage: 'steelforge gherkin <feature> [--lang es|en] [--write] [--json]',
        indexLines: ['  gherkin <feature> [--write]       EARS criteria → acceptance.feature traced to each REQ'],
        examples: ['steelforge gherkin stripe-billing', 'steelforge gherkin stripe-billing --lang es --write'],
    },
    {
        name: 'archive',
        group: 'console',
        summary: 'Move a finished, verified spec to .sdd/archive/ (dry run unless --confirm)',
        usage: 'steelforge archive <feature> [--confirm] [--json]',
        indexLines: ['  archive <feature> [--confirm]     Archive a verified spec out of .sdd/specs/'],
        examples: ['steelforge archive stripe-billing', 'steelforge archive stripe-billing --confirm'],
    },
    {
        name: 'discovery',
        group: 'console',
        summary: 'Gate over the discovery brief and the append-only decision log',
        usage: 'steelforge discovery <lint <feature> [--json] | log <feature> <decision|assumption|crack|kill|lock|source> <text>>',
        indexLines: ['  discovery <lint|log> <feature>    Brief gate (non-goals, measurable outcome, assumptions) and decision log'],
        subcommands: [SUB('lint', 'check brief.md before it becomes requirements'), SUB('log', 'append a typed entry to discovery.log.md')],
        strictSubcommands: true,
        examples: ['steelforge discovery lint orders', 'steelforge discovery log orders kill "no mobile app in v1"'],
    },
    {
        name: 'steering',
        group: 'console',
        summary: 'Readiness of .sdd/steering/: core files, inclusion modes, file references and unconfirmed inferences',
        usage: 'steelforge steering <check|draft [--write] [--force]> [--json]',
        indexLines: ['  steering check                    Is the steering confirmed, or still inferred?'],
        subcommands: [SUB('check', 'core files, inclusion, #[[file:…]] references and markers'), SUB('draft', 'draft product/tech/structure from the workspace, marked (inferred) (--write)')],
        strictSubcommands: true,
        examples: ['steelforge steering check'],
    },
    {
        name: 'review',
        group: 'console',
        summary: 'One review surface for a change: requirements as word-level diffs',
        usage: 'steelforge review <feature> --base <ref> [--json] | steelforge review record <feature> <step> --by <name> [--by-model <id> --author-model <id>] --artifact <path> [--root <dir>] | steelforge review freeze-check <staged files…>',
        indexLines: ['  review <feature> --base <ref>                One page: added/modified/removed requirements as word-level diffs', '  review <record|freeze-check>                 Review receipts and the pre-commit freeze of reviewed artifacts'],
        details: ['Each row carries its tasks, the tests that would fail if it changed, and a risk score; an unapproved requirement change exits non-zero.'],
        examples: ['steelforge review stripe-billing --base main', 'steelforge review stripe-billing --base HEAD~1 --json'],
    },
    {
        name: 'audit',
        group: 'console',
        summary: 'Audit report, evidence bundle and SARIF for code scanning',
        usage: 'steelforge audit [<feature>] [--regulatory] [--json] | steelforge audit <bundle|sarif> [feature] [--out <dir>] [--sarif <path>] | steelforge audit trail [feature] [--requirement R] [--principle C] [--actor human|agent|rule|system] [--who name] [--decisions] [--json|--csv]',
        indexLines: [
            '  audit [bundle|sarif] [feature] [--out <dir>] [--json] [--sarif <path>]  Audit report; evidence bundle with a sha256 per artifact; SARIF 2.1.0 for code scanning',
            '  audit trail [feature] [--requirement R] [--principle C] [--actor K] [--otlp f]  Who decided what, why, on which requirements and principles (hash-chained; exit 1 if tampered); OTLP/JSON for OpenTelemetry',
        ],
        subcommands: [SUB('bundle', 'the evidence bundle with a sha256 per artifact'), SUB('sarif', 'SARIF 2.1.0 for code scanning'), SUB('trail', 'decision records: who, why, requirements, principles')],
        examples: ['steelforge audit', 'steelforge audit stripe-billing --regulatory', 'steelforge audit bundle stripe-billing --out .sdd/audit'],
    },
    {
        name: 'doctor',
        group: 'console',
        summary: 'Self-diagnosis: Node, CLI, commit gate, stop hooks, rigor, constitution and specs',
        usage: 'steelforge doctor [target] [--json] [--fix]',
        indexLines: [
            '  doctor [--json] [--fix] [target]             Self-diagnosis: Node, CLI, commit gate, stop hooks, rigor, constitution, specs',
        ],
        details: ['Every `!`/`✗` check names the command that fixes it; `--fix` repairs in place only the safe, idempotent items.'],
        examples: ['steelforge doctor', 'steelforge doctor --json', 'steelforge doctor --fix'],
    },
    {
        name: 'mcp',
        group: 'console',
        summary: 'Model Context Protocol over stdio (a server, not a one-shot command)',
        usage: 'steelforge mcp',
        indexLines: ['  mcp                                          Model Context Protocol over stdio (a server, not a one-shot command)'],
        examples: ['steelforge mcp'],
    },
    {
        name: 'help',
        group: 'console',
        summary: 'This help, the help of one command, or a topic',
        usage: 'steelforge help [command|exit-codes|rigor|formatting]',
        indexLines: ['  help [command]                               This help, or the help of one command'],
        details: [
            '`--help` and `help` read the SAME table: a command that is routed has help, and a test enforces it.',
        ],
        examples: ['steelforge help', 'steelforge help gates', 'steelforge help exit-codes'],
    },
    {
        name: 'init',
        aliases: ['spec-init'],
        group: 'console',
        summary: 'One-shot project bootstrap; `init <feature>` still creates a spec',
        usage: 'steelforge init [target] [--agent <id>] [--level <l>] [--skills] [--mcp] [--write] [--json]',
        indexLines: [
            '  init [target] [--agent <id>] [--level <l>] [--skills] [--mcp] [--write] [--json]  One-shot project bootstrap; "init <feature>" still creates a spec',
        ],
        details: [
            'Without `--write` it plans and writes nothing. A positional that is not an existing directory and carries no project flag is still a feature slug.',
        ],
        examples: ['steelforge init .', 'steelforge init . --write', 'steelforge init stripe-billing --title="Stripe billing"'],
    },
    {
        name: 'status',
        aliases: ['spec-status'],
        group: 'console',
        summary: 'Whole state on one screen, with the next command to run',
        usage: 'steelforge status [feature] [--check] [--quiet] [--json] [--celebrations]',
        indexLines: [
            '  status [feature] [--check] [--quiet] [--json] [--celebrations]  Whole state on one screen, with the next command to run',
        ],
        examples: ['steelforge status', 'steelforge status stripe-billing --check', 'steelforge status --json'],
    },
    {
        name: 'brownfield',
        group: 'brownfield',
        summary: 'The brownfield console: the existing code is the source of truth',
        usage: 'steelforge brownfield <survey|bootstrap|constitution|templates|specify|requirements|clarify|converge|analyze|impact|contracts|reuse|ids|forecast|repair>',
        indexLines: [
            '  brownfield [survey|bootstrap|constitution|templates|specify|requirements|clarify|converge|analyze|impact|contracts|reuse|ids|forecast|repair]  The brownfield console',
            '  brownfield survey [target]                    Detect the stack, boundaries and evidence',
            '  brownfield bootstrap [target] [--focus F] [--write]  One entry point: recon + constitution + module map + code intelligence + steps',
            '  brownfield constitution [target] [--write] [--draft]  Reverse-engineer the descriptive constitution',
            '  brownfield templates [target] [--write] [--json]  Brownfield requirement/design/task templates',
            '  brownfield specify <feature> "<descripción>" [--area A] [--write] [--json]  Derive EARS requirements from a description',
            '  brownfield requirements <feature> [--suggest] [--apply <i>] [--write] [--json]  EARS assistant over requirements.md',
            '  brownfield ids <feature> --base <ref> [--json]  Stable-id audit: ID-MUTATED / ID-LOST against a base revision',
            '  brownfield clarify <feature> [--max N] [--write] [--json]  Clarifying questions before specifying',
            '  brownfield converge <feature> [--write] [--json]  Convergence of the delta against the base',
            '  brownfield analyze <feature> [--base R] [--json]  Change impact of a feature',
            '  brownfield impact <feature> [--base R]        Dependents, breaking changes, migrations, public API surface',
            '  brownfield contracts <feature> [--write] [--verify]  The regression oracle: which tests protect the change',
            '  brownfield reuse <feature> [--symbols A,B]    Search for existing symbols before creating new ones',
            '  brownfield forecast "<descripción>" [--symbols A,B] [--json]  Expected blast radius before writing code',
            '  brownfield repair <feature> --target <artefacto> [--write] [--json]  Repair a failing artifact with evidence',
        ],
        subcommands: [
            SUB('survey', 'detect the stack, boundaries and evidence'),
            SUB('bootstrap', 'recon + constitution + module map + code intelligence + steps'),
            SUB('constitution', 'reverse-engineer the descriptive constitution'),
            SUB('templates', 'brownfield requirement/design/task templates'),
            SUB('specify', 'derive EARS requirements from a description'),
            SUB('requirements', 'EARS assistant over requirements.md'),
            SUB('clarify', 'clarifying questions before specifying'),
            SUB('converge', 'convergence of the delta against the base'),
            SUB('analyze', 'change impact of a feature'),
            SUB('impact', 'dependents, breaking changes, migrations, public API surface'),
            SUB('contracts', 'the regression oracle: which tests protect the change'),
            SUB('reuse', 'search for existing symbols before creating new ones'),
            SUB('ids', 'stable-id audit: ID-MUTATED / ID-LOST against a base revision'),
            SUB('forecast', 'expected blast radius before writing code'),
            SUB('repair', 'repair a failing artifact with evidence'),
        ],
        strictSubcommands: true,
        examples: ['steelforge brownfield survey .', 'steelforge brownfield constitution . --write', 'steelforge brownfield contracts stripe-billing --verify'],
    },
    {
        name: 'delta',
        group: 'brownfield',
        summary: 'The contract of change (brownfield: the delta, not the system)',
        usage: 'steelforge delta <init|validate|status|render|merge> [feature]',
        indexLines: [
            '  delta [init|validate|status|render|merge]  The contract of change (brownfield: the delta, not the system)',
            '  delta init <feature> "<title>"                Scaffold a delta spec (ADDED/MODIFIED/REMOVED/RENAMED)',
            '  delta validate <feature>                      Validate ids, EARS, targets, contracts and traceability',
            '  delta status <feature>                        Change counts, strangulation progress, traceability',
            '  delta render <feature>                        Render the delta spec',
            '  delta merge <feature> [--write]               Merge the delta into the base spec',
        ],
        subcommands: [
            SUB('init', 'scaffold a delta spec (ADDED/MODIFIED/REMOVED/RENAMED)'),
            SUB('validate', 'validate ids, EARS, targets, contracts and traceability'),
            SUB('status', 'change counts, strangulation progress, traceability'),
            SUB('render', 'render the delta spec'),
            SUB('merge', 'merge the delta into the base spec'),
            SUB('merge-back', 'alias of `merge`'),
        ],
        strictSubcommands: true,
        examples: ['steelforge delta init stripe-billing "Add billing"', 'steelforge delta validate stripe-billing', 'steelforge delta merge stripe-billing --write'],
    },
    {
        name: 'tour',
        group: 'experience',
        summary: 'Guided first run: recon, constitution draft, check, status, delta',
        usage: 'steelforge tour [target] [--write] [--lang es|en] [--json]',
        indexLines: [
            '  tour [target] [--write] [--lang es|en] [--json]  Guided first run: recon, constitution draft, check, status, delta',
        ],
        examples: ['steelforge tour', 'steelforge tour --write', 'steelforge tour --lang en'],
    },
    {
        name: 'context',
        group: 'experience',
        summary: 'The context pack the MCP server serves, in the terminal',
        usage: 'steelforge context [feature] [--lang es|en] [--json]',
        indexLines: ['  context [feature] [--lang es|en] [--json]        The context pack the MCP server serves, in the terminal'],
        examples: ['steelforge context', 'steelforge context stripe-billing --json'],
    },
    {
        name: 'integrate',
        group: 'adoption',
        summary: 'Register the MCP server, install the skills and the Stop hook',
        usage: 'steelforge integrate [host] [--list] [--write] [--json] [--dry-run]',
        indexLines: [
            '  integrate [host] [--write] [--json] [--dry-run]  Register the MCP server, install its skills and its Stop hook',
            '  integrate --list                                 The whole matrix: skills layout, invocation syntax, MCP path, verified?',
            '  integrate vscode-tasks [--write]                 SDD tasks in .vscode/tasks.json (Run Task), merge-only',
        ],
        examples: ['steelforge integrate --list', 'steelforge integrate claude-code --write'],
    },
    {
        name: 'import',
        group: 'adoption',
        summary: "Map an incumbent's specs into .sdd (a mapping, never a promise)",
        usage: 'steelforge import <spec-kit> [--write] [--json]',
        indexLines: [
            "  import [spec-kit] [--write] [--json] Map an incumbent's specs into .sdd (a mapping, never a promise)",
        ],
        details: ['The mapping is declared and reviewable: it never claims a lossless conversion.'],
        examples: ['steelforge import spec-kit --write'],
    },
    {
        name: 'gitflow',
        group: 'daily',
        summary: "The branch's role and what that role requires",
        usage: 'steelforge gitflow [--level <l>] [--greenfield] [--json]',
        indexLines: ["  gitflow [--level <l>] [--greenfield] [--json]  The branch's role and what that role requires"],
        examples: ['steelforge gitflow', 'steelforge gitflow --json'],
    },
    {
        name: 'progress',
        group: 'daily',
        summary: 'The append-only progress ledger',
        usage: 'steelforge progress [--json] [--limit N] | steelforge progress record --kind <tipo> --summary "<una línea>" --score <0..100> --phase <1|2|3> [--evidence <p>] [--json]',
        indexLines: [
            '  progress [--json] [--limit N]                 The append-only progress ledger',
            '  progress record --kind <tipo> --summary "<una línea>" --score <0..100> --phase <1|2|3> [--evidence <p>] [--json]  Record a milestone',
        ],
        subcommands: [SUB('record', 'record a milestone in the ledger')],
        examples: ['steelforge progress', 'steelforge progress record --kind review --summary "reviewed" --score 80 --phase 2'],
    },
    {
        name: 'backup',
        group: 'daily',
        summary: 'The restorable backup of .sdd/ with a verifiable manifest',
        usage: 'steelforge backup <create|verify|restore> [archive] [--write] [--json]',
        indexLines: [
            '  backup [create|verify|restore]  The restorable backup of .sdd/ with a verifiable manifest',
            '  backup create [--out <dir>] [--force] [--json]  A restorable copy of .sdd/ with a sha256 per file',
            '  backup verify <archive> [--json]              Recompute every sha256 against the manifest',
            '  backup restore <archive> [--write] [--only <ruta>] [--json]  Restore; without --write it is a dry run',
        ],
        subcommands: [
            SUB('create', 'a restorable copy of .sdd/ with a sha256 per file'),
            SUB('verify', 'recompute every sha256 against the manifest'),
            SUB('restore', 'restore; without `--write` it is a dry run'),
        ],
        strictSubcommands: true,
        examples: ['steelforge backup create', 'steelforge backup verify .sdd/backups/x', 'steelforge backup restore .sdd/backups/x'],
    },
    {
        name: 'biography',
        group: 'daily',
        summary: 'The rhythm of a living specification (git, amendments, ratifications)',
        usage: 'steelforge biography <feature> [--limit N] [--json]',
        indexLines: [
            '  biography <feature> [--limit N] [--json]      The rhythm of a living specification (git, amendments, ratifications)',
        ],
        examples: ['steelforge biography stripe-billing'],
    },
    {
        name: 'gap',
        aliases: ['validate-gap'],
        group: 'daily',
        summary: 'Blast radius and gap analysis',
        usage: 'steelforge gap <feature> [--json]',
        indexLines: ['  gap <feature> [--json]                        Blast radius and gap analysis'],
        examples: ['steelforge gap stripe-billing'],
    },
    {
        name: 'getspecs',
        group: 'daily',
        summary: 'Reverse-engineer steering + roadmap + spec seeds',
        usage: 'steelforge getspecs [focus] [--json]',
        indexLines: ['  getspecs [focus] [--json]                     Reverse-engineer steering + roadmap + spec seeds'],
        examples: ['steelforge getspecs', 'steelforge getspecs src/auth'],
    },
    {
        name: 'verify',
        aliases: ['validate-impl'],
        group: 'daily',
        summary: 'Standalone integration verification gate',
        usage: 'steelforge verify <feature> [--json]',
        indexLines: ['  verify <feature> [--json]                     Standalone integration verification gate'],
        examples: ['steelforge verify stripe-billing'],
    },
    {
        name: 'impl',
        group: 'daily',
        summary: 'Autonomous implementation with review',
        usage: 'steelforge impl <feature> [tasks] [--review required|inline|off]',
        indexLines: ['  impl <feature> [tasks] [--review required|inline|off]  Autonomous implementation with review'],
        examples: ['steelforge impl stripe-billing', 'steelforge impl stripe-billing --review inline'],
    },
    {
        name: 'validation',
        group: 'daily',
        summary: 'Validation each task must show, raised by deterministic rules (money, PII, auth, public API, latency, migrations; yours in .sdd/settings/validation-rules.json); exit 1 when a done task lacks a blocking kind',
        usage: 'steelforge validation <feature> [--record] [--json]',
        indexLines: ['  validation <feature> [--record]            Tests each task must show, by rule; --record writes the decisions to the audit log'],
        examples: ['steelforge validation transfers', 'steelforge validation transfers --record'],
    },
    {
        name: 'flow',
        group: 'daily',
        summary: 'Every stage and step of a feature with its status, the current one, pending decisions and flow metrics (schema open-sdd.flow/1 for dashboards)',
        usage: 'steelforge flow [feature] [--json|--markdown]',
        indexLines: ['  flow [feature] [--json]                    Clear status (state, stage, blockers, next command); all features without one'],
        examples: ['steelforge flow transfers', 'steelforge flow transfers --json'],
    },
    {
        name: 'attest',
        group: 'daily',
        summary: 'in-toto Statement v1 of a feature delivery: sha256 of the spec and constitution, commit, status, validation and the audit chain head; --verify detects any later change',
        usage: 'steelforge attest <feature> [--write [--out <file>]] | steelforge attest --verify <file>',
        indexLines: ['  attest <feature> [--write] | --verify <f>  in-toto attestation of what was delivered; verify detects later changes'],
        examples: ['steelforge attest cobros --write', 'steelforge attest --verify .sdd/attestations/cobros.intoto.json'],
    },
    {
        name: 'estimate',
        group: 'daily',
        summary: 'Effort P50/P90 and calendar from tasks.md (declared, overridable factors); --sow drafts a scope for an offer',
        usage: 'steelforge estimate <feature> [--sow [--write]] [--json]',
        indexLines: ['  estimate <feature> [--sow [--write]]       Effort P50/P90 + calendar from the spec; --sow drafts the offer scope'],
        examples: ['steelforge estimate stripe-billing', 'steelforge estimate stripe-billing --sow --write'],
    },
    {
        name: 'uninstall',
        group: 'reversibility',
        summary: 'Plan (and with `--write`, apply) the removal of everything a run wrote',
        usage: 'steelforge uninstall [--write] [--purge-sdd] [--json]',
        indexLines: ['  uninstall [--write] [--purge-sdd] [--json]   Plan first; `--write` applies; `.sdd/` is kept unless --purge-sdd'],
        details: ['Without `--write` nothing is removed. `.sdd/` is the user’s data and is removed only with an explicit `--purge-sdd`.'],
        examples: ['steelforge uninstall', 'steelforge uninstall --write', 'steelforge uninstall --write --purge-sdd'],
    },
    {
        name: 'restore',
        group: 'reversibility',
        summary: 'Apply the uninstall plan recorded in a receipt',
        usage: 'steelforge restore --from <recibo> [--write]',
        indexLines: ['  restore [--from <recibo>] [--write]           Undo a run from its receipt (same safety rules as uninstall)'],
        details: ['`--from` names the receipt file. A file a human edited, or one merged into a foreign file, is refused with its reason, never deleted.'],
        examples: ['steelforge restore --from .sdd/.open-sdd-receipt.json', 'steelforge restore --from receipt.json --write'],
    },
    {
        name: 'open-sdd',
        group: 'score',
        summary: 'Inspect the repository: composite SDD score, phase and the ONE next action',
        usage: 'open-sdd',
        indexLines: ['  open-sdd                                    Inspect the repository: composite SDD score, phase and the ONE next action'],
        details: ['The door is read-only and never prompts. The full command catalog is one flag away (`--help`).'],
        examples: ['open-sdd', 'steelforge --no-footer'],
    },
    {
        name: 'explain',
        group: 'console',
        summary: 'A gate code or a requirement id, offline: what it is, and for a REQ id where it is defined, which tasks cite it and which files name it',
        usage: 'steelforge explain <C1|…|C7|O1|…|O7|REQ-ID> [--json]',
        indexLines: ['  explain <C1|REQ-ID>               A gate code, or a requirement: definition, citing tasks, files'],
        details: [
            'A gate code resolves to its name, posture and description from `core/gateCatalog.ts` (the same table `gates list` reads).',
            'A `REQ-…` id is looked up in every spec under `.sdd/specs/`; the files that name it come from `git grep` over tracked files.',
        ],
        examples: ['steelforge explain C1', 'steelforge explain REQ-MAT-001'],
    },
];
export const COMMAND_INDEX = (() => {
    const index = {};
    for (const doc of COMMANDS) {
        index[doc.name] = doc;
        for (const alias of doc.aliases ?? [])
            index[alias] = doc;
    }
    return index;
})();
/** Todo comando enrutable por su nombre canónico o alias. */
export const KNOWN_COMMANDS = new Set(Object.keys(COMMAND_INDEX));
/** Los comandos canónicos, en el orden de la tabla (uno por ayuda). */
export const ROUTED_COMMANDS = COMMANDS.map((doc) => doc.name);
/** Subcomandos por comando, para validar el despacho y sugerir el más cercano. */
export const SUBCOMMAND_INDEX = (() => {
    const index = {};
    for (const doc of COMMANDS) {
        if (!doc.subcommands || doc.subcommands.length === 0)
            continue;
        index[doc.name] = doc.subcommands.map((sub) => sub.name);
        for (const alias of doc.aliases ?? [])
            index[alias] = index[doc.name];
    }
    return index;
})();
/** Solo los comandos cuyo primer posicional ES un subcomando: un valor desconocido es error de uso. */
export const STRICT_SUBCOMMANDS = (() => {
    const strict = {};
    for (const doc of COMMANDS) {
        if (!doc.strictSubcommands || !doc.subcommands)
            continue;
        strict[doc.name] = doc.subcommands.map((sub) => sub.name);
        for (const alias of doc.aliases ?? [])
            strict[alias] = strict[doc.name];
    }
    return strict;
})();
// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------
const SKILLS_LINES = [
    '  /sdd-help                                   Interactive guide with real-world examples',
    '  /sdd-getspecs                               Bootstrap existing repository (Brownfield)',
    '  /sdd-discovery <idea>                       Discover and structure new initiatives',
    '  /sdd-spec-quick <feature> --auto            One-shot spec creation & approval',
    '  /sdd-impl <feature>                         Autonomous TDD implementation with review',
    '  /sdd-validate-impl <feature>                Standalone integration verification gate',
    '  /sdd-audit <feature>                        EU AI Act / NIST compliance audit report',
    '  /sdd-spec-status <feature>                  Show real-time progress and next actions',
];
const HELP_SECTIONS = [
    { group: 'essential', heading: 'The five verbs (start here; `open-sdd` alone is the first one):' },
    { group: 'templates', heading: 'Command templates (the DEFAULT integration: 22 workflows, no MCP and no network):' },
    { group: 'skills', heading: 'In-Chat Skills (The Apple-grade Experience):', staticLines: SKILLS_LINES },
    { group: 'console', heading: 'Zero-Trust console (reference architecture):' },
    { group: 'brownfield', heading: 'Brownfield (existing code that is the de facto source of truth):' },
    { group: 'experience', heading: 'Experience layer (bilingual: --lang es|en, or OPEN_SDD_LANG):' },
    {
        group: 'adoption',
        heading: 'Adoption (the integration matrix and the importers):',
        // Derived from the integrations matrix so the list never drifts from what `integrate` accepts.
        after: [`  hosts: ${HOST_INTEGRATIONS.map((host) => host.id).join(', ')}`],
    },
    { group: 'daily', heading: 'Daily drivers (read-only reports: none of these runs the gate chain):' },
    { group: 'reversibility', heading: 'Reversibility (the tool is reversible — tenet 12):' },
    { group: 'score', heading: 'Score (one number, one door):' },
];
const globalOptions = () => {
    const aliasFlags = Array.from(new Set(agentList.flatMap((key) => getAgentDefinition(key).aliasFlags)));
    const aliasLine = aliasFlags.length > 0 ? [`  ${aliasFlags.join(' | ')}  Agent alias flags`] : [];
    return [
        `  --agent <${agentList.join('|')}>  Select agent`,
        ...aliasLine,
        `  --lang <${SUPPORTED_LOCALES.join('|')}>  Console locale (the only translated ones; any other value is refused by name)`,
        '  --os <auto|mac|windows|linux>               Target OS (auto uses runtime)',
        '  --sdd-dir <path>                            SDD root dir (default .sdd)',
        '  --overwrite <prompt|skip|force>             Overwrite policy (default: prompt)',
        '                                              prompt: ask for each file',
        '                                              skip: never overwrite',
        '                                              force: always overwrite',
        '  --backup[=<dir>]                            Enable backup, optional dir',
        '  --profile <full|minimal>                    Select template profile (default: full)',
        '  --manifest <path>                           Manifest JSON path for planning',
        '  --dry-run                                   Print plan only',
        '  --yes, -y                                   Skip prompts (prompt -> force)',
        '  --no-input                                  Never prompt; a blocked prompt names --yes and --no-input',
        '  --color <auto|always|never>                 Color policy (default auto); NO_COLOR/FORCE_COLOR also honoured',
        '  --json | --quiet                            Machine output; both suppress the score footer',
        '  --no-footer                                 Suppress the score footer on any command (scripts)',
        '  -h, --help                                  Show help (or the help of one command)',
        '  -v, --version                               Show version',
    ];
};
const quickExamples = () => [
    `${INSTALL_COMMAND}                         Install Claude Code skills (default)`,
    `${INSTALL_COMMAND} --cursor-skills         Install Cursor IDE skills`,
    `${INSTALL_COMMAND} --antigravity           Install Google Antigravity skills`,
    `${INSTALL_COMMAND} --copilot-skills        Install GitHub Copilot skills`,
    `${INSTALL_COMMAND} --lang es -y            Install in Spanish without prompts`,
];
const LEARN_MORE = [
    '  · steelforge help rigor          the three rigor levels and what each one demands',
    '  · steelforge help exit-codes     the exit-code contract, including the host-loop sentinel',
    '  · steelforge help formatting     color, NO_COLOR/FORCE_COLOR/--color and the machine surface',
    '  · steelforge explain C1          what a gate code checks, offline',
    '  · docs/PAPER-ALIGNMENT.md      the normative traceability report',
];
/**
 * La ayuda por defecto (REQ-SX-001): cinco verbos, la instalación y la puerta a `help --all`. El
 * catálogo completo sigue intacto detrás de `--all`; ningún comando deja de existir.
 */
export const renderEssentialHelp = () => [
    'Usage: steelforge [verb] — Spec-Driven Development in five verbs',
    '',
    '  open-sdd                     Where you are and the ONE next action',
    '  steelforge setup [--write]     Install into this repo (detects agent and terrain; plan first)',
    '  steelforge start "<intent>"    Start any work: level, rigor and playbook are chosen for you',
    '  steelforge check               One verdict: the whole gate chain (exit 1 when it fails)',
    '  steelforge decide              Human decisions waiting for you, with the exact command',
    '',
    `Install:  ${INSTALL_COMMAND}   (Claude Code; --cursor-skills, --copilot-skills, --codex-skills…)`,
    'In chat:  /sdd-help · /sdd-spec-quick <feature> · /sdd-impl <feature> · /sdd-spec-status <feature>',
    '',
    'Colours:  green = automatic · amber = advisory · red = blocks · blue = a person decides',
    '',
    'Everything else (all commands still work):  steelforge help --all',
    'One command in detail:                      steelforge help <command>',
].join('\n');
/** El índice completo. Es la proyección de `COMMANDS`: no hay una segunda lista escrita a mano. */
export const renderFullHelp = () => {
    const lines = ['Usage: steelforge [options] (alias: open-sdd)', '', 'Options:', ...globalOptions()];
    lines.push('', 'Quick Examples:', ...quickExamples());
    for (const section of HELP_SECTIONS) {
        lines.push('', section.heading);
        if (section.staticLines)
            lines.push(...section.staticLines);
        for (const doc of COMMANDS.filter((candidate) => candidate.group === section.group)) {
            lines.push(...doc.indexLines);
        }
        if (section.after)
            lines.push(...section.after);
    }
    lines.push('', 'LEARN MORE', ...LEARN_MORE);
    lines.push('', 'Note: In non-TTY environments, prompt mode falls back to skip.');
    return lines.join('\n');
};
/** La ayuda de UN comando, desde la misma tabla. `undefined` si el comando no está enrutado. */
export const renderCommandHelp = (name) => {
    const doc = COMMAND_INDEX[name.toLowerCase()];
    if (!doc)
        return undefined;
    const lines = ['', formatHeading(`Command: steelforge ${doc.name}`), `  ${doc.summary}`, ''];
    if (doc.aliases && doc.aliases.length > 0)
        lines.push(`Aliases: ${doc.aliases.map((alias) => `steelforge ${alias}`).join(', ')}`, '');
    lines.push('Usage:', `  ${doc.usage}`, '');
    if (doc.subcommands && doc.subcommands.length > 0) {
        lines.push('Subcommands:');
        const width = Math.max(...doc.subcommands.map((sub) => sub.name.length));
        for (const sub of doc.subcommands) {
            lines.push(`  ${sub.name.padEnd(width)}  ${sub.summary ?? ''}`.trimEnd());
        }
        lines.push('');
    }
    if (doc.details && doc.details.length > 0) {
        lines.push('Details:');
        for (const detail of doc.details)
            lines.push(`  ${detail}`);
        lines.push('');
    }
    lines.push(colors.bold('Examples:'));
    for (const example of doc.examples)
        lines.push(`  ${example}`);
    lines.push('');
    lines.push(colors.bold('Learn more:'));
    lines.push('  steelforge help exit-codes    the exit-code contract, including the host-loop sentinel');
    lines.push('  steelforge help formatting    color, machine output and diagnostics');
    if (doc.group === 'console' || doc.group === 'brownfield' || doc.group === 'daily') {
        lines.push('  steelforge explain C1         what a gate code checks, offline');
    }
    lines.push('  docs/PAPER-ALIGNMENT.md     the normative traceability report');
    lines.push('');
    return lines.join('\n');
};
// ---------------------------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------------------------
const RIGOR_USAGE = () => {
    const lines = ['', formatHeading('RIGOR — the cumulative ladder'), ''];
    for (const spec of RIGOR_LEVELS) {
        lines.push(`  ${spec.level.padEnd(16)} ${spec.name} — gates ${spec.gatesActive.join(', ')}`);
        lines.push(`      ${spec.definition}`);
        lines.push(`      check: ${spec.evaluatorCheck}`);
    }
    lines.push('');
    lines.push(`  aspects: ${RIGOR_ASPECTS.join(', ')}`);
    lines.push('  = note: the levels only ADD; a higher level never lowers what the floor already checks');
    lines.push('  = note: the constitution is required at every level — a blocking verdict cites it');
    lines.push('  = help: `steelforge govern rigor` assesses this repository against the declared level');
    lines.push('');
    return lines.join('\n');
};
const FORMATTING_USAGE = () => {
    const lines = ['', formatHeading('FORMATTING — color, diagnostics and the machine surface'), ''];
    lines.push('  Color precedence: --color=auto|always|never > FORCE_COLOR > NO_COLOR > TTY');
    lines.push('  NO_COLOR disables COLOR only (present and non-empty); bold/dim stay available');
    lines.push('  FORCE_COLOR present and not 0/false forces color even without a TTY');
    lines.push('  Every verdict keeps its glyph (✓ / ! / ✗) AND its word (PASS / WARN / FAIL):');
    lines.push('  color is never the only signal');
    lines.push('  Diagnostics are rustc-shaped: `error[code]: message`, `--> path:LL:CC`,');
    lines.push('  `= help:` for the runnable fix, `= note:` for the authority');
    lines.push('  Machine surface: JSON keys, ids (C1…C7, REQ-<AREA>-<NNN>), ruleIds and the commands');
    lines.push('  inside a fix stay English and are never localized by --lang');
    lines.push('  = help: `steelforge help exit-codes` · `steelforge doctor --json`');
    lines.push('');
    return lines.join('\n');
};
export const HELP_TOPICS = {
    'exit-codes': { title: 'exit-codes', render: () => `\n${formatHeading('EXIT CODES — the contract')}\n\n${EXIT_CODES_BODY}\n` },
    rigor: { title: 'rigor', render: RIGOR_USAGE },
    formatting: { title: 'formatting', render: FORMATTING_USAGE },
};
export const renderHelpTopic = (topic) => HELP_TOPICS[topic]?.render();
/** Explicar un código de gate sin red: la misma tabla que lee `gates list`. */
export const renderExplain = (code) => {
    const id = code.trim().toUpperCase();
    const gate = getExecutableGate(id);
    if (!gate) {
        return {
            ok: false,
            text: `error[usage]: unknown gate code \`${code}\``,
            suggestions: suggestCommands(id, EXECUTABLE_CHAIN.map((entry) => entry.id)),
        };
    }
    const lines = [
        '',
        formatHeading(`${gate.id} · ${gate.nameEn}`),
        `  ${gate.name}`,
        `  posture: ${gate.posture}${gate.inspects ? '' : ' · inspects nothing (reported vacant)'}${gate.requiresModel ? ' · requires a model backend' : ''}`,
        `  imposes: ${gate.imposes.join(', ')}`,
        gate.implemented === false ? '  state: declared but NOT implemented (counted, not executed)' : '',
        `  what it checks: ${gate.description}`,
        `  reference command: ${gate.command}`,
        `  = help: \`steelforge gates list\` · \`steelforge gates run\``,
        '',
    ].filter((line) => line.length > 0);
    return { ok: true, text: lines.join('\n'), suggestions: [] };
};
// ---------------------------------------------------------------------------------------------
// El comando `help`
// ---------------------------------------------------------------------------------------------
const usageErrorLines = (message, suggestions, helpCommand) => {
    const lines = [colors.red(`error[usage]: ${message}`)];
    for (const suggestion of suggestions) {
        lines.push(`  = help: did you mean \`${suggestion}\`? Run \`${helpCommand} ${suggestion}\``);
    }
    lines.push('  = help: run `steelforge --help` to list every command, or `steelforge help exit-codes`');
    return lines;
};
export const handleHelpCommand = async (argv, io) => {
    const topic = argv.find((arg) => !arg.startsWith('-'))?.toLowerCase();
    if (!topic) {
        io.log(argv.includes('--all') ? renderFullHelp() : renderEssentialHelp());
        return EXIT.PASSED;
    }
    const topicText = renderHelpTopic(topic);
    if (topicText) {
        io.log(topicText);
        return EXIT.PASSED;
    }
    const commandHelp = renderCommandHelp(topic);
    if (commandHelp) {
        io.log(commandHelp);
        return EXIT.PASSED;
    }
    for (const line of usageErrorLines(`unknown help topic \`${topic}\``, suggestCommands(topic, [...KNOWN_COMMANDS]), 'steelforge help')) {
        io.error(line);
    }
    return EXIT.USAGE;
};
