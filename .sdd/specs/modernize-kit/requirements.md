# Requirements — modernize-kit

**Objective:** One entry point that scales ceremony with the work — from a typo or a throwaway PoC to the
modernization of a banking portfolio — where strategy is decided by a deterministic engine (no model),
agents only propose, and named people decide. Unplanned events (a security patch on go-live day) reshape
the running workflow by rule, and the system learns from them with evidence.

**Sources adopted (method):** AWS Prescriptive Guidance — the 7 Rs migration strategies and their use
cases; for large migrations, rehost/replatform first and modernize after; pilot wave. AWS AI-DLC —
inception/construction/operations, units of work, short cycles, "AI proposes, humans make the critical
decisions". Harness² — a single run is confounded; evidence before adoption.

**Design rule:** deterministic core decides · agent proposes (validated, may only raise risk) · named person authorizes.

**Out of scope:** a model backend; executing deployments or patches; vendor tooling (MGN, App2Container).

## A · Level ladder

### REQ-MK-001 — Classify the level of the work
- Statement: The [classifier] shall assign one level L0 tiny, L1 PoC, L2 feature, L3 small project,
  L4 medium, L5 large/multi-unit, L6 modernization to an intent and profile, with the matched evidence.
- Statement: WHEN a risk tag (payments, auth, pii, migration, infra, data) is present, the [classifier]
  shall raise L0 to L2, and shall raise L1 to L2 when the tag is `pii`.
- Statement: The [classifier] shall never assign a lower level to an intent with an added risk or scale word.

### REQ-MK-002 — One command to start
- Statement: `open-sdd start "<intent>" [--feature f] [--level Lx] [--dry-run]` shall pick the playbook of the
  level, start the run and print the first directive in human form.
- Statement: The [run] shall carry a ceremony: `minimal` for L0–L1 (no handoff pack, no recall gate),
  `standard` for L2–L4, `strict` for L5–L6 (an approval needs `.sdd/settings/approvers.json`).

## B · Dynamic workflows without a model

### REQ-MK-003 — Deterministic rules over events
- Statement: The [rule engine] shall evaluate rules `{id, on, when, priority, actions}` from the shipped
  defaults and `.sdd/settings/dynamic-rules.json` against an event, per affected component, in
  priority-then-id order, and shall return the same decision and digest for the same inputs.
- Statement: The [rule engine] shall reject an event or rule that fails its schema, and a rule action
  that names an unknown step type.
- Statement: Actions shall be `insert-steps`, `patch-both`, `freeze`, `require-hil`, `set-deadline` and `raise-level`.

### REQ-MK-004 — Events reshape the running workflow
- Statement: WHEN an event is applied to a run, the [engine] shall insert the decided steps before the
  next pending step, freeze the decided components, prepare valid HIL cards, record the decision, and
  treat a repeated event id as a no-op.
- Statement: WHEN every step inserted by an event is done or skipped, `resolve` shall unfreeze its
  components and record `EVENT_RESOLVED`.

### REQ-MK-005 — Agent proposals are inputs, never verdicts
- Statement: The [validator] shall reject a proposal that names an unknown component, lacks evidence,
  or lowers the event severity, exploitation or CVSS; an admitted proposal shall re-evaluate the rules.

## C · Modernize Kit

### REQ-MK-006 — Portfolio and 7 Rs
- Statement: The [assessor] shall validate `.sdd/modernize/portfolio.json`, compute a risk score per component,
  and decide one of retire, retain, rehost, relocate, repurchase, replatform, refactor by an ordered,
  documented decision table, returning the rule id and the reason.
- Statement: WHEN the migrating portfolio has 10 or more components and business demand is not `high`,
  the [assessor] shall prefer replatform over refactor and say why.
- Statement: A named override shall be recorded and win over the table.

### REQ-MK-007 — Wave plan
- Statement: The [wave planner] shall order migrating components after their migrating dependencies,
  start with a single low-risk pilot that is neither regulated nor criticality ≥ 4, put at most one
  criticality-5 component and at most `max` components per wave, retire components without active
  dependents first, and leave retained components out with their hybrid dependencies listed.

### REQ-MK-008 — Strangler lifecycle and cutover
- Statement: The [lifecycle] shall advance a component only along the stages of its disposition, refuse
  forward moves of a frozen component, and decide canary steps from metrics: `rollback` beyond twice the
  error budget or ten times the mismatch threshold, `hold` when a criterion or the sample size is unmet,
  else `advance`.
- Statement: Cut-over of a regulated or criticality ≥ 4 component and every decommission shall require an
  approved HIL card; decommission cards are `irreversible-damage` and default to park.

### REQ-MK-009 — Learning from events
- Statement: `learn` shall turn a resolved event into a reflection draft (confounded while fewer than two
  resolved events of that type exist) and a rule candidate; adopting a candidate shall need a named,
  confirmed person and shall append it to `.sdd/settings/dynamic-rules.json`.

### REQ-MK-010 — Visibility and assistant
- Statement: `modernize status` shall show components, dispositions, stages, freezes, waves and events, as
  text, JSON, Mermaid and one offline HTML page.
- Statement: The [repository] shall ship an `sdd-modernize` skill in every skills tree.

## Acceptance criteria

| AC | REQ | Observable |
|---|---|---|
| AC-01 | 001 | ≥ 25 intents classify to their expected level; risk/scale additions never lower it. |
| AC-02 | 002 | `start "fix typo in README"` reaches `done` in 3 commands without a pack; strict run refuses approval without approvers. |
| AC-03 | 003 | Same event twice → same digest; priority order respected; bad rule/event rejected. |
| AC-04 | 004 | Event inserts steps first in `next`, freezes, prepares a card; repeat is a no-op; resolve unfreezes. |
| AC-05 | 005 | Unknown component, no evidence and lowering severity are rejected; raising exploitation adds steps. |
| AC-06 | 006 | Each 7R rule fires on its fixture; large portfolio prefers replatform; override wins. |
| AC-07 | 007 | Pilot is low risk; deps ordered; ≤1 crit-5 per wave; retire first; retained listed with hybrid deps. |
| AC-08 | 008 | Canary decisions per thresholds; frozen component cannot advance; decommission needs approved card. |
| AC-09 | 009 | First event lesson quarantined; second admitted; adopting a candidate needs `--by` + `--confirm`. |
| AC-10 | 010 | Status JSON/Mermaid/HTML render the banking scenario; skill present in every tree. |
| AC-11 | all | Banking go-live scenario with an unplanned critical CVE runs end to end. |
