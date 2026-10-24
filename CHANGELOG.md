# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Cierre — 5 mejoras ([docs/REVISION-EXPERTO-3.md](docs/REVISION-EXPERTO-3.md))
- FinOps en `flow`: tokens, modelos, duración y coste (`.sdd/settings/finops.json`), con aviso de presupuesto.
- `audit trail --otlp <file>`: el registro de decisiones como OTLP/JSON para OpenTelemetry.
- MCP: `open_sdd_flow`, `open_sdd_validation`, `open_sdd_audit_trail`.
- `attest <feature> [--write]` / `attest --verify <file>`: atestación in-toto v1 de lo entregado.
- `flow --markdown` y la GitHub Action publica el estado en el resumen del job (Node 22).

### Assurance: validación por reglas, flujo y auditoría de decisiones
- **Ratificar la constitución exige teclear `RATIFICAR` en la terminal.** Antes se muestran el objetivo, el alcance (principios), quién y dónde queda registrado; sin terminal (agente, CI) no se escribe nada y el intento queda como `CONSTITUTION_RATIFY_REFUSED`. Manual §16.1.
- `open-sdd validation <feature> [--record]`: la exigencia de pruebas por tarea la deciden reglas deterministas (dinero, datos personales, autenticación, API pública, latencia, migraciones; las propias en `.sdd/settings/validation-rules.json`, que pueden citar un principio de la constitución). La tarea demuestra cada clase con `[clase]` en su evidencia; una tarea hecha sin una clase bloqueante sale con 1.
- `open-sdd flow [feature] [--json]`: el estado claro primero (SIN EMPEZAR · EN CURSO · ESPERA UNA DECISIÓN · BLOQUEADO · TERMINADO, etapa n/9, tareas, qué lo bloquea y la siguiente orden exacta); después todas las etapas y pasos, decisiones pendientes y métricas (`open-sdd.flow/1`). Sin feature: todas, una línea cada una.
- `open-sdd audit trail [feature]`: quién decidió (persona con email git, agente, regla o sistema), por qué, sobre qué requisitos y principios; filtros `--requirement`, `--principle`, `--actor`, `--who`; `--csv`; sale con 1 si una cadena de hashes está rota.
- Nuevos registros: ratificación de la constitución, revisiones, decisiones HIL con su porqué y su email, intentos rechazados (agente o persona fuera de la lista), eventos con la regla que los disparó.
- La entrevista registra la elección de la persona también en principios que ya existían (fronteras).
- `sdd-impl` (9 agentes): ejecutar `validation --record` y etiquetar la evidencia.
- E2E «Acme Reservas — cobro de reservas» (10 escenarios, dominio ficticio).

### Revisión experta 2 — 10 mejoras ([docs/REVISION-EXPERTO-2.md](docs/REVISION-EXPERTO-2.md))
- Constitución guiada: `open-sdd assist constitution` (y al final de `setup --write`) pregunta de a una con valores por defecto, guarda el borrador y ofrece ratificar con nombre; las decisiones normativas se ratifican sin evidencia del código (las descriptivas la siguen exigiendo); la decisión de fronteras ya no se pierde en proyectos nuevos.
- C2 escanea siempre `specs/` y `steering/` contra inyección dirigida a agentes (`guardrail-bypass`, `self-approval`, `role-header`).
- Un solo vocabulario de términos vagos para C1, el asistente EARS y clarify.
- Siguiente acción: `brownfield clarify` con requisitos no comprobables; `assist constitution` sin constitución.
- Nuevo `open-sdd estimate <feature>` (P50/P90, calendario con paralelismo) y `--sow` (borrador de alcance para una oferta).
- Nuevo `open-sdd migrate estimate` (semanas-persona por ola según las 7 Rs).
- `open-sdd trace <feature> --csv`: matriz de aceptación para el cliente.
- `impl --parallel` muestra el camino crítico; `start` propone el reparto de una petición grande en features.
- CI: `check` respeta el entorno inyectado (el test fallaba solo en GitHub).

### Migration Kit (antes Modernize Kit)
- `open-sdd migrate` es el comando; `open-sdd modernize` sigue funcionando como alias. Los datos siguen en `.sdd/modernize/`.
- El nivel L6 se llama **migration**. `start` reconoce intenciones de migración enterprise en español e inglés: salida del datacenter, migrar el mainframe, de Oracle a PostgreSQL, cloud migration, lift-and-shift.
- Cuatro ejemplos enterprise nuevos para `migrate init --example`: `insurance-mainframe`, `datacenter-exit`, `database`, `monolith` (además de `banking`).
- Nueva regla 7 Rs `D-RETAIN-TARGET`: lo que ya está en `cloud` o `saas` se retiene en vez de rehospedarse.

### Fixes
- `brownfield clarify` detecta términos vagos en inglés, avisa y ofrece clarificar; no declara limpia una spec vacía; `_Depends:_` lee solo ids; `promptConfirm` funciona con TTY.

## [3.10.0] - 2026-10-24

### Fixes
- Always-on rules honour `--sdd-dir` (were fixed to `.sdd`); `README.es.md` gains the diagrams.

### One door, five verbs (spec `simple-experience`)
- `--help` is now five verbs (`open-sdd`, `setup`, `start`, `check`, `decide`); the full catalogue is `help --all`. Nothing removed.
- `setup` = `init`; `check` = `gates run`; `decide` lists every decision waiting for a person and answers it.
- The door's next action speaks in verbs (`setup --write`, `start "<…>"`, `check`).

### Always-on rules
- `C-INDEPENDENT-REVIEW` in every generated constitution: review is human or by a different model.
- Progress-aware escalation to a person: at the 1st critical failure (`RECEIPT_TAMPERED`, `QUESTIONS_CHANGED`), when it repeats an earlier failure or fixed nothing (no progress, from the 2nd attempt), or after more than 3 failures while progressing. The engine prepares the decision card (retry · park · exception) and only a person retries or approves.
- Karpathy guidelines in every project: `karpathy-guidelines` skill in every skills tree, `.sdd/settings/rules/karpathy-guidelines.md` written by `setup`, and the three rules in every installed command.

### Measure (spec `measure`, sprint 3 of docs/REVISION-EXPERTO.md)
- `open-sdd assure calibrate`: Cohen's κ, precision and recall of each detector against a labelled seeded-defect corpus (audit chain 0.70, escalation 0.85, EARS 0.75; precision 1.00). Results in `docs/MEASUREMENTS.md`; run in CI.
- Mutation harness: `trust` family (M28–M32), 5/5 killed.
- One source: `npm run sync:templates` (+ `:check` in CI) for the shared skills and the always-on rules; installed commands read the same rules file.

### Clarity (spec `clarity`, sprint 2 of docs/REVISION-EXPERTO.md)
- One knob: the level sets the governance floor (L3–L4 `team`, L5–L6 `enterprise`); `governance.json` can raise it, never lower it. `start` prints `profile ≥ …`.
- The score footer headlines the weakest measured link (`SDD 53% · … · eslabón débil: evidencia · compuesto 93%`).
- The standards gate shows only the findings on the files that change, at most 3, blocking first.

### Chain of trust (spec `trust-floor`, sprint 1 of docs/REVISION-EXPERTO.md)
- `setup` writes `.sdd/settings/approvers.json` from the git identity, and installs the PR gate workflow for `team`/`enterprise` (offered for `solo`).
- HIL approvals need an approvers list in `team`/`enterprise` (`APPROVERS_REQUIRED`).
- The engine audit log is a hash chain (`prev`); an edited line fails gate runs with `AUDIT_CHAIN_BROKEN`, a critical code.
- In `team`/`enterprise`, a self-authorized C5 without a fresh review receipt fails with `REVIEW_REQUIRED`.
- `check` feeds the progress-aware escalation and stays stopped while a person has not decided (not under `CI`).
- `gates run` accepts the global `--no-footer`.

