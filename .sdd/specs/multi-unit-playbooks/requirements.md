# Requirements — multi-unit-playbooks

**Objective:** One self-improving cycle — plan, run, check, decide, learn, improve — that tailors an
SDD flow to each case on demand, runs it from any agent host, keeps every verdict deterministic, asks
humans only prepared questions, and learns only from evidence.

**Sources adopted (method, not code):**
- AWS AI-DLC Workflows 2.0 (`awslabs/aidlc-workflows`, v2.7.x, MIT-0): engine/conductor split with
  typed directives, strict stage contracts, units of work, approval ladder, question files, learning
  ritual, hash-bound review receipts, stateless wave referee.
- Google Research Harness² (`google-research/harness2`, arXiv 2610.14224, Apache-2.0): harness as an
  editable file tree, invariant vs domain edits, propose–probe–compose, KEEP_BASE, evidence-gated
  lessons with a `confounded` default, oracle-leak and injection guards.
- open-sdd (this repository): gates C1–C7, EARS coach, constitution, delta specs, waves, context pack,
  memory pipeline model, HIL thresholds, audit bundle.

**Design rule:** the deterministic core decides, a model may propose, a named person authorizes.

**Out of scope:** a model backend inside open-sdd; running the AI-DLC engine; automatic adoption of
any change to gates, constitution or playbooks; editing AI-DLC `core/`.

## Glossary

- **Project profile:** deterministic fingerprint of a workspace and an intent, each signal with its source.
- **Playbook:** `.sdd/playbooks/<name>.playbook.yaml`; phases of steps, each step a registered step type.
- **Step type:** an open-sdd flow, module, skill, command or gate, or an AI-DLC stage slug, declared with
  `consumes` and `produces`.
- **Directive:** one JSON object the engine emits to tell any host what to do next.
- **Lead:** the tool owning the workflow cursor (`opensdd` or `aidlc`).
- **Lesson:** a promoted memory item `{cue, lesson, evidence, confidence, kind: invariant|domain}`.

## A · Plan

### REQ-PB-001 — Multi-unit project type
- Statement: The [project types] shall include `multi-unit`: work spanning two or more units of work
  or two or more repositories.
- Statement: WHEN `open-sdd modes --projects` is run, the [modes command] shall list `multi-unit` with
  its level, terrain, recommended playbook and skills to avoid.

### REQ-PB-002 — Profile computed, not guessed
- Statement: WHEN `open-sdd playbook profile` is run, the [profile detector] shall print each signal
  with its value and its source file or command.
- Statement: If a signal cannot be determined, then the [profile detector] shall report it `unknown`
  with the one question that resolves it.

### REQ-PB-003 — Playbooks are validated data
- Statement: The [playbook checker] shall accept only steps whose type is registered, and shall resolve
  `extends`, `add`, `skip` and `when` before checking.
- Statement: If a skipped or removed step leaves a later required input without its producer in the
  plan, then the [playbook checker] shall exit 1 naming both steps and the artifact.
- Statement: If a playbook declares a frontmatter key outside the schema, then the [playbook checker]
  shall exit 1 naming the key.

### REQ-PB-004 — Planner proposes the minimum sufficient playbook
- Statement: WHEN `open-sdd playbook plan "<intent>"` is run, the [planner] shall print one playbook with
  EXECUTE or SKIP, a reason and evidence for each step, and the counts of steps and human gates.
- Statement: The [planner] shall score intent ambiguity, structural uncertainty, verification entropy,
  risk and unresolved assumptions in bands LOW (<0.30), MED (<0.70) and HIGH, from profile signals or
  from human answers, and shall label any composite score as uncalibrated.
- Statement: WHEN a library playbook differs from the proposal by two steps or fewer, the [planner]
  shall propose that library playbook unchanged and name it.
- Statement: WHEN the same intent and workspace are planned twice, the [planner] shall produce
  byte-identical output, and WHILE `--write` is absent it shall write nothing.

### REQ-PB-005 — Customisation in plain language
- Statement: The [skills tree] shall ship `sdd-playbook`, which turns a request into an `add` or `skip`
  customization, runs `playbook check` and shows the diff.
- Statement: If the checker rejects a customization, then the [sdd-playbook skill] shall show the
  checker message and leave the playbook unchanged.

## B · Run

### REQ-PB-006 — One directive contract for every host
- Statement: WHEN `open-sdd next --json` is run, the [engine] shall emit exactly one directive of a
  declared kind (`run-step`, `ask`, `present-gate`, `handoff`, `parked`, `done`, `error`) validated
  against its schema, and shall change no state.
- Statement: WHEN `open-sdd report --step <id> --result <result>` is run, the [engine] shall apply the
  transition atomically and append one audit event.
- Statement: The [CLI, the MCP server and every shipped skill] shall drive the workflow only through
  `next` and `report`.
- Statement: If a directive fails schema validation, then the [engine] shall exit non-zero and print nothing else.

