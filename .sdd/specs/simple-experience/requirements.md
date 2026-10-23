# Requirements — simple-experience

**Objective:** A user needs five verbs, not 56 commands. `open-sdd` (no arguments), `setup`, `start`,
`check` and `decide` cover the whole lifecycle; every other command keeps working (C-API-COMPAT) but
is listed only by `help --all`. The tool decides what can be decided from evidence (agent, terrain,
level, rigor, playbook) and asks a person only for a human decision.

## REQ-SX-001 — Essential help by default
- Statement: WHEN the user runs `open-sdd --help` or `open-sdd help`, the [console] shall print the five verbs, the install line and the pointer `open-sdd help --all`, in at most 40 lines.
- Statement: WHEN the user runs `open-sdd help --all`, the [console] shall print the full command catalogue as before.
- Statement: The [console] shall keep accepting every existing command and its per-command help (`open-sdd <cmd> --help`).

## REQ-SX-002 — `setup`
- Statement: `open-sdd setup [args]` shall behave exactly as `open-sdd init [args]` (plan only without `--write`).

## REQ-SX-003 — `check`
- Statement: `open-sdd check [args]` shall run the gate chain as `open-sdd gates run [args]` and return its exit code.
- Statement: The [score footer] shall declare the gate component unmeasured for `check`, as it does for `gates run`.

## REQ-SX-004 — `decide`
- Statement: WHEN `decide` runs without arguments, the [console] shall list every unanswered decision card across features and every run step awaiting a human gate without a card, each with the exact command to resolve it, and print `Nada que decidir.` when there is none (exit 0).
- Statement: `decide <feature>` shall list that feature's cards as `hil list <feature>`; `decide <feature> <card> <option> --by "<name>"` shall answer as `hil answer`.

## REQ-SX-005 — Documentation around the five verbs
- Statement: The [README, README.es and MANUAL] shall open with the five verbs, a Mermaid flow of the lifecycle, a diagram of who decides what (engine, agent, person), and a colour legend table (green automatic, amber advisory, red blocking, blue human decision).
- Statement: The [quickstarts and `sdd-help` skill] shall present the five verbs first.

## Out of scope
- Removing or deprecating any existing command or skill.
- Renaming skills.