### Security (QC 2026-10-23)
- An agent session can no longer approve a HIL card, adopt a learned rule or confirm a reverse-engineered rule with `--confirm <id>`: grants need the id typed on the controlling terminal. Residual: a pty can be simulated; see `docs/GUIA.md` §7.
- An agent session can no longer record a "human" review receipt.
- `delta validate` reports new symbols without `reuse:` evidence as advisory, with candidates.

## [3.9.0] — 2026-10-23

### Every flavour (spec `variants-reverse`)
- Variants: greenfield/brownfield per level from intent words or the workspace (`start --variant`). New playbooks `poc-brownfield`, `project-brownfield`, `multi-feature-brownfield`, `multi-unit-greenfield`.
- Rigor ladder per run: `start --rigor tiny-spec|spec-first|spec-anchored|spec-as-code` (legacy name `spec-as-source` accepted), composed onto the variant, never below the level floor or the declared `rigor.json`. All 48 level × variant × rigor combinations are tested.
- Reverse engineering mode: `open-sdd reverse init|status|next|confirm` and playbook `reverse-engineering` — RE-1 inventory → RE-2 architecture → RE-3 characterization → RE-4 rules → RE-5 confirmation by people → RE-6 spec baseline, slice by slice; the engine refuses to close a stage step before its exit criteria hold.
- Assistants: `open-sdd assist` (what helps now), `assist discover` (BMAD-style questions by role, chosen by level, variant, UI and risk) and `assist brief` (composed and linted), `assist ears` (deterministic EN/ES conversion to the five EARS patterns, questions instead of guesses), `assist steering` / `steering draft` (inferred-marked drafts), `assist constitution`.
- `open-sdd where [--line] [--save]`: phase, progress bar weighted by step cost, pending steps, waiting decisions, resumable checkpoint.
- EARS converter v2: negative requirements (`shall not`), passive with an agent rewritten as active, trailing conditions moved to the front, user capabilities as "the system shall allow…", several actions split into several requirements, vague terms answered with the measure to use, `--system`, `--file`, confidence and notes per statement, `--write` appends `REQ-<AREA>-NNN` with its source (`--accept` for rows needing confirmation).
- The top rigor rung is named `spec-as-code` (`spec-as-source` stays accepted, including in `rigor.json`).
- AI-DLC plugin rebuilt to the AI-DLC plugin layout (`.aidlc-plugin/plugin.json`, `sensors/aidlc-*.md`, `tools/aidlc-sensor-*.ts`, `contributions/`); the EARS sensor uses the converter. Not yet run through the AI-DLC validator.
- Docs: `docs/INSTALL.md` no longer says the package is unpublished; complete manual `docs/MANUAL.md`.

## [3.8.0] — 2026-10-23

### Level ladder and Modernize Kit (spec `modernize-kit`)
- `open-sdd start "<intent>"`: deterministic level L0 tiny … L6 modernization with evidence, playbook per level, ceremony minimal (L0–L1: no pack, no recall), standard, strict (L5–L6: approvers required). Risk words only raise the level; an explicit PoC stays a PoC. New playbooks `tiny` and `modernize`.
- Dynamic workflows without a model: rules `{on, when, priority, actions}` (defaults + `.sdd/settings/dynamic-rules.json`) over events (`security-advisory`, `incident`, `wave-start`, `signal`, `regulatory-change`); actions insert steps, patch both systems during parallel run, freeze, prepare HIL cards, set deadlines, raise the level. Decision digest; repeated events are no-ops; urgent lanes jump the queue in understand → approve → change → verify order. `engine event` for any run.
- `open-sdd modernize init|assess|override|waves|plan|wave|advance|event|propose|resolve|learn|rules|status`: portfolio schema and risk score, AWS 7 Rs decision table, retire-first/pilot/dependency-ordered waves, strangler lifecycle with deterministic canary decisions, approvals for regulated cut-over and irreversible decommission, agent proposals that may only raise risk, learning (one event = hypothesis, two = evidence), rule candidates adopted by a named, confirmed person, status as text/JSON/Mermaid/offline HTML.
- HIL: `--by` must match the listed approver of the git identity in use.
- Skill `sdd-modernize` (29 skills). Banking example portfolio. Guide `docs/guides/modernize-kit.md`. Claims CLM-074…077. 221 new tests including a 20-step banking go-live scenario with an unplanned critical CVE.

## [3.7.0] — 2026-10-23

### Trust, scale and visibility (spec `playbooks-v3-7`)
- HIL: answers record the git identity; `approvers.json` restricts approvers; agent sessions need `--confirm <card-id>` to approve; deadlines apply the card default (`DEADLINE_APPLIED`); `hil list --overdue`; `hil review --html` offline page.
- Improvement: `unobservedRisk` metric; candidates that remove a human or security control are always dropped.
- Memory: refused reports (`gate-block`) and edits of reviewed files (`human-edit`) are captured automatically.
- Telemetry: `report --tokens --model --duration`; time and tokens per step in `engine status`; MCP `open_sdd_report` accepts tokens and model.
- Planner: scale and risk from the intent (multi-unit / multi-feature, human `risk-review` for payments, auth, PII, migration, infra, data).
- Multi-unit: `engine start --units` with waves; per-feature lock.
- Experience: human `next`, `next --auto-handoff`, `engine list`, `engine status --mermaid`.
- Authoring: `playbook.schema.json`, `playbook new`, `playbook diff`, recipes `poc-to-feature` and `brownfield-aidlc-inception`.

## [3.6.0] — 2026-10-23

### Playbooks and the engine contract (spec `multi-unit-playbooks`)
- `playbook profile|check|plan|build|improve|save|list`: case-specific playbooks (13 in the library), a checker that refuses unknown keys, unknown step types, bad `when` and starved steps, a model-free planner (uncalibrated composite score), multi-host build and propose‑probe‑compose improvement.
- `engine start|status`, `next <feature> --json`, `report <feature> --step <id> --result <r>`: one directive contract for every host; `approved` is always refused from `report`. MCP tools `open_sdd_next` and `open_sdd_report`.
- `handoff write|recall|check`, `questions check|confirm`: bounded context packs, recall check, stale inputs, named confirmation.
- `hil prepare|answer|list|stats`: decision cards; the default can only park or reject; approvals only from `--by <name>`; override refused in autonomous mode.
- `memory capture|reflect|promote|withdraw|list`: lessons with provenance; confounded-only evidence is quarantined; promotion needs a name.
- `review record|freeze-check` and the pre-commit freeze: a reviewed artifact that changed after review blocks the commit.
- `waves <feature> --baseline|--verify`: wave referee; merge refused on a failed unit or a tampered protected file.
- Skill `sdd-playbook` in every skills tree (28 skills). AI-DLC plugin template `opensdd` (sensors fail closed; schema not yet run through the AI-DLC validator). Project type `multi-unit`; `import` accepts `aidlc`.
- Docs: `docs/guides/playbooks.md`. Claims CLM-068…071.

## [3.5.0] — 2026-10-22

### Hosts
- `--cline` (agent `cline-skills`) installs the skills in `.cline/skills/`, and `integrate cline` uses the same layout (docs.cline.bot). `init` autodetects `.cline/` and `.clinerules/`.
- `init --agent a,b` installs several hosts in one run and writes nothing if any id is unknown. An unknown `--agent` now lists the valid ids instead of being read as the target path.
- Agents can be declared `hidden`: they install and are autodetected, but they never appear in help, the picker or error listings.

### New read-only views
- `trace <feature> [--mermaid]`: requirement → task links; exits 1 while a requirement is uncovered.
- `explain <REQ-ID>`: where an id is defined, which tasks cite it, which tracked files name it (gate codes are unchanged).
- `report <feature> --html`: one self-contained page (requirements, tasks, evidence, trace graph; no script, no network).
- `badge`: an offline SVG of the SDD score. Artifact output on stdout never carries the score footer.
- `gates run --summary[=<path>]`: a Markdown verdict table appended to `$GITHUB_STEP_SUMMARY`, on in `gates.yml` and `action.yml`.
- `integrate vscode-tasks [--write]`: SDD tasks in `.vscode/tasks.json`, merge-only; JSON with comments is refused, not rewritten.

