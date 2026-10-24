# Why SteelFoundry exists

> Spanish edition: [POR-QUE.md](POR-QUE.md) · Manual: [MANUAL.md](MANUAL.md)

## 1. Why it was born

Coding agents write faster than a team can review, and their "done" is not verifiable: nobody can say
which requirement it meets, who decided it or on what evidence. The existing Spec-Driven Development
toolkits each solve part of the problem:

- some order the phases (requirements → design → tasks) but assume a new project;
- some bring roles and discovery but leave the final call to the model;
- some describe changes to existing code but do not govern who approves;
- almost none scales the ceremony: a typo gets the same process as a migration, or the other way round.

A team that uses several agents and several kinds of work ends up with several toolkits, each with its own
files, vocabulary and idea of "done". SteelFoundry was born to **consolidate the whole range of cases in one
toolkit** (from a PoC to a regulated migration programme), **on any agent and model**, with **a
deterministic engine** that decides what evidence can decide and leaves to a **named person** what is a
human decision.

## 2. What it solves

| Problem | How SteelFoundry solves it | Where |
|---|---|---|
| "Done" without proof | executable gates (C1–C8) and rule-driven validation on every task; exit 1 when missing | `check`, `validation` |
| One process for everything | levels L0–L6 and a rigor ladder decided from the intent and the repository; risk only raises them | `start`, manual §4 |
| The agent decides what is not its call | the engine dictates the next step; approving, ratifying and adopting rules need a person (terminal + git email) | `next`, `decide`, `govern constitution --ratify` |
| Ambiguous requirements the agent fills in by inventing | EARS, requirements coach and clarify; it warns and offers to clarify on the spot | `assist ears`, `requirements review`, `brownfield clarify` |
| Existing code treated as if it were new | delta specs (what changes, not the system), descriptive constitution from the code, regression oracle | `delta`, `brownfield` |
| Nobody knows where it stands | clear status (5 states, stage n/9, what blocks, next command) for people, dashboards and PRs | `flow`, `flow --json/--markdown` |
| It cannot be audited | hash-chained decision log: who, why, on which requirement and principle; attestation of what was delivered | `audit trail`, `attest` |
| Every agent with its own tool | skills, commands and MCP for 25+ hosts; the same `.sdd/` | `integrate`, `mcp` |
| Offers by guesswork | P50/P90 estimate from the tasks and a scope draft (SOW) | `estimate --sow`, `migrate estimate` |

## 3. What value it brings

- **Predictability**: same inputs → same decision (level, playbook, required tests, 7R disposition). You argue about the assumption, not the method.
- **Provable trust**: every "done" carries its evidence; every decision its author and reason; every delivery its attestation.
- **Proportionality**: small stays fast (L0: 2 steps); critical work gets more tests and approvals without manual configuration.
- **Vendor independence**: changing agent or model changes neither the process nor the artifacts.
- **One tool** for discovery, specs, brownfield, migrations, governance, status, audit and estimation.

## 4. What it took from each toolkit, what it became and how it was integrated

