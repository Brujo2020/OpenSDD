# Requirements — playbooks-v3-7

**Objective:** Close the ten weaknesses found in the v3.6.0 review: approvals must come from a verifiable
person, improvement must not reward removing controls, the planner must scale with the intent, multi-unit
work must fan out into units and waves, the cycle must learn without being asked, and people must see
and decide comfortably.

**Out of scope:** a model backend; cryptographic signing infrastructure beyond git identity; hosted UI.

## A · Human in the loop

### REQ-V37-001 — Verifiable approver
- Statement: WHEN `hil answer` records an answer, the [CLI] shall store the git identity (`user.name`, `user.email`) alongside `--by`.
- Statement: WHERE `.sdd/settings/approvers.json` lists approvers, the [CLI] shall refuse an answer whose `--by` or git email is not listed.
- Statement: WHEN an agent session is detected (`OPEN_SDD_AGENT=1`, `CLAUDECODE=1` or no TTY) and the effect approves, overrides or accepts as is, the [CLI] shall refuse the answer unless `--confirm <card-id>` repeats the card id.

### REQ-V37-002 — Deadlines are applied
- Statement: WHEN `next` runs and an unanswered card is past `createdAt + deadlineHours`, the [engine] shall record the card default as the answer with `by: "deadline"` and audit `DEADLINE_APPLIED`.
- Statement: The [CLI] shall list overdue cards with `hil list <feature> --overdue`.

### REQ-V37-003 — A card can be reviewed as a page
- Statement: The [CLI] shall write, with `hil review <feature> --html [--out f]`, one self-contained HTML page (no script, no network) with every open card, its options, consequences, evidence, the reviewed artifact diff when present, and the exact answer command.

## B · Continuous improvement

### REQ-V37-004 — Removing a control is never free
- Statement: WHEN a probe removes a step, the [improver] shall count every rejection that step caught as `unobservedRisk` and shall treat an increase as a degradation.
- Statement: The [improver] shall drop a candidate that removes a `review: human` step or a security check, with evidence `dropped -> … -> removes a human/security control`.

### REQ-V37-005 — Learning without being asked
- Statement: WHEN `report` is refused by a gate, the [engine] shall capture a `gate-block` inbox item with the step and the codes.
- Statement: WHEN `review freeze-check` finds a frozen file changed, the [CLI] shall capture a `human-edit` inbox item.

### REQ-V37-006 — Cost and time per step
- Statement: The [report command] shall accept `--tokens <n>`, `--model <id>` and `--duration <s>` and store them in the audit event.
- Statement: The [engine status] shall show, per step, the elapsed time between `started` and the last terminal event and the reported tokens, and `--json` shall include them.

## C · Planning

### REQ-V37-007 — Scale and risk from the intent
- Statement: The [planner] shall derive `scale` (number of services, repositories, units or features named in the intent) and `risk` tags (payments, auth, pii, migration, infra, data) with the matched words as evidence.
- Statement: WHEN scale ≥ 2 services or repositories, the [planner] shall choose `multi-unit`; WHEN ≥ 3 features are listed, `multi-feature`.
- Statement: WHEN a risk tag is present, the [planner] shall mark the design-type steps `review: human` and report the reason.

## D · Multi-unit

### REQ-V37-008 — Units fan out into waves
- Statement: The [CLI] shall start a run with `engine start <feature> --playbook p --units a,b[:dep]…` (or units from the profile) storing units and their dependencies.
- Statement: The [engine] shall compute waves with `topologicalWaves`, refuse a cycle, and show units and waves in `engine status`.
- Statement: The [engine] shall serialize state writes with a lock file and refuse a concurrent writer after 5 s.

## E · Experience

### REQ-V37-009 — Visibility
- Statement: `next` without `--json` shall print one human sentence and the suggested command.
- Statement: `engine list` shall list every run with playbook, progress and parked state.
- Statement: `engine status --mermaid` shall emit a flowchart of phases and steps coloured by status.
- Statement: `next --auto-handoff` shall write a missing handoff pack and return the following directive.

### REQ-V37-010 — Playbook authoring
- Statement: The [repository] shall ship `templates/playbooks/playbook.schema.json` (JSON Schema draft 2020-12) and the checker shall accept a `$schema` key.
- Statement: `playbook new <name> --from <base> [--add <phase>:<use>] [--skip <id>]` shall write a checked playbook.
- Statement: `playbook diff <a> <b>` shall list steps added, removed and changed in decision or review.
- Statement: The library shall include `poc-to-feature` and `brownfield-aidlc-inception` recipes that pass the checker.

## Acceptance criteria

| AC | REQ | Observable |
|---|---|---|
| AC-01 | 001 | Answer stores git identity; unlisted approver exits 1; agent approval without `--confirm` exits 1. |
| AC-02 | 002 | Card past deadline → `next` records default, audit has `DEADLINE_APPLIED`; `--overdue` lists it before. |
| AC-03 | 003 | `hil review --html` contains the question, every option and the answer command; no `<script`. |
| AC-04 | 004 | Removing a step that caught a rejection is `dropped`; removing a human step is `dropped`. |
| AC-05 | 005 | A refused report adds a `gate-block` inbox item; a frozen edit adds `human-edit`. |
| AC-06 | 006 | `--tokens 1200` appears in `engine status --json` for that step. |
| AC-07 | 007 | "migrate billing to 3 microservices across api and web repos" → `multi-unit`; "payments" → a human design gate with reason. |
| AC-08 | 008 | `--units api,web:api` → waves `[[api],[web]]`; a cycle exits 1; a held lock refuses a write. |
| AC-09 | 009 | `next` human text has no `{`; `engine list` shows the run; `--mermaid` starts with `flowchart`; `--auto-handoff` returns `run-step`. |
| AC-10 | 010 | Schema file parses; `playbook new` output passes `check`; `diff` lists an added step; both recipes pass. |