### Fixed
- `main` was red after the steelforge merge: templates and tests had been mixed from both sides (unknown `--devin`, missing reviewer sections). The steelforge side is restored and upstream additions are kept.
- Windows CI: text is checked out as LF (`.gitattributes`), so byte-level template tests no longer fail on CRLF.
- CLM-027 is a structural invariant (every skills tree equals `_shared`), so the claims registry is back to 0 broken. Registry descriptions no longer hard-code skill counts.
- Removed an orphan legacy skills tree (17 skills, a subset of `_shared`), along with the docs that advertised a `--devin` flag that does not exist.
- `help` derives the host list from the integrations matrix. `npx vitest run` at the root runs the package suite.

### Docs
- `docs/diagrams/`: every flow on one page, as an editable Excalidraw file, Mermaid and a PNG preview, linked from the README.
- New tests: registry ↔ manifest ↔ template-tree consistency, committed `dist/` equal to a fresh build, and agent hooks executed for real.

### SDD modes and the modules from SteelForge — see docs/guides/sdd-modes.md
- `open-sdd modes`: the six flows, the module matrix per rigor level (with `explore` as a throwaway mode outside the governed ladder) and, with `--projects`, which skills to use — and which to avoid — for each kind of project.
- `open-sdd stages <feature>`: the sequential stage guide, with what each stage needs.
- `open-sdd gherkin <feature> [--write]`: EARS acceptance criteria → `acceptance.feature`, one scenario per criterion tagged `@REQ-…`.
- `consistency` runs five new task-structure checks: `TASK_DUPLICATE_ID`, `PARALLEL_WITHOUT_BOUNDARY`, `DEPENDS_ON_UNKNOWN_TASK`, `TASK_WITHOUT_VERIFICATION`, `REQUIREMENT_NOT_IN_PLAN`.
- `consistency` also reports `REQUIREMENT_NAMES_TECHNOLOGY` (info): a requirement that names a technology without recording the constraint.
- `open-sdd discovery lint|log`: a gate over `brief.md` (non-goals, measurable outcome, unconfirmed assumptions block, no secrets) and an append-only decision log.
- `open-sdd archive <feature> [--confirm]`: verified specs move to `.sdd/archive/<date>-<feature>/`.
- `open-sdd steering check`: inclusion modes, in-workspace `#[[file:…]]` references and unconfirmed inferences.
- Six new skills in every skills tree (27 per host): `sdd-tiny`, `sdd-promote`, `sdd-bugfix`, `sdd-plan-only`, `sdd-refactor`, `sdd-characterize`; `sdd-help` documents the skills for each project type.

## [3.4.0] — 2026-09-21

### The requirements coach: 32 deterministic checks, and it never certifies

A spec is now adjudicated before anyone claims a review gate. Thirty-two checks across eight families
(EARS, ambiguity, singularity, verifiability, set-level, traceability, NFR, AI-specific) run
deterministically over `requirements.md`, and **every finding carries a position, a basis and a graded
remedy or an explicit question** — never a bare complaint. `open-sdd requirements review <feature>`
prints it; `--json` gives the machine envelope, and `requirements fix` applies only the rewrites that
are mechanical.

The two checks a hostile test horde proved were missing now exist: **`AMB-006`** (a superlative with
no baseline — "the highest resolution" — answered with a question, not an invented rewrite) and the
**slash chain of `AMB-009`**. The chain mattered: on `read/write/delete` the old anti-duplication guard
suppressed the finding entirely, so the defect vanished in silence.

Nothing here certifies. The output states that it reports checks and adjudication, not correctness; a
check that cannot inspect its link source is reported as **skipped**, never as a pass; and
instruction-shaped text inside a requirement is **escalated to a human**, never obeyed.

### The standards engine: a catalogue that renders itself and never blocks on faith

Sixteen machine-checkable standards ship in `.sdd/settings/standards/`, each declaring its severity,
the artifacts it applies to, a detection rule, and a remedy. `open-sdd standards list | show | explain
| check | fix` reads them. C8 Standards Conformance joins the chain as a **declared extension**
(`imposes: []`, advisory), and the rules under `.sdd/settings/rules/` are generated from the catalogue
by `injectRules`, which replaces only the marked blocks: the hand-written prose survives, and drift
means a **missing or edited block**, not a file that is not byte-identical to the render.

**Nothing blocks on faith.** Every entry is advisory until a corpus measures its precision, and
`isBlocking` requires a calibrated corpus before it can fail a build.

### Reversibility, stable identifiers and the console contract

`open-sdd uninstall` plans what it would undo from a receipt, and `restore --from` applies it. It
**refuses** to delete a file a human edited and a merged external config — un-merging is not deleting —
and `.sdd/` goes only with an explicit `--purge-sdd`. Identifiers are allocated in blocks and audited
against a real revision: `open-sdd brownfield ids <feature> --base <ref>` reports `ID-MUTATED` and
`ID-LOST` instead of letting an id quietly stop meaning what it meant.

The console contract is enforced: one source for the install command, real help routing, the 0–4 exit
code contract, **no success-looking footer after a failure**, `NO_COLOR` per its own specification, a
prompt that names the flag it needs, and a locale refusal that names the requested language and lists
the translated ones (`es`, `en`) instead of falling back silently. The drift sentinel reports as
**advisory at `spec-first` and blocking at `spec-anchored`** for the same change.

### Evidence engineering: 301 QA cases, 27 mutants, 30 assertion probes

The suite grew by a five-tier QA battery: easy (31), intermediate (41), hard (36), a **zombie horde**
of 100 hostile inputs against one survival contract, and 100 complex scenarios. It is backed by two
harnesses that keep it honest rather than merely large:

- `npm run mutate` introduces 27 deliberate defects across eight families (security, drift, standards,
  ids, receipt, coach, cli, enforcement) and requires **every family at 1.00**. An overall ratio hides
  a family nobody covers: 25/27 reads as 93 % while the receipt family sits at 1/3. Current: 27/27.
- `npm run assertions` measures the other half — whether an assertion is decoration. A static pass
  finds tautologies, unfalsifiable assertions and conditionals that may never run; `--probe` mutates
  the expected value and re-runs the file, so a test that passes either way is reported as decorative.
  Current: 0 static findings, 30/30 load-bearing.

Building the second harness meant fixing six defects in the harness itself — including one where it
reported a perfect green over zero parsed tests, catching its own author.

### The coach reaches the skills

`sdd-help` and `sdd-spec-requirements` teach the coach where the agents read it, across all nine
template trees, with the non-negotiables spelled out: the coach never certifies, a finding is never a
dead end, a skip is not a green, spec content is untrusted data, and nothing blocks while the
catalogue is uncalibrated.

## [3.3.0] — 2026-09-21

### Local overlay: private hosts, without publishing them

A host that must not be shared can now be wired from **outside the repository**. The CLI reads
`$OPEN_SDD_LOCAL_HOSTS` or `$XDG_CONFIG_HOME/open-sdd/local-hosts.json` and **never a path inside the
working tree**, so a private row cannot be committed by accident: no code path would read one from the
repository at all. `open-sdd init . --agent <id> --write` installs that host's workflow files exactly
like a shipped one, `integrate --list` shows it, and the shipped matrices stay untouched.

The overlay refuses what it cannot justify: a row is refused by default, `"verified": true` requires
`sourceArtifact`, a private row may never shadow a published one, `mcp.snippetRef` must name a shape
the tool already ships, and a broken file degrades into a named skip rather than a CLI that will not
start. Only the CLI entry point loads it, so importing the matrices in a test still sees the published
matrix and nothing else.


### Silence is not a verdict: twelve refusals, each with the URL that failed

