# Plan — variants-reverse
_Constitution: C-STACK-FACT, C-API-COMPAT, C-BOUNDARIES, C-REGRESSION-ORACLE_
- `core/levels.ts`: `variantOf`, variant-aware `playbookFor`, reverse words.
- `core/reverse.ts` (new): inventory, parsers (architecture, characterization map, rules), stage evaluation, confirm.
- `core/engine.ts`: reverse stage gate in `gateGuards`. `core/playbook.ts`: `opensdd:reverse/*` step types.
- `cli/commands/reverse.ts`: `reverse init|status|next|confirm`; `start --variant`; help.
- Playbooks: poc-brownfield, project-brownfield, multi-feature-brownfield, multi-unit-greenfield, reverse-engineering.

## Decisions recorded during implementation
- **D-1** Scope grew by user request mid-session (rigor ladder, assistants, where); recorded as REQ-VR-005…009 and task 4, not folded into earlier requirements.
- **D-2** `core/assistants.ts` already existed (on-demand hints inside commands); the new guided assistants live in `core/guidedAssistants.ts` and `assist` reuses `brownfield specify|requirements|constitution` instead of duplicating them.
- **D-3** EARS conversion is a new deterministic converter (`earsConvert.ts`) because the existing plain-language path produced invalid English proposals ("The system shall The export should be fast"); every proposal is re-validated by `ears.ts`.
- **D-4** Rigor overlay skips steps the variant already has in any phase (found by the combinatorial test: duplicate `waves` in multi-unit).
