# Plan — playbooks-v3-7

_Constitution: C-STACK-FACT, C-API-COMPAT, C-BOUNDARIES, C-REGRESSION-ORACLE_

- No new dependencies (C-STACK-FACT). Existing commands keep their forms (C-API-COMPAT): every change is
  a new flag or subcommand.
- `core/hilIdentity.ts` (new): git identity, approvers list, agent-session detection.
- `core/hilCards.ts`: `recordAnswer` takes identity options; `overdueCards`; `renderReviewHtml`.
- `core/engine.ts`: lock, units/waves in state, deadline application in `nextDirective`, gate-block capture,
  telemetry fields in audit, `listRuns`, `runMermaid`.
- `core/playbookImprove.ts`: `unobservedRisk` metric, human/security guard.
- `core/playbookPlanner.ts`: `intentSignals` (scale, risk) feeding type choice and review marks.
- `core/playbook.ts`: accept `$schema`; `diffPlaybooks`.
- `cli/commands/playbook.ts`: new flags and subcommands; `help.ts` entries.
- Templates: `playbook.schema.json`, two recipes.

## Decisions recorded during implementation (2026-10-23)

- **D-1** MCP `open_sdd_report` accepts `tokens`/`model` so MCP hosts report telemetry too (task 3 boundary widened).
- **D-2** The `sdd-playbook` skill tells agents never to pass `--confirm` and to use `--auto-handoff` (task 6 boundary widened to the skill trees).
- **D-3** Agent detection treats "no TTY" as an agent session; a person in a non-interactive shell sets `OPEN_SDD_HUMAN=1`. This is a speed bump, not authentication: git identity and `approvers.json` are the record.