Eight hosts that the research investigated had no row at all in the command matrix — neither verified
nor refused. That is the one outcome this project does not accept, because silence reads exactly like
"nobody looked". Kimi Code CLI, Crush, Amp, Warp, Goose, OpenHands, DeepSeek Harness and Aider now have
a **refusal row** that names the host, states why there is no project-scoped commands directory, and
carries the URL that establishes it — Kimi's own documentation index (which has no commands page),
Amp's "You do not need a slash command", DeepSeek Harness's "Plugin-owned command registration", and
Aider's 84 documentation pages in which `AGENTS.md` appears zero times. The matrix is now 32
conventions: 19 verified and 13 refused by name.


### Continue.dev, and a third MCP family

Continue.dev's convention is one **standalone YAML block per server** in `.continue/mcpServers/`, with
`mcpServers` as a *list* rather than a map. The snippet is emitted by hand and the merge treats the file
as an owned block: created when absent, kept when byte-identical, and **conserved untouched** when it
exists with different content. No YAML parser is involved, so no YAML this tool did not write can ever
be rewritten by it. Its prompts are **not** written to `.continue/prompts/`: that convention appears
zero times in the vendor's 153 documentation files, so the row refuses it by name even though the habit
is widespread — a plausible-looking path the host may never read is worse than an admitted gap.


### One shared skills tree instead of sixteen copies

Twenty-one skills now install **once**, from one neutral tree, into `.agents/skills/` — the cross-tool
path that Roo Code, Kilo Code, Junie, MiMoCode, Crush, Amp, Kimi Code, Warp, Devin and Factory Droid
each document reading (and that Goose, OpenHands and DeepSeek Harness read too). `integrate roo-code
--write` writes that host's own MCP file *and* the shared tree, and the plan says where and why instead
of announcing one directory and writing another. A host is mapped to that installer only when its own
row documents the path — enforced by a test — so Trae (whose `.agents/skills/` support is off by
default), Qoder, ZCode and CodeBuddy get a **manifest of their own that points at the same neutral
tree** — one manifest per host, never a tree per host — so all four install 21 skills into their own
different shape) and iFlow CLI (which documents no Agent Skills at all) remain declared rather than
written blind.


### Eleven more hosts, each one read from its own documentation

The 22 workflow templates no longer install for the eleven hosts this project started with. Each new
convention below was read from the vendor's own documentation (or, for ZCode, from the vendor's own
resolver, and the row says SOURCE-VERIFIED), and the row carries the URL it was checked against:

- **Factory Droid** — `.factory/commands/`, `$ARGUMENTS`.
- **Roo Code** — `.roo/commands/`; its `argument-hint` is display-only, so the input arrives as a
  plain instruction instead of a token the engine never expands.
- **Kilo Code** — `.kilo/commands/`; no placeholder documented.
- **JetBrains Junie** — `.junie/commands/`, and the installer **injects** the `allowPromptArgument:
  true` frontmatter key that the host requires before it will expose `$prompt` at all.
- **MiMoCode (Xiaomi)** — `.mimocode/commands/`, `$ARGUMENTS`.
- **iFlow CLI** — `.iflow/commands/`, `{{args}}`.
- **ZCode (Z.ai)** — `.zcode/commands/`, `$ARGUMENTS`; SOURCE-VERIFIED, because the documentation stops
  at "the project directory" and the path comes from the vendor's own command resolver.
- **Augment Code** — `.augment/commands/`, `$ARGUMENTS`.
- **Trae (ByteDance)** — `.trae/commands/`; no placeholder documented.
- **Qoder (Alibaba)** — `.qoder/commands/`; Qoder is the current name of Tongyi Lingma.
- **CodeBuddy (Tencent)** — `.codebuddy/commands/`, `$ARGUMENTS`.

### Twenty-six MCP registrations, each in its host's own shape

Fifteen hosts gained a **verified** MCP registration, and the matrix now holds twenty-six. Six of them do not use the `mcpServers` family — so the matrix writes each host's own shape instead of a plausible neighbour:

- `mcpServers` with a string `command` + `args` array: **Factory Droid** (`.factory/mcp.json`),
  **Roo Code** (`.roo/mcp.json`), **JetBrains Junie** (`.junie/mcp/mcp.json`), **iFlow CLI**
  (`.iflow/settings.json`), **Trae** (`.trae/mcp.json`), **Kimi Code CLI** (`.kimi-code/mcp.json`),
  **Warp** (`.warp/.mcp.json`), **Devin** (`.devin/mcp_config.json`), **Qoder** (`.mcp.json`).
- Top-level `mcp` with `type: "local"` and `command` as an **array**: **Kilo Code**
  (`.kilo/kilo.jsonc`) and **MiMoCode** (`.mimocode/mimocode.json`).
- Top-level `mcp` with a **string** `command`: **Crush** (`.crush.json`).
- Servers nested under `mcp.servers`: **ZCode** (`.zcode/config.json`).
- A namespaced key, `amp.mcpServers`: **Amp** (`.amp/settings.json`).
- `mcpServers` plus an explicit `type: "stdio"`: **CodeBuddy** (`.mcp.json`).

Kilo's documented file is JSONC, so a config that already contains comments is **refused rather than
rewritten** — a strict-JSON reader that silently dropped someone's comments to add a server would be
the same class of defect this tool exists to catch. Augment Code, Amazon Q Developer, Continue.dev,
DeepSeek Harness, Goose, OpenHands and the JetBrains AI Assistant were investigated and get **no** MCP
row: their file path or entry shape is not documented, or the config is user-scoped only, and the URLs
that failed are recorded in the report instead.

`open-sdd templates` now lists 31 conventions (19 verified, 12 refused) and `open-sdd --agent <id>`
accepts 34 agent definitions. Fourteen further hosts were investigated and are **not** given a
commands row, because no project-scoped commands directory is documented for them (Warp, Devin,
Replit, Firebase Studio, Aider, Crush, Amp, OpenHands, Goose, Kimi Code CLI, DeepSeek Harness,
JetBrains AI Assistant, Continue.dev, Amazon Q Developer) — their surface is skills and/or MCP, which
is the next increment and is declared in G-35 rather than half-shipped.

### The argument you type now actually arrives

*(This was prepared as 3.2.1 and never published: it ships inside 3.3.0.)*

- **The per-host argument token is translated instead of shipped verbatim.** Every prompt template was
  authored with `$ARGUMENTS` and installed unchanged, so Gemini CLI and Qwen Code — which substitute
  `{{args}}` — and GitHub Copilot — whose prompt files have no `$ARGUMENTS` at all and use the soft
  `${input:request}` the model is asked to prompt for — silently dropped the argument.
  `/sdd-specify my-feature` reached the body as a token nobody expands. The installer now renders each
  host's own form, and a host whose documentation describes no placeholder receives a plain
  instruction rather than a dead token.
- **A host's documented size limit is checked, not asserted.** Windsurf and Antigravity cap a workflow
  file at 12,000 characters; a template over the limit is reported as a failure **with the number** and
  is not written. Truncating a prompt would be worse than not installing it.
- **`argument-hint` ships in all 22 templates**, so Claude Code and the VS Code prompt files show what
  to type in the composer.
- **`open-sdd templates` prints the row that was internal until now**: directory, invocation, argument
  token and documented limit per host. `--json` carries the evidence URL behind each one.
- Upgrading refreshes the affected templates automatically: an installed template open-sdd generated
  and nobody edited is reported `update` and rewritten with the correct token; one a human edited is
  left untouched and named. Re-run `open-sdd init . --write` (or `open-sdd integrate <host> --write`)
  to pick this up.

## [3.2.0] — 2026-09-20

### The way of working: 22 prompt templates, installed by default

