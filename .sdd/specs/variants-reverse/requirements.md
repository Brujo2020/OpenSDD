# Requirements — variants-reverse

**Objective:** Every level has a greenfield and a brownfield variant chosen deterministically from the
workspace and the intent, and existing systems can be reverse engineered in stages — inventory,
architecture, behaviour, business rules, human confirmation, spec baseline — module slice by module
slice, each stage closed only by measurable exit criteria.

## REQ-VR-001 — Variant per level
- Statement: The [classifier] shall choose `greenfield` or `brownfield` from the intent (existing/legacy/current vs new/from scratch) and else from the workspace terrain, and `start --variant` shall override it.
- Statement: The [classifier] shall map each level and variant to a playbook: L1 `spike`|`poc-brownfield`, L2 `base/spec-first`|`brownfield-extension`/`legacy-untested`, L3 `greenfield`|`project-brownfield`, L4 `multi-feature`|`multi-feature-brownfield`, L5 `multi-unit-greenfield`|`multi-unit`; L0 `tiny` and L6 `modernize` for both.

## REQ-VR-002 — Reverse engineering mode
- Statement: WHEN the intent asks to reverse engineer, recover or document an existing system, the [classifier] shall choose the `reverse-engineering` playbook at level ≥ L3.
- Statement: `reverse init [--scope a,b]` shall write `.sdd/reverse/inventory.json` with the modules found (directories holding source files) and `reverse init --scope` again shall add modules without losing existing ones.

## REQ-VR-003 — Stage exit criteria
- Statement: The [reverse engine] shall report stages RE-1 inventory, RE-2 architecture, RE-3 characterization, RE-4 rules, RE-5 confirmation, RE-6 spec baseline, each `done` only when: RE-1 ≥ 1 module; RE-2 every module named in `architecture.md`; RE-3 the share of modules with an existing characterization test ≥ `minCharacterized` (default 0.6) and every critical module covered; RE-4 every module has a rule or a `NONE` line in `rules.md`; RE-5 confirmed share ≥ `minConfirmed` (default 0.8) and no inferred rule on a critical module; RE-6 every confirmed rule id cited in the feature's `requirements.md`.
- Statement: A stage shall not be `done` while an earlier stage is not.
- Statement: The [engine] shall refuse `completed` for a `opensdd:reverse/*` step whose stage is not done, with the unmet criteria.

## REQ-VR-004 — Confirmation by a person
- Statement: `reverse confirm <RULE-ID> --by <name>` shall mark the rule confirmed with name and date, subject to the approver identity rules, and an agent session shall need `--confirm <RULE-ID>`.

## Added during implementation (user requests, 2026-10-23)

## REQ-VR-005 — Rigor ladder per run
- Statement: `start --rigor tiny-spec|spec-first|spec-anchored|spec-as-source` (alias `spec-as-code`) shall compose the steps of the stricter base playbooks onto the variant playbook, never below the level floor (L0–L1 tiny-spec, L2–L4 spec-first, L5–L6 spec-anchored) nor below a declared `.sdd/settings/rigor.json` for L2+, skipping with a reason the steps the variant cannot feed.

## REQ-VR-006 — Discovery by roles
- Statement: `assist discover "<idea>"` shall write role-based questions (analyst, PM, architect, UX, QA, security) chosen by level, variant, UI and risk; `assist brief <f>` shall compose `brief.md` from the answers and lint it; an answer marked `ASSUMPTION` shall block the brief until confirmed.

## REQ-VR-007 — EARS conversion
- Statement: `assist ears "<text>"` shall convert each sentence to one of the five EARS patterns (English or Spanish input), and shall return a question instead of a sentence for a vague response, a missing actor or response, a capability ("can"), or a compound requirement; every proposal shall pass `validateEarsRequirement`.

## REQ-VR-008 — Steering drafts and assistant menu
- Statement: `assist steering` / `steering draft` shall draft product, tech and structure from the workspace with every guess marked `(inferred)` and every unknown as `[NEEDS CLARIFICATION]`, never overwriting without `--force`; `assist` without arguments shall recommend assistants from the repository state.

## REQ-VR-009 — Where are we
- Statement: `where [feature]` shall show per run the current phase and step, progress by count and by step cost, pending steps, open cards and events; `--line` one line; `--save` a resumable `.sdd/state/checkpoint.md` and `.json`.

## Acceptance criteria
| AC | REQ | Observable |
|---|---|---|
| AC-01 | 001 | ≥ 12 intent/terrain pairs map to their variant playbook; `--variant` overrides. |
| AC-02 | 002 | "reverse engineer the billing module" → reverse-engineering; init finds modules; re-init with scope adds. |
| AC-03 | 003 | Each stage flips to done exactly when its criterion is met; order enforced; engine refuses early completion. |
| AC-04 | 004 | Confirm needs a listed person and `--confirm` from an agent session; line rewritten deterministically. |
| AC-05 | 005 | All 48 level × variant × rigor combinations (L0–L5) start a checked run; floors applied. |
| AC-06 | 006 | Questions scale with level; brief lints; an assumption blocks. |
| AC-07 | 007 | Seven patterns convert; five unconvertible inputs become questions; no invalid proposal. |
| AC-08 | 008 | Drafts marked inferred; no overwrite; menu by state. |
| AC-09 | 009 | `where` JSON/line/checkpoint reflect the run. |
