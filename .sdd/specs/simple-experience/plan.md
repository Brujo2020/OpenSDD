# Plan — simple-experience

## Design
A thin layer, no new engine: the verbs are routes onto existing handlers.

| Verb | Route | Decides alone |
|---|---|---|
| `open-sdd` | existing score door (`runScoreDoor`) | the ONE next action |
| `setup` | `handleInitCommand` (alias of `init`) | agent and terrain detection already in `init` |
| `start` | existing `handleStartCommand` | level, variant, rigor, playbook (floor never lowered) |
| `check` | `handleGatesCommand(['run', …])` | one verdict; detail only on failure |
| `decide` | new `handleDecideCommand` over `listCards` / `listRuns` / `handleHilCommand` | nothing: it only surfaces human decisions |

- `help.ts`: `CommandDoc.essential` is not needed; a fixed `ESSENTIAL` list renders `renderEssentialHelp()`;
  `renderFullHelp()` stays and is reached by `help --all` / `--help --all`.
- `index.ts`: dispatch `setup`, `check`, `decide`; `runsGateChain` includes `check`.

## Files
`tools/open-sdd/src/cli/commands/help.ts`, `tools/open-sdd/src/cli/commands/decide.ts`,
`tools/open-sdd/src/index.ts`, `tools/open-sdd/test/simpleExperience.test.ts`, docs and templates.

## Validation
`test/simpleExperience.test.ts` covers AC-01…AC-05; full suite green; claims 0 broken; Mermaid blocks
render with `mmdc`.

## Acceptance criteria
- AC-01: `--help` ≤ 40 lines, contains the five verbs and `help --all`; `help --all` contains `brownfield survey`.
- AC-02: `setup --json` output equals `init --json` output in the same directory.
- AC-03: `check` exit code equals `gates run` exit code.
- AC-04: `decide` with no cards prints `Nada que decidir.` exit 0; with an unanswered card it prints its resolve command.
- AC-05: README.md, README.es.md and docs/MANUAL.md contain the five-verb section, ≥ 2 Mermaid diagrams and the colour legend.