- **`open-sdd init <target> --write` installs 22 workflow templates into the host's own commands
  directory, and they are now the default path.** `/sdd-onboard`, `/sdd-constitution`,
  `/sdd-specify`, `/sdd-clarify`, `/sdd-plan`, `/sdd-tasks`, `/sdd-implement`, `/sdd-analyze`,
  `/sdd-checklist`, `/sdd-converge`, `/sdd-tasks-to-issues`, `/sdd-brownfield`, `/sdd-status`,
  `/sdd-contracts`, `/sdd-impact`, `/sdd-reuse`, `/sdd-gates`, `/sdd-audit`, `/sdd-import`,
  `/sdd-doctor`, `/sdd-tour` and `/sdd-release` are plain prompt files written where the host
  already reads them (`.claude/commands/`, `.cursor/commands/`, `.github/prompts/`,
  `.gemini/commands/`, `.opencode/commands/`). Each one points at the real engine
  (`open-sdd status --json`, `open-sdd delta validate <feature> --json`, …) instead of guessing, so
  the whole workflow runs with **no MCP server and no network**.
- **MCP is now opt-in.** `open-sdd init <target> --write --mcp` adds the host's MCP registration on
  top of the templates; without `--mcp`, no MCP configuration is touched. Some hosts do not
  implement MCP and some security policies block or allow-list it, so the default path had to stop
  depending on it. `open-sdd integrate <host> --write` remains the host-by-host equivalent.
- **The template install is idempotent and never overwrites your edits.** Every installed template
  carries a sha256 signature of the body it was generated from: a re-run refreshes an untouched
  template (`update`), leaves an edited one alone and says why (`keep`), and `--write` refuses to
  write into a host whose commands convention is not verified rather than inventing a path the host
  may never read.

### Brownfield convergence: what the specification asks and the code does not do

- **`open-sdd brownfield converge <feature>` measures the distance between the spec and the code
  instead of asserting it.** It reads `requirements.md`, `plan.md`/`design.md`, `tasks.md` and the
  delta, and reports six kinds of gap, each with machine-collected evidence: `missing` (a requirement
  no task implements, or a declared boundary that does not exist), `partial` (traced tasks that are
  not all complete, with the measured ratio), `contradicts` (a task citing an unknown requirement, or
  a constitutional pivot error), `unrequested` (a changed file exporting a symbol no spec token
  names), `unprotected` (a contract the delta declares that exists nowhere — a green test run cannot
  close this one) and `unbound` (a task marked `[x]` with no `_Evidence:`). A finding without
  evidence is discarded before it is printed, and the exit code is `1` when any gap is `high`.
- **`--write` appends the remaining work and nothing else.** Exactly one
  `## Phase N: Convergence` section goes to the bottom of `tasks.md`; existing tasks are never
  rewritten, renumbered or reordered, `requirements.md` and `plan.md` are never touched, and no
  application code is written. Re-running on the same tree does not append a gap twice.

### The constitution as the pivot: a natural-language interview and EARS

- **`open-sdd brownfield constitution --interview` is a conversation that does not ask what the code
  already answers.** It starts from the descriptive constitution — what the repository already
  demonstrates — and separates `decidedByEvidence` (the stack, the observed practices, the
  boundaries, the API surface, the established facts) from the questions only a person can answer:
  which observed principles to ratify, which practice the code does not yet show to adopt, and the
  normative decisions (API deprecation, regression floor, boundary crossing, sensitive data). With
  `--answers <path> --write` it writes a validated draft to `.sdd/steering/constitution.draft.md`
  and **never touches `constitution.md`**; only
  `open-sdd govern constitution --ratify --by "<name>" --rationale "<reason>"` puts it in force, so
  the authority is always a named person's decision.
- **`open-sdd brownfield specify <feature> "<description>"` derives EARS requirements from plain
  language**, and `open-sdd brownfield requirements <feature> [--suggest] [--apply <i>] [--write]`
  runs the EARS assistant over an existing `requirements.md`. Both use the same analyzer that
  validates the document, so the assistant and the gate cannot disagree.
- **`open-sdd brownfield clarify <feature>` asks the questions the analysis actually raised**, from
  the ambiguity codes and the unresolved delta markers rather than from a fixed script. The batch is
  capped (5 by default; when it is cut, `truncated`, `remaining` and the detail say so), and every
  answer rewrites only the affected line before the analysis is re-run to prove the ambiguity is
  gone: a response that does not remove the finding is reported open, never as fixed.

### Enforcement that fails closed, including the stop hook

- **`open-sdd integrate <host> --write` installs a `Stop` hook on the hosts whose blocking contract
  was verified against their own documentation (Claude Code, Codex CLI).** The hook runs the exact
  invocation the commit gate runs (`gates run C1 C2 C3 --staged --strict`), and an adapter maps both
  a failing gate (exit `1`) and a chain that could not run (exit `2`) to exit `2` — the code those
  hosts document as "block". Without that translation the raw argv would **fail open**: the check
  would run, see the failure, and the agent could still declare itself finished.
- **A host with no verified `Stop` mechanism is refused, not guessed at.** `integrate` reports
  `refused` with the reason and writes nothing for that host; this release does not ship a hook whose
  blocking behaviour was never confirmed.

### The celebration, when — and only when — it is earned

- **`open-sdd status --check` now prints a green feature block when three independent verdicts are
  all true at once:** the feature's requirements are EARS-conformant, its constitutional pivot was
  evaluated with no errors, and the gate chain the declared rigor level activates passed. Anything
  missing is `refused` with the missing datum named, and a real failure is reported `plain` — a check
  that did not run is never celebrated. The streak comes from the adhesion ratchet, not from a second
  count.
- **`open-sdd status --celebrations [--json]` reads the ledger of validations**
  (`.sdd/state/celebrations.json`), and the achievements shown are derived from events actually
  recorded there. An unreadable ledger is warned about and shown empty, never filled in.

### The living spec and its biography

- **`open-sdd biography <feature>` turns a specification's git history into its biography:** when it
  was born and when it last moved, one event per changed artifact with the lines added and removed,
  the spec's commits against the code's, the delta entries (amendments) that shaped it and the
  behaviour they replaced, who ratified the constitution it is read against, and the phases declared
  in `spec.json` over time. `--json` for scripts and `--limit N` for the event window.
- **The rhythm verdict is derived from measured numbers, never asserted.** `unknown`, `orphan`,
  `quiet`, `stale` and `alive` come from the commits and dates the repository actually has, and every
  rendering carries the sentence that activity is not quality: a spec that never changes can be
  correct, and one that changes daily can be a disaster.

### Progress and backup

- **`open-sdd progress` is an append-only ledger of milestones** (`.sdd/state/progress.json`), and
  `open-sdd progress record --kind <kind> --summary "<one line>" --score <0..100> --phase <1|2|3>
  [--evidence <path>]` appends one. The `delta` is computed against the previous entry and cannot be
  supplied by the caller; a flat day says *sin cambios* instead of dressing up as a rise; an empty,
  vague or multi-line summary is rejected because it would put a phrase where the fact belongs; and a
  corrupt ledger warns and starts a new series instead of inventing a history.
- **`open-sdd backup create|verify|restore` makes the governance state restorable.** `backup create`
  copies the whole `.sdd/` tree into a directory with a `manifest.json` and a sha256 per file;
  `backup verify <archive>` recomputes every hash and reports mismatches; `backup restore <archive>`
  is a dry run unless `--write`, and `--only <path>` restores a single file. Files shaped like
  credentials (`.env*`, `.npmrc`, `.netrc`, private keys), symlinks and `node_modules`/`dist`/`.git`
  are omitted and named in the manifest detail instead of being copied silently.

### Native GitFlow: the branch role decides the governance

- **`open-sdd gitflow [--level <level>] [--greenfield] [--json]` derives the branch's role from the
  branches that actually exist and says what that role requires before you ask.** The model is
  detected, not configured: `gitflow` only when `develop` and `main`/`master` coexist, `trunk` for a
  single non-role branch, and `none` with the reason otherwise. The role (`main`, `develop`,
  `feature`, `release`, `hotfix`, `other`) comes from the branch name, and the output names the
  artifacts the role owes, the gate chain for the declared rigor level, the next step, and —
  separately — what can actually block today (the commit hook, the pull-request workflow, the
  governance profiles) versus what is only advice.
- **It is a read-only report.** `gitflow` changes no branch, runs no gate chain, and never declares a
  branch protection it has not observed.