| Source | What it took | What it became in SteelFoundry | How it was integrated (and what changed from the original) |
|---|---|---|---|
| **GitHub Spec Kit** | Project constitution; specify → plan → tasks; clarify, analyze, checklist | Constitution with **evidence per principle** and **ratification** by a named person; command templates `specify`, `plan`, `tasks`, `clarify`, `analyze`, `checklist`; rule `REQUIREMENT_NOT_IN_PLAN`; `import spec-kit` | In Spec Kit the constitution is written and governs; here it is **derived from the code** (descriptive) or from a **guided interview** (normative) and does not govern until someone types `RATIFICAR`. The importer copies the constitution verbatim and marks `spec.md` as unvalidated: a mapping, not a promise. |
| **BMAD Method** | Role-based discovery (analyst, PM, architect, UX, QA) before specifying | `assist discover` + `assist brief` + `discovery lint/log` | The roles are **not agents with their own judgement**: the engine picks which roles ask by level, variant and risk (security only with sensitive data). An agent may only answer `ASSUMPTION:`, which blocks the brief until a person confirms it. |
| **Kiro** (practice it popularised) | **EARS** requirements; steering (`product`, `tech`, `structure`); requirements → design → tasks with approval; agent hooks | `assist ears` (5 patterns; converted / needs-confirmation / question), `steering draft/check`, the documentary triad, a Stop hook that runs the gate chain | EARS is **validated** (C1), not only drafted; steering marks guesses `(inferred)` and is not "ready" while anything is unconfirmed; the hook does not trust the agent: it runs the gates. |
| **OpenSpec** | **Delta** specs (ADDED / MODIFIED / REMOVED / RENAMED); archive of closed specs; unique, verifiable task ids | `delta init/validate/merge`, `archive`, rules `TASK_DUPLICATE_ID` and `TASK_WITHOUT_VERIFICATION` | The delta is crossed with the **regression oracle** (`brownfield contracts`: which tests protect each changed file) and with impact analysis; a REMOVED needs a reason and its contracts. |
| **AWS AI-DLC** | Inception / construction stages and sensors in the lifecycle | `aidlc:stage/*` step types and an AI-DLC plugin template with sensors `opensdd-ears`, `opensdd-gates`, `opensdd-steering` | The sensors are deterministic and **fail closed** without the CLI. The template has not been run through the official AI-DLC validator (declared). |
| **AWS Prescriptive Guidance (7 Rs)** | Migration strategies retire / retain / rehost / relocate / repurchase / replatform / refactor | `migrate assess`: an ordered rule table with id and reason per component; waves; strangler lifecycle; `migrate estimate` | The guidance became **executable rules** (first match wins) with a recorded named override; `D-RETAIN-TARGET` was added (what is already cloud/SaaS does not move). |
| **SteelForge IDE** (the author's own tool) | Levels and modes people pick first; tinyspec; EARS → Gherkin; module matrix per level | `modes`, `/sdd-tiny`, `/sdd-promote`, `gherkin`, task-structure checks | Re-implemented in TypeScript on the toolkit's own parsers (`parseTasksMarkdown`, EARS); Gherkin scenarios are traced to each REQ. |
| **INCOSE, ISO/IEC/IEEE 29148, NASA ARM** | Requirement-quality rules (subjective language, unbounded performance adjectives, escape clauses) | Requirements coach (`requirements review/fix`, AMB-001/002/003…) and one vague-term list for C1, EARS and clarify | Every finding carries a remedy or a question; nothing is rewritten by a bulk heuristic. |
| **Karpathy guidelines** | Think before coding, simplicity, surgical changes, goal-driven execution | `karpathy-guidelines` skill in every project; gate C7 | C7 is declared **vacuous** (activation without measurement) and reported as such. |
| **in-toto / SLSA, OpenTelemetry, OWASP LLM01, MCP** | Supply-chain attestation; open telemetry; indirect prompt injection; tool protocol | `attest` (Statement v1 + `--verify`), `audit trail --otlp`, C2 over `specs/` and `steering/`, MCP server with `open_sdd_*` | The same functions back the CLI and MCP; the attestation is not signed by itself (Sigstore is suggested). |

## 5. Why the flows are the way they are

| Design decision | Why |
|---|---|
| **The engine decides; the agent proposes; the person approves** | A model is probabilistic: what must be repeatable (level, next step, gate verdict, required tests) is decided by deterministic code; what is human judgement (approve, ratify, "not affected") cannot be delegated to whoever produced the work. |
| **The intent sets the level and risk only raises it** | Ceremony must be proportional: a typo does not deserve a migration's process, but a "typo" in authentication is not a typo. That a risk word never lowers the level is tested as an invariant. |
| **Constitution before specs, ratified by a person** | A blocking verdict needs a citable authority; if the agent writes it, or it governs unratified, the agent governs itself. |
| **EARS and clarify before design** | An ambiguous requirement reaches the agent as a licence to invent; asking before design keeps the error from multiplying into tasks and code. |
| **In brownfield you specify the change (delta), not the system** | Specifying a whole legacy system is unbounded; the delta keeps the obligation finite and the regression oracle protects what is not touched. |
| **Tasks with `(P)`, `_Boundary:_` and `_Depends:_`** | Parallel work is only safe with disjoint file boundaries; waves turn dependencies into an executable order and the referee refuses a partial merge. |
| **"Done" needs evidence, and rules raise the bar** | Tests go where the risk is (money, personal data, access…), not everywhere equally nor wherever the agent prefers. |
| **Escalate to a person at the 1st critical failure, the 2nd identical one, or after 3** | It stops an agent that "almost" makes it from looping forever and fixes a reproducible human decision point. |
| **Everything lives in repository files and a chained log** | What is versioned in Git outlives any tool; the hash chain makes a later edit detectable. |

## 6. Advantages: what it considers that others do not

- **One toolkit from L0 to L6**, with the ceremony chosen by the engine, not by the user.
- **First-class brownfield**: descriptive constitution from the code, deltas, regression oracle, impact and reuse; staged reverse engineering.
- **Portfolio migrations** with executable 7 Rs, waves, canary, approved cut-over and unplanned events (CVEs, incidents) handled by rules without a model.
- **Test requirements driven by business rules**, auditable and tunable per project.
- **Real people in the loop**: approvers with git email, terminal confirmation, refused attempts recorded.
- **Audit and attestation** that answer who, why, on which requirement and principle.
- **Clear status** for people, dashboards (stable JSON), PRs (Markdown) and agents (MCP).
- **Agentic security**: the security gate looks for instructions aimed at the agent in what the agent reads.
- **Declared honesty**: what is not measured is said (C5 degraded, C7 vacuous, uncalibrated estimates, manual §21).

## 7. Precise scope

**What it is**
- A Node.js CLI (no runtime dependencies), skills and command templates for 25+ agent hosts, and an MCP server.
- It works on repository files (`.sdd/`) and Git; it runs offline and without keys.
- Requires Node ≥ 20 (the TypeScript AI-DLC sensors need Node ≥ 22.6).

**What it does**
- Classifies the work, picks the playbook and dictates the next step.
- Assists discovery, EARS requirements, steering and the constitution, and validates specs, tasks and evidence.
- Governs brownfield (deltas, contracts, impact) and migrations (7 Rs, waves, lifecycle).
- Blocks with gates at commit and PR, records and audits decisions, attests deliveries and estimates.

**What it is not and does not do**
- **It is not an agent and ships no model**: your host's agent does the work; SteelFoundry directs and verifies it.
- **It does not prove identity**: it uses the git email, the approvers list and the terminal; for cryptographic assurance, sign commits and attestations.
- **It does not replace judgement**: validation rules match text and paths; the 7 Rs do not replace an assessment with the owners; EARS does not make a requirement correct.
- **It is not calibrated**: estimates, cost and remaining-time figures use declared factors and say so.
- **It is not a service**: it hosts no dashboards or CI; it produces JSON, Markdown, SARIF and OTLP for yours.
