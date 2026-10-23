# Plan — modernize-kit

_Constitution: C-STACK-FACT, C-API-COMPAT, C-BOUNDARIES, C-REGRESSION-ORACLE_

- No dependencies added. New commands only (`start`, `modernize`); existing forms unchanged.
- `core/levels.ts`: ladder, classifier (reuses `intentSignals`), playbook and ceremony per level.
- `core/engine.ts`: `level`/`ceremony` in state; minimal skips pack/recall; strict requires approvers;
  `insertSteps` for events.
- `core/dynamicRules.ts`: event/rule schemas, flattening to `evaluateWhen` signals, decision digest, apply.
- `core/modernize/portfolio.ts` (schema, risk), `disposition.ts` (7 Rs), `wavePlan.ts`, `lifecycle.ts`
  (stages, cutover decision, state file), `proposals.ts`, `learn.ts`, `report.ts` (Mermaid/HTML).
- `cli/commands/modernize.ts`: `start`, `modernize …`; help entries.
- Templates: `playbooks/tiny`, `playbooks/modernize`, `modernize/rules.default.json`,
  `modernize/portfolio.banking.json`; step types `opensdd:modernize/*`; skill `sdd-modernize`.
- Thresholds (SLA hours, canary criteria) are defaults in the rules file, labelled as policy to set — not regulation.

## Decisions recorded during implementation (2026-10-23)

- **D-1** Strict ceremony is enforced in `recordAnswer` (`requireApprovers`), so task 1 also touches `hilCards.ts`.
- **D-2** Found while testing the banking scenario: `--by` could name a listed approver from someone else's git identity. `approverAllowed` now requires the listed entry's email to match the shell's git email (`hilIdentity.ts`).
- **D-3** Modernize artifacts (assessment, dispositions, wave plan) resolve through `handoff.ts` so the engine's artifact guard checks them like triad files.
- **D-4** Event idempotency is on the event content, not on the decision digest: after the first application the context (frozen components) changes, so the digest would differ for the same event.
- **D-5** Lane placement: urgent events go before the next pending step; wave lanes queue after previous wave lanes and before the `wave-execution` program step; inside an urgent lane the order is understand → approve → change → verify, most critical component first.