## [3.1.0] — 2026-09-20

### Added — one entry point, one dashboard, and the constitution as the pivot

- **`open-sdd brownfield bootstrap [target] [--focus "<texto>"] [--write] [--json]` — the single entry
  point for an existing repository.** `core/bootstrap.ts` composes the scanners that already existed
  (`scanProject`, `collectRepoFacts` + `buildDescriptiveConstitution`, `findReuseCandidates`) into one
  plan plus two artifacts that did not exist: the **module responsibility map**, with a decidable
  answer to "where does new code go?" (`answerCodePlacement`), and
  `.sdd/steering/codebase-intelligence.md` for agents — generated with a provenance marker and never
  overwriting a hand-authored file. This is our reading of spec-kit issue #1436's
  brownfield-bootstrap / module-map / knowledge-document concept, **reimplemented on our own engine**,
  not a port of their extension. Without `--write` it writes nothing; with `--write` it writes the
  intelligence document and generates the constitution only when it is missing.
- **`open-sdd status [feature] [--check] [--quiet] [--json]` — one dashboard for the whole state:**
  the constitution, every spec, the delta, the contract set, the constitutional alignment, the rigor
  level and the **next command to run**. `--check` appends the per-spec constitutional validation,
  `--quiet` collapses the panel to one line with the verdict in the exit code (the commit-time form),
  and `--json` emits the aggregate. `status` is a panel, not a wall.
- **The constitution is now the pivot of every spec, not a decorative document.**
  `core/specConstitution.ts` (`alignSpecWithConstitution`) compares a spec's requirements/plan/tasks
  and its brownfield delta with the constitution: a cited principle that is not in force is a
  **phantom authority** (`UNKNOWN_PRINCIPLE`, error), a spec that cites none leaves the pivot unused
  (`NO_PRINCIPLES_DECLARED`, warning, alignment 0), a requirement or delta entry that contradicts a
  `MUST` is `MUST_CONTRADICTED` / `TECH_LOCK_VIOLATION`, and the boundary, API-compatibility and
  regression-oracle rules are `BOUNDARY_VIOLATION` / `API_COMPAT_MISSING` / `ORACLE_MISSING`. When a
  rule cannot decide it says so in `detail` instead of emitting a finding — an `ok` over something not
  inspected is refused. `status --check` exits 1 only on error-severity findings. On this repository:
  alignment 100 %, 0 errors, 1 warning.
- **The `sdd-brownfield` skill — the fast-learning-curve artifact.** The 21st skill, shipped
  byte-identical for all 8 skills-based agents (168 `SKILL.md` templates in this repository, was 160):
  the five-step brownfield flow (reconocer → anclar → describir el cambio → comprobar → entregar), the
  **ADSR / EARS / EGTAV** mnemonics of the *Manual Maestro SDD v3.0*, the constitution-as-pivot
  explanation with this repository's real principle `C-API-COMPAT`, the cumulative rigor ladder, the
  reuse-first rule and the honesty rules (a green test run with a declared contract missing is not a
  pass). It complements `/sdd-getspecs` and `/sdd-steering`; it does not replace them. Paired with
  **[docs/guides/brownfield-quickstart.md](docs/guides/brownfield-quickstart.md)**, the 10-minute path
  with the FAQ and an honest "what it does not do yet" section.
- **Four new declared gaps and five new claims.** G-20 … G-23 record the real limits of the new
  surface: `bootstrap --write` writes two of the three artifacts its own plan announces; multi-module
  discovery is Node-only (no Maven/Gradle, Go, Rust or Python workspace discovery, so the spec-kit
  issue's language coverage is not matched — the concept is, the coverage is not); the module map and
  the constitution's boundary evidence use two different vocabularies; and `publicApiFiles` matches
  entry-point filenames instead of reading the manifest, which is why the compliance matrix reports
  50 % coverage on this repository. Claims CLM-058 … CLM-062 decide the new surface by exit code;
  registry result: 62 claims, 59 verified, 0 declared, 3 not measured, 0 broken, 0 outdated.

### Changed — the rigor levels are a cumulative ladder, and the default is the floor

- **The three SDD rigor levels (`tools/open-sdd/src/core/rigor.ts`) are now a cumulative ladder**
  whose default (`spec-first`, also what `.sdd/settings/rigor.json` declares in this repository) is
  deliberately fluid: 2 → 4 → 6 gates, and every level only **adds** demands and gates. `spec-first`
  now requires the constitution and the triad (requirements in checkable EARS form) — it previously
  only recommended them — adding nothing else: evidence, drift, contracts and regeneration stay
  `not-required`. `gatesActive` is `['C1','C2']` (was `['C1']`) and `missingArtifactPolicy` is
  `blocking` (was `advisory`). The maintainer's rationale: *por defecto que sea cumplir con los
  requerimientos y constitución bien hecha, y a medida que subo nivel se aumenten los gates*.
- **`spec-anchored` adds delta (brownfield), traceability, evidence and drift** and activates
  `['C1','C2','C3','C6']`; **`spec-as-source` adds contracts and regeneration** and activates
  `['C1','C2','C3','C4','C5','C6']`. No level removes a demand or a gate, and **C2 (secrets and
  destructive commands) is active at every level on purpose**: it is the hard subset that never
  self-authorizes, so lowering rigor must not make a committed credential acceptable.
- **The constitution is now `required: true, severity: 'blocking'` at all three levels**, greenfield
  and brownfield: a blocking verdict must cite an authority, so the default level cannot be lawless.
  What the levels differ in is everything above that floor (evidence binding, drift, contracts,
  regeneration), not whether authority exists. This is a **declared divergence** from the *Manual
  Maestro* §2.4 / reference-architecture reading that lets Spec-First pair with a constitution the
  level does not demand; recorded in `docs/PAPER-ALIGNMENT.md` (divergence 8) with its citation
  (CSDD §3.4, invariant I1).
- **The gate set is configurable and validated.** New API: `effectiveGates(level, override?)`,
  `validateGateOverride(ids)`, `RIGOR_LADDER`, `RigorSettings.gates?`, `RigorAssessment.gates`, and
  `assessRigor` takes `gates?`. The optional `gates` field in `.sdd/settings/rigor.json` may
  **narrow** the level's list, but an unknown id is **rejected** (naming the id) instead of being
  ignored, so a typo cannot silently reduce the checks.
- **`govern rigor` is compact by default; the commit path stays fluid.** It now prints two lines
  (level + active gates, and what it demands) and only blocking findings and warnings, with a count
  of the hidden informational findings; `--verbose` restores the full level table, the declared
  rationale and every finding; `--quiet` prints a single line and carries the verdict in the exit
  code; `--gates` prints the ladder table; `--select` is unchanged. The pre-commit hook
  (`tools/open-sdd/templates/hooks/pre-commit`) runs `govern rigor --no-drift --quiet`, so a commit
  does not read like an audit while C2 still blocks.

### Fixed — one publishable identity, and a parser bug it exposed

- **The publish pipeline targeted the wrong package.** `publish.yml` ran `npm publish` from
  `tools/open-sdd` (the build workspace), so a release tag would have published an **unscoped**
  `open-sdd` while the repository had already decided on `@brujo2020/open-sdd`. It now builds and
  tests the workspace, runs the gate chain and the claims registry, asserts the published name, and
  publishes from the repository root with `--access public --provenance`.
- **The workspace can no longer be published by accident.** `tools/open-sdd/package.json` is marked
  `"private": true`; the root manifest carries `publishConfig.access = "public"` (scoped packages
  default to private on npm) and remains the only publishable artifact.
- **`install:global` installed the wrong identity.** It installed `./tools/open-sdd` (global name
  `open-sdd`) instead of the scoped package; it now installs the repository root.
- **Documentation no longer advertises a command that resolves to nothing.** `npx open-sdd@latest`
  was named in the README, the installation guide, two workflow guides and the workspace README
  (9 occurrences). All install/uninstall instructions use `@brujo2020/open-sdd`, the README states
  that the scoped package **is not published yet**, and the paths that work today (clone +
  `install.sh`, or `npm run install:global`) are given explicitly.
- **Bug found while verifying the above, and fixed.** The claims-registry parser processed YAML
  double-quoted escapes in sequence, which turned `\\n` into a backslash plus a real newline and
  split a verifier command across lines. It now unescapes in a single left-to-right pass. This was
  caught by a new claim that failed as `broken` — the registry reporting on itself as intended.
- **The published artifact reported its version as `vdev`.** Packing the tarball and installing it into a
  throwaway prefix showed `open-sdd --version` printing `vdev`: the CLI read
  `../package.json`, and `tools/open-sdd/package.json` is deliberately not shipped. It now resolves the
  repository/package root manifest first (three levels up from `dist/cli.js`, which is the same
  directory in a checkout and once installed) and falls back to the workspace one, through a single
  `readCliVersion()` helper that replaced two duplicated read sites.
- **`postinstall` was noisy for consumers.** It announced a skipped workspace on every consumer
  install; it now installs workspace dependencies only when `tools/open-sdd/src` exists (a source
  checkout) and exits silently in the published layout, where the compiled `dist` is already shipped.
- **Verified against the real artifact, not the source tree:** the packed tarball installed into a
  temporary prefix exposes all four binaries (`open-sdd`, `sdd-open`, `sdd`, `open-sdd`),
  `--version` prints `open-sdd v3.0.2`, `--help` works, and `gates chain --profile team` resolves 9
  controls from the installed copy. Three more tests (13 in total) cover the version resolution and
  both postinstall paths, and CLM-044 decides the version by exit code.
- **Guards so none of it returns:** `test/releaseIntegrity.test.ts` (10 tests) asserts the single
  publishable identity, that every `bin` target exists, that the workspace is private, that
  `install:global` installs the root, that the publish pipeline tests before publishing and never
  runs from the workspace, that the identity is asserted before `npm publish`, and that **no
  documentation code block** advertises the unscoped name. Claims CLM-041 … CLM-043 decide the same
  properties by exit code.


### Added — brownfield: delta specs and the reverse constitution

- **Delta specs: the unit of specification is the change, not the system.** `core/deltaSpec.ts`
  implements the four ADSR sections (ADDED / MODIFIED / REMOVED / RENAMED), delta-scoped
  `REQ-<AREA>-<NNN>` identifiers, a mandatory `previous` on MODIFIED/REMOVED/RENAMED, a mandatory
  rationale **and** contracts on REMOVED (contracts are a warning on MODIFIED), a size warning above
  25 entries, per-entry strangulation (`legacy → both → new`), and two-way traceability: every
  requirement must have a task, and a task citing an unknown delta id is reported as a phantom. New
  console surface: `delta init|validate|status|render <feature>`.
- **The reverse-engineered descriptive constitution.** `core/constitution.ts` models one artifact
  with two provenances: `descriptive` principles (what the code already obeys, each with mandatory
  evidence) and `normative` principles (authored, introduced by a governed amendment that requires a
  migration plan). Six-field anatomy (identifier · threat/CWE reference · MUST/SHOULD/MAY ·
  restriction · pattern · justification), citable authority, indirect-injection scan and markdown
  round-trip. `core/reverseConstitution.ts` reads the repository's facts (lockfile, migration dirs
  and rollbacks, CI workflows, public API entry points, config files) and emits desired-but-absent
  practices as **proposed amendments**, never as facts. New console surface:
  `brownfield survey [target]` and `brownfield constitution [target] [--write]`.
