---
name: sdd-playbook
description: Plan and drive a feature with a tailored open-sdd playbook through the engine contract (next/report). Use when starting a feature that needs a case-specific process (bug, brownfield extension, multi-unit, spike…), or when a run already exists and you need to know what to do next.
---

# sdd-playbook

<background_information>
open-sdd decides the process; the agent executes one step at a time. Every verdict (which step runs, whether a gate passes, whether a step is approved) comes from the CLI, never from this text or from the agent's own judgement. Approvals come only from a named person answering a decision card.
</background_information>

<instructions>
## 1. Plan (once per feature)

1. `open-sdd playbook profile` — read the detected signals; ask the user about any `unknown` that matters.
2. `open-sdd playbook plan "<intent>"` — review the proposed steps, the human gates and the open questions with the user. The composite score is uncalibrated: do not present it as a measurement.
3. If the user agrees: `open-sdd playbook plan "<intent>" --save <name>` then `open-sdd playbook check <name>` (exit 0 required).
4. `open-sdd engine start <feature> --playbook <name>`.

## 2. Loop

Repeat until the directive is `done` or `parked`:

1. `open-sdd next <feature> --json --auto-handoff` and act on `kind`:
   - `handoff` → run the given `command` (writes the bounded context pack).
   - `ask` → put the open questions in `file` to the user; record the answers there; the user confirms with `open-sdd questions confirm <feature> <step> --by "<name>"`.
   - `run-step` → read `pack`; restate the goal and acceptance ids with `open-sdd handoff recall <feature> <step> --text "<restatement>"`; `open-sdd report <feature> --step <step> --result started`; do the step with the skill named in `use`; then report (add `--tokens <n> --model <id>` when known) `completed` (auto review) or `awaiting-approval` (human gate) with `--produced <paths>`.
   - `present-gate` → if `card` is null, write a card JSON (one question, 2–4 options with consequences, evidence lines `kept|revised|dropped -> change -> evidence with counts`, a default that only parks or rejects) and run the `prepare` command. Then STOP and show the card to the user.
   - `parked` → explain `reason` to the user and stop.
2. A refused report lists codes (`RECALL_MISSING`, `ARTIFACT_MISSING`, `QUESTIONS_UNCONFIRMED`, `RECEIPT_STALE`, phase trace errors): fix the cause, do not retry blindly.

## 3. Hard rules

- Never report `approved`; never run `open-sdd hil answer` on the user's behalf, and never add `--confirm` yourself: that flag is the person's typed confirmation.
- Show open cards with `open-sdd hil review <feature> --html`; an unanswered card past its deadline takes its default (park or reject) on the next `next`.
- Never override a gate in autonomous mode.
- Lessons are hypotheses: `open-sdd memory promote` needs a named person (`--by`).
- A reviewed artifact is frozen: after changing it, ask for a new `open-sdd review record`.
</instructions>