### REQ-PB-007 — Units of work run in verified waves
- Statement: The [engine] shall compute waves as topological levels of the unit dependency graph and
  shall refuse a cyclic or malformed graph with exit 1.
- Statement: WHEN a wave is finalized, the [wave referee] shall re-run the project's own check command
  on every unit that claims completion and merge only if each exits 0.
- Statement: If a protected test file differs from the wave's baseline, then the [wave referee] shall
  refuse the merge and name the file.
- Statement: WHEN a unit fails, the [engine] shall keep completed sibling units and stop for a human decision.

### REQ-PB-008 — Bounded handoff that is not lost in the middle
- Statement: WHEN a step completes, the [handoff writer] shall write `.sdd/handoff/<feature>/<step>.json`
  and `HANDOFF.md` containing only the artifacts the next step consumes, each with path, sha256 and a
  summary of at most 40 lines, within the playbook budget (default 8 000 tokens).
- Statement: The [handoff writer] shall place goal, acceptance ids and principles in force at both the
  start and the end of the pack, and list by path every item omitted for budget.
- Statement: WHEN a step starts, the [step contract] shall require the agent to restate goal and
  acceptance ids, and the [handoff checker] shall block the gate with `RECALL_MISMATCH` on any difference.
- Statement: WHEN a step resumes, the [handoff reader] shall report each consumed file whose sha256
  changed as `stale`, and shall mark every completed step that consumed it as `stale`.

## C · Check

### REQ-PB-009 — Gates bind to artifacts and to a reviewed source
- Statement: If a step's declared `produces` are missing, then the [engine] shall refuse `approved`.
- Statement: WHEN a review completes, the [review recorder] shall store a receipt with the sha256 of each
  reviewed artifact and of the source manifest, and pin the receipt digest in the audit log.
- Statement: WHILE a fresh receipt covers an artifact, the [pre-commit gate] shall refuse changes to it.
- Statement: If source files change after the receipt and outside its manifest, then the [engine] shall
  mark the receipt `stale` and refuse completion.

### REQ-PB-010 — Phase boundaries are enforced, not narrated
- Statement: WHEN the workflow crosses a phase boundary, the [traceability gate] shall verify the chain
  intent → requirements → design → units → code → tests and exit 1 on any orphan or missing link.

### REQ-PB-011 — AI-DLC interoperability
- Statement: The [repository] shall contain an AI-DLC plugin `opensdd` whose gate-fired sensors run the
  EARS, constitution, boundary and C1–C3 checks, prefix every artifact with `opensdd-`, and return a
  failure verdict when the open-sdd CLI is absent.
- Statement: The [importer] shall map an AI-DLC intent record into one open-sdd spec per unit of work,
  skip with a reason every artifact without a triad role, and never overwrite a file.
- Statement: WHERE a playbook declares `lead: aidlc`, the [status command] shall report the AI-DLC stage
  checkboxes read-only, and `playbook build --target aidlc` shall emit stage membership only through `scopes:`.

## D · Decide (human in the loop)

### REQ-PB-012 — Every human question is prepared
- Statement: WHEN an escalation trigger in `hitl.ts` fires or a step marked `review: human` is reached,
  the [HIL preparer] shall write `.sdd/hil/<feature>/<id>.md` before stopping.
- Statement: The [decision card] shall contain one question, two to four options each with its
  consequence, a recommendation with evidence lines in the form `<verdict> -> <change> -> <evidence with counts>`,
  the diff under review, and the action taken without an answer.
- Statement: If a card lacks evidence lines, then the [HIL gate] shall refuse to present it.
- Statement: WHEN alternatives produced by agents are compared, the [HIL preparer] shall label them with
  ids shuffled by a seed derived from feature and step.

### REQ-PB-013 — Answers are files, approvals need a present human
- Statement: The [question file] shall use options A–E plus `X. Other`, and `[Answer]:` tags.
- Statement: If any `[Answer]:` tag is empty, then the [question checker] shall exit 1 listing the tags.
- Statement: WHEN answers are confirmed, the [question checker] shall record the sha256 of the file, and
  the [engine] shall refuse a later artifact not stamped with that confirmation id.
- Statement: The [engine] shall accept `approved` only from `open-sdd hil answer … --by "<name>"`.
- Statement: WHEN a gate has been revised three times, the [engine] shall add the option `accept-as-is`,
  which records the open findings and continues.
- Statement: The [engine] shall record an override of a blocking gate as a separate named decision, and
  shall refuse it in autonomous mode.

## E · Learn

### REQ-PB-014 — Capture with provenance, admit by rule
- Statement: WHEN a gate blocks, a human answers, a human edits an artifact at a gate, or `RECALL_MISMATCH`
  occurs, the [memory capture] shall append an item with origin, author, time and sha256 to `.sdd/memory/inbox/`.