- **Three SDD rigor levels.** `core/rigor.ts` implements Spec-First, Spec-Anchored and
  Spec-as-Source with the artifacts each level demands, its active gate ids, its evaluator question
  and its missing-artifact policy; `govern rigor` prints the levels and assesses the repository
  against the level declared in `.sdd/settings/rigor.json` (exiting 1 on blocking findings), and
  `govern rigor --select` recommends one. A valid constitution is **required (blocking) from
  Spec-Anchored upward** and only recommended at Spec-First, because it is the authority a blocking
  verdict cites. Where a demand is not decidable from artifacts (regeneration at Spec-as-Source) it
  is reported as a declared gap instead of a fabricated pass.
- **Analysis over the pending change: impact, contracts and reuse-first.** `core/changeImpact.ts`
  (`analyzeChangeImpact`) reports the change's reachable set, its blast radius, the touched API
  surface, its integration points and the breaking changes implied by the delta's targets.
  `core/executionContract.ts` turns the delta's declared `Contracts:` into a regression oracle:
  `extractContracts` binds covering tests to the changed files, publishes `contracts.json`, and
  names the changed files **no** contract covers; `verifyContracts` requires exit code 0 **and** no
  declared contract missing, so a green run never launders a promised protection that does not
  exist. `core/reuseFirst.ts` (`findReuseCandidates`, `REUSE_FIRST_RULE`) reports the symbols a
  reuse-first search would have found first. Console: `brownfield impact|contracts|reuse <feature>`,
  with `--write` and `--verify` on `contracts`. Declared limit: these are reports, not gates, and no
  workflow invokes `--verify` yet.
- **Reconnaissance is workspace- and configuration-aware (defect fixed).** Running `brownfield
  survey` on this repository used to report **"JavaScript, no tests detected"** while the project is
  TypeScript with 500+ tests, because the code lives in `tools/open-sdd` and the scan read only the
  repository root. The scanner now walks the declared workspace roots (`tools/open-sdd`, `packages/*`,
  `apps/*`, …) and reads both manifests and config files (`tsconfig.json`, `vitest.config.ts`,
  `governance.json`-style settings), so it reports **TypeScript / npm / tsc / Vitest and 9 modules**
  with the real module list. A brownfield survey that lies about the project it is run on is worse
  than no survey.
- **Drift-gate false positive fixed.** `core/git.ts` · `getModifiedFiles` trimmed the whole
  `git status --porcelain` output, which stripped the leading space of the **first** line only (the
  common "modified, not staged" prefix is ` M`); `slice(3)` then removed a real character from that
  path, so `docs/x.md` appeared as `ocs/x.md` and matched no declared boundary — a false
  ambient-drift finding on whichever file git listed first. The fix parses the raw output line by
  line; all 29 paths in this checkout now parse exactly.
- **Traceability updated.** Gap G-12 is rewritten from "heuristic bootstrap" to "delta specs and a
  reverse constitution, with behaviour still declared rather than extracted"; four new gaps record
  what remains (G-15 contract verification is not in CI, G-16 the compliance matrix has no console
  surface, G-17 no delta merge-back, G-18 impact/reuse consult code rather than the constitution);
  six declared divergences between the source documents and the implemented code are recorded in
  section 6 (six fields vs three, the undefined `SHALL NOT` modal, where Spec-Anchored starts,
  slash-separated CWE references, the two rigor scales and their bridge, and the unenforced
  compliance matrix); the component map gains the modules and the brownfield console; and nine new
  claims (CLM-045 … CLM-053) decide the capabilities by exit code. Registry result: 53 claims, 50
  verified, 0 broken, 0 outdated.

### Added — enforcement floor installed, skills taught, naming unified

- **Level B (commit) is installed, not declared.** `tools/open-sdd/templates/hooks/pre-commit` runs
  `gates run C1 C2 C3 --staged --strict` — C1 advisory, C2 blocking on secrets and destructive
  commands **in the staged index**, C3 blocking when a completed task carries no captured
  `_Evidence:`. It fails closed with an actionable message when the CLI is missing, and it is
  installed automatically by `npm run prepare` / `npm run hooks:install`, or into any target project
  with `open-sdd floor install <target> --ci`.
- **Level C (merge) is installed.** `.github/workflows/gates.yml` runs on every pull request:
  install, build, the full suite, the resolved chain, `gates run --base <base-sha>` against the PR
  diff, `govern discipline`, `assure claims --verify` and `floor status`.
  `tools/open-sdd/templates/hooks/open-sdd-gates.yml` is the copy shipped for target projects.