- Statement: The [reflector] shall write per changed component one row with verdict `helped`, `hurt`,
  `no-effect` or `confounded`, defaulting to `confounded` when more than one component changed or one run
  supports the difference.
- Statement: The [reflector] shall write at most one lesson `{cue, lesson, evidence, confidence, kind}`
  per run, or `NO_ENTRY`.
- Statement: If a lesson has an empty field, cites only `confounded` rows, references unknown evidence,
  or contains a secret or grader text, then the [admission gate] shall keep it in quarantine.
- Statement: If a lesson of kind `invariant` edits a domain path, or a `domain` lesson edits process
  files, then the [admission gate] shall reject it.

### REQ-PB-015 — Promotion, injection and withdrawal
- Statement: WHEN `open-sdd memory promote <id> --by "<name>"` is run, the [memory store] shall move the
  lesson to `.sdd/memory/lessons/`, regenerate `INDEX.md` and record the promoter.
- Statement: The [handoff writer] shall inject at most 5 promoted lessons matching the step type and the
  profile, created before the current run, each labelled as a hypothesis to re-verify.
- Statement: WHEN `open-sdd memory withdraw --origin <id>` is run, the [memory store] shall withdraw every
  lesson derived from that origin.
- Statement: The [memory store] shall merge lessons with the same cue and step type into one entry that
  keeps all evidence ids.

## F · Improve

### REQ-PB-016 — Escalations tune themselves by proposal
- Statement: WHEN a trigger's share of escalations answered with the recommendation and no change
  exceeds `maxUselessEscalationRate` over at least 10 decisions, the [HIL tuner] shall propose a threshold
  change with its evidence as a playbook customization.

### REQ-PB-017 — Propose, probe, compose, keep base
- Statement: WHEN `open-sdd playbook improve <playbook> --k <n>` is run, the [improver] shall take `n`
  candidate customizations from promoted lessons, HIL statistics and threshold proposals.
- Statement: The [improver] shall probe each candidate by `playbook check` and by replaying recorded run
  evidence, reporting gates passed, rework, escalations and useless-escalation share.
- Statement: The [improver] shall compose only changes that improve at least one metric and degrade none,
  shall output `KEEP_BASE` when none qualifies, and shall write one evidence line per decision.
- Statement: The [improver] shall count probes and stop at the playbook budget.
- Statement: The [improver] shall leave the playbook unchanged until `playbook save --by "<name>"` is run.

## G · Build for any host

### REQ-PB-018 — One playbook, every host
- Statement: WHEN `open-sdd playbook build <p> --target <host>` is run, the [builder] shall emit the
  host's native form from the same playbook: skills for each registered skills host, prompt templates,
  MCP tool descriptions, or an AI-DLC scope.
- Statement: The [builder] shall keep the always-on text within the budget declared per host and move
  procedure into on-demand skills and commands.

## Acceptance criteria (observable)

| ID | Requirement | Evidence |
|---|---|---|
| AC-01 | 001 | `modes --projects --json` contains `multi-unit`. |
| AC-02 | 002 | Two-repo fixture: `playbook profile` prints `repos=2` with its source. |
| AC-03 | 003 | Fixture skipping `units-generation` while `delivery-planning` consumes it exits 1. |
| AC-04 | 004 | `playbook plan` twice: identical stdout; without `--write` the tree is unchanged. |
| AC-05 | 006 | Every directive kind validates; a forged key exits non-zero; `report` appends one event. |
| AC-06 | 007 | A unit claiming done whose check fails is not merged; editing a protected test blocks the merge. |
| AC-07 | 008 | Goal and acceptance ids appear in the first and last 10% of a pack; wrong restatement → `RECALL_MISMATCH`; edited input → `stale`. |
| AC-08 | 009 | Approve with a missing `produces` exits 1; editing a reviewed artifact is refused by pre-commit. |
| AC-09 | 010 | Fixture with an orphan requirement fails the phase gate. |
| AC-10 | 011 | Plugin passes the AI-DLC validator; two-unit intent imports as two specs; second import all-skip. |
| AC-11 | 012 | Each trigger fixture yields a card with 1 question, 2–4 options, evidence lines; a card without evidence is refused. |
| AC-12 | 013 | Empty `[Answer]:` exits 1; revision 3 offers `accept-as-is`; autonomous override exits 1. |
| AC-13 | 014 | A lesson citing only `confounded` rows stays in quarantine; `NO_ENTRY` is accepted. |
| AC-14 | 015 | Unpromoted lessons never reach a pack; `withdraw --origin` removes derived lessons. |
| AC-15 | 016 | 10 "recommended, no change" decisions → one proposal; thresholds unchanged. |
| AC-16 | 017 | `improve --k 3` prints 3 candidates with metrics and a composition or `KEEP_BASE`; playbook hash unchanged. |
| AC-17 | 018 | One playbook builds for every registered skills host and for MCP; always-on budget respected. |

AC-10 requires the AI-DLC runtime and checkout; when absent it is reported as not run.