- **Declared security exceptions.** `.sdd/settings/security-allowlist.json` records each suppression
  per (path, pattern id) with a reason and an actor, and every run reports how many findings it
  suppressed — a suppression can never be mistaken for a clean scan. `git commit --no-verify` is
  documented as an unrecorded bypass.
- **`open-sdd floor status|install`** (new `floorInstallation.ts` and `securityAllowlist.ts`; new
  `--staged`, `--base` and `--strict` modes on `gates run`) answers whether the owned floor is
  installed rather than argued, and exits non-zero the moment it is not. 13 tests in
  `test/enforcementFloor.test.ts`.
- **The shipped skills teach the console.** All eight `sdd-help` skills (one per skills-based agent)
  now document `gates` / `govern` / `assure` / `waves` / `floor`, the C7-vacuity and
  no-model-backend caveats, and the pointer to `docs/PAPER-ALIGNMENT.md`.
- **Legacy naming purged from the guides and the shipped templates.** 588 replacements across 40
  files to the `sdd-` / `.sdd/` / `{{SDD_DIR}}` naming. Thirty-nine broken internal anchors were
  repaired; a name audit now finds zero unknown skill or command tokens.
- **Untranslated Japanese fragments removed** from four English documents. The runtime literal
  `次のステップ` was kept on purpose — the subagents actually emit it — with the surrounding prose
  clarified.
- **Traceability updated.** Gap G-11 was rewritten from "declared, not installed" to "installed, with
  level A still unverified", and five new claims (CLM-036 … CLM-040) decide the floor by exit code.
  Registry result: 40 claims, 37 verified, 0 broken, 0 outdated.


### Added — restoration, Zero-Trust console, paper-aligned core
- **Restored the product.** A previous cleanup had removed the CLI surface while the npm package (`open-sdd@3.0.2`) still declared a `bin` pointing at `tools/open-sdd/dist/cli.js`. The CLI, its commands and the shipped agent templates are restored, and `install.sh` now drives the real CLI instead of copying files into a `src/cli/` layout that never existed in any commit.
- **Zero-Trust governance console.** `open-sdd gates|govern|assure|waves` implements the reference architecture: the gate chain resolved from catalog + profile + repository signals, the crosswalk and the residue computed by subtraction, enforcement levels A–D with ceiling-vs-floor and behavioural-sentinel semantics, conformity C0–C3, quantified HIL thresholds, relaxation receipts and the appeal channel, META-EVAL, the overhead budget, the OWASP Agentic / MITRE ATLAS and EU AI Act / NIST / ISO crosswalks, the five risk-lab banks, the skills and memory models, and transactional wave planning. `--help` lists the subcommands.
- **Paper-aligned core modules** under `tools/open-sdd/src/core/`: `gateCatalog.ts`, `enforcement.ts`, `invariants.ts`, `receipts.ts`, `hitl.ts`, `ears.ts`, `triad.ts`, `waves.ts`, `metaEval.ts`, `memory.ts`, `skills.ts`, `telemetry.ts`, `claims.ts`, `assurance.ts`, `gateRunner.ts`. The catalog keeps executable, vacuous and declared-but-not-implemented states distinct, so C7/Karpathy is reported as activation without measurement instead of being laundered into a passing control.

### Documentation — alignment with the published reference architecture
- **`README.md` rewritten.** The previous version was stale and, in places, false: it advertised a feature with no counterpart in the tree, described a `curl … install.sh | bash` one-liner the script cannot serve (it requires a target repository argument and exits `1` without one), and stated "Code always matches the approved spec" as an unconditional guarantee. The rewrite documents the real CLI surface, the 18 agent definitions and their install directories, both profile axes (`solo|team|enterprise` for blocking; `solo|team|regulated` for chain resolution) and the Zero-Trust console, and adds an explicit "what this port does not do" section.
- **`docs/PAPER-ALIGNMENT.md` added.** Traceability of the paper's architecture onto the code: paper section/table, implementing file and symbol, and a status label (`medido` / `construido` / `propuesto` / `brecha declarada`), plus the full G1–G21 → C1–C7/O1–O7 → crosswalk → residue correspondence and fourteen numbered gaps. It states without hedging that the paper's prototype (SteelHarness) is not published; that its measured figures (κ = 0.86 n=15, C4 FPR 20.0 %, the 2.1–2.2 s sweep, the 7/9/12 chain counts) are properties of that prototype and must not be restated as measurements of this repository; that no model backend ships, so C5 and META-EVAL degrade honestly; and that no ON/OFF delta table is published in the paper, so none is invented here.
- **`docs/claims/paper-claims.yaml` added, with an executable runner** — a §9.6-style claims registry of 35 entries, each with a verifier runnable from the repository root and an `expectation` of `pass`/`fail`/`absent`. The product CLI executes it: `assure claims --verify` (dispatched from `cli/commands/paper.ts` to `core/claimsRegistry.ts`). Measured result: `35 claims | 32 verified | 0 declared-gap | 3 not-measured | 0 broken | 0 outdated-text`.
- **`docs/QUICK-START.md` and `docs/INSTALLATION.md` added** — the two filenames the README and other docs referenced but which did not exist. Both are based on the real `--help` output, the agent registry and the `--dry-run`/`--overwrite`/`--lang` flags.
- **`CLAUDE.md` and `AGENTS.md` corrected.** They claimed skills lived in `.claude/skills/sdd-*/SKILL.md` and `.agent/skills/`; neither directory exists in this repository, the shipped skill prefix is `sdd-`, and the templates live under `tools/open-sdd/templates/agents/<agent>/skills/` (160 `SKILL.md` files). Both files now separate "in this repository" from "created in a target project", note that `.sdd/steering/` and `.sdd/memory/` are install targets, correct the progress command to `/sdd-spec-status`, and link to `docs/PAPER-ALIGNMENT.md` and the Zero-Trust console.

### Fixed
- **Shipped settings were never read.** `governance.json` and `git.json` installed into `.sdd/settings/templates/`, while the engine reads them from `.sdd/settings/`. Every project silently ran on hardcoded defaults regardless of what the files said. They now ship to the correct path (all 18 manifests), with a regression test.
- **`npm install` failed on npm 10.** vitest 4's peer graph crashed npm's resolver (`Cannot read properties of null (reading 'edgesOut')`). Pinned a `vite` override so a clean `npm i` works without `--legacy-peer-deps`.
- **Unrendered directory placeholder** leaked into the post-install "Get started" output for every agent.

### Changed
- **Configuration is one line.** `{ "profile": "solo" | "team" | "enterprise" }` sets everything. Explicit fields still override it.
- **The default blocks nothing.** `solo` runs every check and reports; it never fails a run. `team` blocks only code written without an approved spec; `enterprise` blocks everything. Previously `mode` changed a single branch and `critical_gates_only`, `non_blocking_warnings` and `critical_invariants` were read by nothing.
- **A check your profile ignores still reports** as `heads up` — you keep the signal without the friction.
- **Plain language everywhere.** "Critical Invariant Gate G2" is now "Code follows an approved spec"; "Documentary Triad / Gate 0 violation" is now "Implementation started before the spec was approved". Compliance reporting (EU AI Act, NIST) moved behind `--regulatory` instead of fronting the CLI and README.
- **Safer defaults**: fresh installs are `solo` + git `assisted` with `auto_push: false`. Previously governance shipped `fluid` while git shipped `strict` with `auto_push: true`, so a first run could push to a remote.
- A freshly initialised spec no longer fails its checks; they judge work in flight, not intent.

### Added
- `docs/guides/governance-profiles.md` — profiles, what each check means, exit codes for CI.
- 17 tests covering profile resolution, check enforcement and the shipped-settings path.

### Removed
- Four legacy demo specs (`customer-support-rag-backend-{en,ja}`, `photo-albums-en`, `vercel-ai-chatui-research-agent-ja`).
