# Paper alignment — traceability report

**Paper:** *Orquestación SDD-First Multiagente para Desarrollo Enterprise: Una Arquitectura de
Referencia Zero-Trust para Gobernar la Ingeniería de Software Agéntica a Escala* — Mario Alejandro
Ramos (NTT DATA), rev. 3, September 2026, 87 pp. (henceforth "the paper").

**Scope of this report:** how the paper's architecture maps onto the code that now lives in
`tools/cc-sdd/src/core/`, what is implemented, what is a declared gap, and what the paper measured
that this repository does **not** measure. Every row names the file and the symbol that implements
it, so a reader can check the row instead of trusting it.

**What this report is not:** it is not evidence that the implementation works. It is an
*internal-consistency* instrument of exactly the kind the paper describes in §9.6 — prose and
repository agree on what exists, which is a real and narrow property. It would read the same on a
control plane whose gates blocked nothing. Self-audit is accounting; only an independent party
running the §14.3 benches would be evidence.

- Reproduce the claim counts with the product CLI:
  `node tools/cc-sdd/dist/cli.js assure claims --verify`.
- Registry: [`docs/claims/paper-claims.yaml`](claims/paper-claims.yaml).
- Implementation status taxonomy: [§2.3 of the paper](https://doi.org/10.13140/RG.2.2.29185.42087).

---

## 1. Status vocabulary

The paper labels every component `medido` (data with provenance), `construido` (implemented and
exercised in the internal demonstrative harness, SteelHarness) or `propuesto` (design with
acceptance criteria, not built). Table 32 of the paper adds a fourth, external label —
`declarado` — with this caption:

> "'Declarado' significa implementado en un prototipo que el lector no puede inspeccionar, y es por
> tanto epistémicamente equivalente a una afirmación de los autores — fundimos aquí lo que borradores
> anteriores separaban en construido y propuesto, porque la distinción es invisible desde fuera."

| Label used here | Criterion applied to **this** repository |
|---|---|
| `medido` | Raw data with provenance produced **by this repository**: a reproducible command whose output is captured, or a captured artifact. |
| `construido` | Implemented here and exercised by an executable check that a reader can run. |
| `propuesto` | Design present as data/typing/comments, with no execution path. |
| `brecha declarada` | Declared and deliberately **not** implemented, and the code says so at runtime rather than laundering it into a pass. |

**Prototype collapse rule.** The paper's Table 5 caption and Table 32 caption are explicit: because
SteelHarness is not published, an external reader must collapse the paper's own `construido` and
`propuesto` into `declarado`. Everything this report labels `construido` is a claim about **this**
repository's code and is inspectable here; everything attributed to the paper's prototype is
labelled as the paper's, never restated as a measurement of this repository.

---

## 2. Measured result of the claims registry

Command run from the repository root, 2026-09-19:

```
$ node tools/cc-sdd/dist/cli.js assure claims --verify
35 afirmaciones | 32 verificadas | 0 declaradas | 3 no medidas | 0 rotas | 0 desactualizadas
[exit=0]
```

| State (§9.6) | Count | Claims |
|---|---|---|
| `verified` | 32 | CLM-001 … CLM-027, CLM-030, CLM-032 … CLM-035 |
| `not-implemented` (declared gap confirmed) | 0 | — |
| `not-measured` (absence of evidence persists) | 3 | CLM-028 (`docs/lab` absent), CLM-029 (`bin/sh-gate` absent), CLM-031 (`.steelharness/` absent) |
| `broken` (text claims a pass the code does not deliver) | 0 | — |
| `outdated-text` (code improved past the prose) | 0 | — |

In the short vocabulary: **verified = 32, declared-gap = 0, absent/not-measured = 3, broken = 0,
outdated-text = 0** (out of 35).

Observed exit codes, from the run above: **CLM-028, CLM-029 and CLM-031 exited `1`; every other claim
exited `0`.** Both runners print the per-claim code, so the line above can be re-derived rather than
trusted.

Per §9.6, only `broken` halts a publication; there is none. The declaration limit of §9.6 applies
unchanged: **this proves internal consistency, not that what exists works.** One honest detail about
the process itself: an earlier revision of this report and of the registry recorded CLM-030 as a
declared gap, because at that moment no product command read the registry. The CLI then gained
`assure claims --verify`, which turned that entry into `outdated-text` — and the repair was editing
the registry text, never the code, exactly as §9.6 prescribes.

---

## 3. From the logical catalog to the executable chain

### 3.1 The 21 logical gates (Table 33) → the executable chain (Table 34) → the crosswalk (Table 35)

The catalog is data in `tools/cc-sdd/src/core/gateCatalog.ts` (`LOGICAL_GATES`, `EXECUTABLE_CHAIN`).
Inspect with `node tools/cc-sdd/dist/cli.js gates list` and `... gates crosswalk`.

| Logical gate (Table 33) | Tier | Imposed by | Executable? | Note |
|---|---|---|---|---|
| G1 Claridad de Requisitos | Hard | **C1** | yes | EARS conformance + Triad presence |
| G2 Completitud de Contexto | Hard | **O6** | opt-in | file-reference existence only (C8-scoped) |
| G3 Resolución de Dependencias | Hard | **O1** | opt-in | manifest presence + lockfile, not SLSA verification |
| G4 Consistencia Arquitectónica | Structural | **O4** | opt-in | ADRs cited by `plan.md` exist |
| G5 Línea Base de Seguridad | Structural | **C2** | yes (blocking) | secrets / destructive commands / injection patterns |
| G6 Descomposición de Tareas | Structural | **C1** | yes | DAG presence via Triad |
| G7 Cobertura de Riesgos | Structural | — | **residue** | retired to spec-checklist |
| G8 Calidad de Código | QE | — | **residue** | retired to CI |
| G9 Cobertura de Tests | QE | **C3** | yes | evidence lock over completed tasks |
| G10 Integridad de Integración | QE | — | **residue** | retired to CI |
| G11 Seguridad de Regresión | QE | — | **residue** | sustained by the existing test suite (evidence validated by C3) |
| G12 Documentación | QE | **C6** | yes | claims integrity |
| G13 Chequeo de Alucinaciones | Meta | **C4** | yes | symbol membership in this repository, else `undecidable` |
| G14 Chequeo de Consistencia | Meta | **C5** | yes (degrades) | needs a model backend; degrades honestly |
| G15 Alineamiento de Intención | Meta | **C5** | yes (degrades) | same |
| G16 Intercepción MCP | Meta | **O2** | opt-in | declared servers vs allow-list |
| G17 Disciplina de Salida | Transversal | — | **residue** | retired to a mode setting |
| G18 Memoria Viva | Transversal | **O5** | opt-in | inbox distilled within cadence |
| G19 Conocimiento Estructural | Transversal | **O3** | opt-in | index freshness against HEAD |
| G20 Integridad de Afirmaciones | Transversal | **C6** | yes | the same mechanism as this report |
| G21 Disciplina del Implementador | Transversal | **C7** | **vacuous** | `inspects: false`; activation without measurement (§9.7) |

### 3.2 The residue is computed by subtraction, never curated

`computeResidue()` in `gateCatalog.ts` builds the set of logical gates that no entry of
`EXECUTABLE_CHAIN` declares in `imposes`, excluding the vacuous case (which is reported separately,
because "no owner" and "an owner with no instrument" are different defects).

```ts
const covered = new Set(EXECUTABLE_CHAIN.flatMap((c) => c.imposes));
return LOGICAL_GATES.filter((g) => !covered.has(g.id) && g.state !== 'vacuous');
```

`node tools/cc-sdd/dist/cli.js gates crosswalk` reports:

> `21 controles lógicos · 13 ejecutables · 1 vacíos · 16 cubiertos · 5 en el residuo`

| Residue (Table 36) | Tier | Destination recorded in code | Why it has no executable counterpart |
|---|---|---|---|
| G7 Cobertura de Riesgos | Structural | spec-checklist (histórico) | an automatic check would only assert a mitigation field is non-empty — compliance theatre, not coverage |
| G8 Calidad de Código | QE | CI | the project toolchain already owns lint/format; duplicating it adds latency without adding control |
| G10 Integridad de Integración | QE | CI | conflicts/build/suite belong to CI |
| G11 Seguridad de Regresión | QE | existing test suite (evidence validated by C3) | no gate of its own is claimed |
| G17 Disciplina de Salida | Transversal | mode setting | a violation is visible to the reader and damages no artifact; it fails the cost-asymmetry test |

Adding a logical gate, or wiring a new executable check, moves the crosswalk and the residue on
their own. That is the structural property the paper ascribes to its `gen-gate-tables-tex.py`
generator.

### 3.3 Which controls are executable, and the one that is vacuous

- **Executable (13):** C1–C6 and O1–O7 — `inspects: true`.
- **Vacuous (1):** **C7/Karpathy.** `EXECUTABLE_CHAIN` records `inspects: false`; the runtime
  (`enforcement.ts`, `applyDefaultFail`) refuses to let it pass as a control:

  > "Declarado pero vacío: el gate no inspecciona nada, así que no puede acreditar un control
  > (activación ≠ medición)."

  `gates chain` prints it as `vacío (activación ≠ medición)` and `gates chain --profile regulated`
  reports `Declarados: 12 · Ejecutables: 11 · No implementados: 0 · Vacíos: 1`.
- **Declared-but-not-implemented (0 here):** `ExecutableGate.implemented?: boolean` exists precisely
  to carry the paper's §9.5 state "counted in the chain, not executed, reported while the gap
  exists". No entry sets `implemented: false` today, so the profile-executed gap is zero. The field
  is the mechanism; the absence of a user of it is itself an honest statement.

**Why C7 is vacuous and reported.** The paper's own text (§9.7, §8.4) says `gate_C7` returns success
without inspecting anything and that this is the chain's least decidable check. This port encodes
that finding instead of laundering it: `inspects: false` propagates to the CLI, to `applyDefaultFail`
and to the residue computation (G21 is "covered" by a check that measures nothing — the one place
where coverage overstates).

---

## 4. Component-by-component map

| Paper element (§ / Table) | What the code does | File · symbol | Status |
|---|---|---|---|
| Framework definition; four pieces (§5, Table 16) | Grammar, validation chain and evidence binding are implemented. A live constitution is **not** shipped; only templates exist under `.sdd/settings/templates/steering/`. | `ears.ts`, `gateRunner.ts`, `triad.ts`, `.sdd/settings/templates/` | `construido` (3 of 4) · **brecha declarada** (constitution) |
| Invariants I1–I6 (§5.1, Table 17) | Statements + the inspection that decides each; the runtime enforces I1 (authority on verdicts), I2 (evidence lock), I3 (`resolveFloor`/`assertFloorIsOwned`), I6 (receipts). I4 is modelled but not enforced; I5 has no scoping implementation. | `invariants.ts` · `INVARIANTS`; `enforcement.ts`; `receipts.ts`; `metaEval.ts` · `checkJudgeIndependence` | `construido` (I1, I2, I3, I6) · `propuesto` (I4) · **brecha declarada** (I5) |
| Conformity C0–C3 (§5.2, Table 18) | Cumulative levels; `assessConformity` derives the level from evidence and refuses C3 without a measured false-positive rate. | `invariants.ts` · `CONFORMITY_LEVELS`, `assessConformity`, `invariantsNotEvidenced` | `construido`; declared level **C1** (see G-09) |
| Documentary Triad (§4.5, Table 11) | `requirements.md` → `plan.md` → `tasks.md`; `design.md` accepted as a **declared** alias of `plan.md`; presence verdict explicitly labelled "approves by proxy". | `triad.ts` · `TRIAD`, `evaluateTriad`; `specManager.ts` · `parseTasksMarkdown`, `parseRequirementsMarkdown` | `construido` |
| Evidence lock / `_Evidence:` (I2, §4.5) | A completed task without a captured `_Evidence:` line is rejected; C3 runs it over `tasks.md`. | `triad.ts` · `EVIDENCE_MARKER`, `checkEvidenceLock`; `gateRunner.ts` · `runGate('C3')` | `construido` |
| EARS grammar (§4.6, Table 12) | Five templates, `shall` required, exactly-one-template diagnostic, vague-term list, compound-requirement heuristic, negative-requirement gap report, declared limit. | `ears.ts` · `EARS_TEMPLATES`, `validateEarsRequirement`, `validateRequirements`, `negativeRequirementGap`, `EARS_LIMIT` | `construido` |
| Applicability + rigor levels (§4.8, §4.10, Tables 13/14) | Decision function for `none/lite/spec-first/spec-anchored/spec-as-source` from discard-by-design, scope, misreading cost, reversibility, audit exposure and complexity. | `hitl.ts` · `selectRigorMode`, `RIGOR_POLICY`; CLI `govern rigor` | `construido` as a decision function · `propuesto` as an adaptive engine wired to runs |
| When not to delegate (§4.7) | Two non-capacity escalations: irreversible unbounded damage, and nobody able to evaluate the output. | `hitl.ts` · `evaluateEscalations` (`irreversible-damage`, `no-local-evaluator`) | `construido` (criteria) |
| Enforcement levels A–D and the per-tool ceiling (§6.3, Table 19) | Levels, ownership, per-tool write ceiling with caveats, sentinel semantics (`exit 2` blocks; `exit 1` is read as hook failure → fail-open), ceiling-vs-floor resolution. | `enforcement.ts` · `ENFORCEMENT_LEVELS`, `TOOL_ENFORCEMENT`, `DEFAULT_SENTINEL`, `interpretSentinel`, `resolveFloor`, `assertFloorIsOwned`; CLI `gates enforcement` | `construido` (model) · **brecha declarada** (no host hooks/adapters shipped — see G-11) |
| default-FAIL and the hard subset (§9.2) | Two regimes; the default is the flexible one; an unavailable sensor self-authorizes with a receipt except in the hard subset; a scanner that fired never self-authorizes. | `enforcement.ts` · `HARD_SUBSET`, `applyDefaultFail`, `posturePasses`, `unresolvedReceipts` | `construido` |
| Control admission criterion A1–A3 (§9.3) | Each logical gate carries `admission: { silence, independence, costAsymmetry }`, derived and shown per row so a reader can disagree with one row rather than an accumulated count. The A2 co-activation measurement is not performed (the paper reports its own failure in §9.4). | `gateCatalog.ts` · `AdmissionCriteria`, `LOGICAL_GATES[].admission` | `construido` (recorded flags) · **brecha declarada** (A2 measurement) |
| Chain resolution + signals (§9.5, Tables 33–36) | Core constant; opt-in activated by profile or by a repository signal, each activation citing the signal; declared/executed/vacuous reported separately. | `gateCatalog.ts` · `resolveGateChain`, `detectSignals`, `buildCrosswalk`, `computeResidue`, `catalogSummary`; `cli/commands/paper.ts` · `detectRepoSignals` | `construido` |
| The gate runner (§9.2, §9.5) | One branch per control; every branch reports **sensor availability** and **fired** separately. C1 runs `evaluateTriad` + EARS; C2 `scanSecurity`; C3 evidence lock; C4 `buildSymbolIndex`/`checkSymbols`; C5 declares itself degraded; C6 checks referenced docs exist; C7 returns vacuous; O1–O7 check their artifact. | `gateRunner.ts` · `runGate`, `runChain`, `scanSecurity`, `buildSymbolIndex`, `checkSymbols`, `HARD_CONTROL_BY_GATE` | `construido` |
| Hallucination check C4/G13 and the declared verdict domain (§8.4) | `present` / `absent` / `external` / `undecidable`; only a symbol whose prefix is a module of this repository is judgeable. The index is built in-process; there is no cached `.sdd/.graph` index and no labelled corpus. | `gateRunner.ts` · `SymbolVerdict`, `checkSymbols`, `buildSymbolIndex` | `construido` (domain logic) · **brecha declarada** (index cache and FPR bench — see G-03) |
| META-EVAL protocol (§7.3, §7.4) | Cohen's κ, Landis–Koch band, preregistered `n = 120`, approval-drift monitor (>2σ), blind-sentinel self-preference test, judge-family independence with honest downgrade to advisory, the three judge biases, the temperature-zero note. | `metaEval.ts` · `cohensKappa`, `checkApprovalDrift`, `checkSelfPreference`, `checkJudgeIndependence`, `JUDGE_BIASES`, `DETERMINISM_NOTE`; CLI `govern meta-eval` | `construido` (model) · `propuesto` (confirmatory study at n ≥ 120; no live judge) |
| Transactional waves (§7.2) | States, six stated invariants, all-or-nothing `resolveWave`, scope gate, worktree/branch/identity assignment, and the git commands that would materialise the wave. Parallelism is bounded by DAG frontier; the deadlock fallback force-picks one task. | `waves.ts` · `WaveState`, `WAVE_INVARIANTS`, `resolveWave`, `checkScope`, `planWorktrees`, `waveGitCommands`; `scheduler.ts` · `buildTaskDependencyWaves`; CLI `waves` | `construido` (plan and rules) · **brecha declarada** (no executor runs the git commands — see G-10) |
| HIL thresholds (§9.9, Table 25) | All published thresholds as configuration, with the "uncalibrated starting values" caveat attached and the complexity scale declared non-transferable. | `hitl.ts` · `HITL_DEFAULTS`, `evaluateEscalations`, `calibrateEscalationThreshold`; CLI `govern hitl` | `construido` · `propuesto` (the quarterly calibration run) |
| Appeal channel + relaxation receipts (I6, §9.10) | Mandatory actor/reason/hash on every receipt, override journal, ≥20 % sustained → design review, `assessI6`, accepted-risk ledger. Journal path `.sdd/receipts.json` (absent in a fresh checkout → zero relaxations, I6 satisfied vacuously by emptiness). | `receipts.ts` · `makeReceipt`, `recordOverride`, `recalibrate`, `assessI6`, `acceptedRiskLedger`; CLI `govern appeal` | `construido` |
| Memory mesh + distillation + anti-poisoning (§11, Figure 8) | Three backends; capture → distillation → promotion → injection with quarantine; provenance signature; injection-pattern scanner; promotion gate requiring provenance, no origin-withdrawal, clean scan and G5 screening; decay/degradation; living-memory cadence. | `memory.ts` · `MEMORY_MESH`, `MEMORY_PIPELINE`, `scanForInjection`, `decidePromotion`, `applyDecay`, `evaluateLivingMemory`; CLI `assure memory` | `construido` |
| Auto-Skill Factory (§11.1, Table 28) | Candidates, not skills; non-empty MCP declaration rejects; judge ≠ author; judge family ≠ generator family; ≥2 observations; born with a review date; expiry on two activation cycles or a vanished pattern. | `skills.ts` · `PROMOTION_LADDER`, `SKILL_METRICS`, `evaluateCandidate`, `evaluateCandidateExpiry` | `construido` |
| Skills as the unit of privilege (§6.4) | Four classes and their failure modes; three-level progressive disclosure; hard rule that no skill widens the reachable MCP set; bidirectional permission check; third-party policy. | `skills.ts` · `SKILL_CLASSES`, `PROGRESSIVE_DISCLOSURE`, `checkMcpPermissions`, `checkBidirectionalPermissions`, `THIRD_PARTY_SKILL_POLICY`; CLI `assure skills` | `construido` (rules) · `propuesto` (live MCP proxy / concession registry file) |
| Threat model and regulatory crosswalk (§9.8, Table 24; Appendix D, Table 39) | OWASP Agentic → ATLAS → primary gates → complementary control; harness control → EU AI Act / NIST AI RMF / ISO 42001; the "Zero-Trust borrowing boundary" of §9.1 (what is claimed, what is not). | `assurance.ts` · `OWASP_AGENTIC_MAP`, `REGULATORY_MAP`, `REGULATORY_CONTEXT`, `ZERO_TRUST_BOUNDARY`; CLI `assure threats` | `construido` (data tables) |
| Risk lab and refutation thresholds (§14.3, Table 31) | Five banks with purpose, artifact and standard mapping; preregistered refutation thresholds with status `measured`/`preregistered`; fixed artifact format; adversarial-validator steps; three exit questions. | `assurance.ts` · `RISK_LAB_BANKS`, `REFUTATION_THRESHOLDS`, `LAB_ARTIFACT_FIELDS`, `LAB_EXIT_QUESTIONS`, `ADVERSARIAL_VALIDATOR`; CLI `assure lab` | `construido` (protocol data) · `propuesto` (the benches are not run here) |
| Overhead budget and telemetry (Appendix B.4–B.6, §10.3) | Three cost lines (only the human one does not fall with model prices); 30 % ceiling with expensive-first degradation; 70 % compaction trigger with its four steps; operational metric definitions; ON/OFF comparison function; T0–T3 routing and escalation; harness self-failure asymmetry. | `telemetry.ts` · `COST_LINES`, `evaluateGovernanceBudget`, `CONTEXT_COMPACTION_TRIGGER`, `evaluateCompaction`, `METRIC_DEFINITIONS`, `compareLoopEconomy`, `COMPLEXITY_TIERS`, `routeModel`, `escalateTier`, `HARNESS_SELF_FAILURE`; CLI `govern budget` | `construido` (policy) · **brecha declarada** (no telemetry recorded here) |
| Manuscript as executable contract (§9.6) | Five claim states with the rule that only `broken` halts publication; `evaluateClaim`, `assessClaims`, the generator limit; implementation-status inventory `measured/built/proposed` with the defensive rule that no proposed component participates in today's guarantees; the registry is executed by the CLI, not only printed. | `claims.ts` · `CLAIM_STATUSES`, `evaluateClaim`, `assessClaims`, `renderClaimsSummary`, `CLAIMS_REGISTRY_LIMIT`, `IMPLEMENTATION_STATUSES`, `auditInventory`; `claimsRegistry.ts` · `parseClaimsRegistry`, `runClaimsRegistry`; `cli/commands/paper.ts` · `assure claims --verify`; `docs/claims/paper-claims.yaml` | `construido` |
| Brownfield inversion (§12, Figure 9, Tables 40/41) | A heuristic project scan detects language, package manager, frameworks, source/test dirs and modules, then writes descriptive steering (`product.md`, `tech.md`, `structure.md`) and spec seeds. It does **not** extract behaviour from running code, does not build a regression oracle, and emits no `ADDED/MODIFIED/REMOVED` delta markers. | `reverseEngineering.ts` · `scanProject`, `bootstrapSteering`, `bootstrapSpecSeeds`; CLI `getspecs` | **brecha declarada** (partial) — see G-12 |
| Agent-agnostic installation (§6.4 progressive disclosure; Table 4) | 15 agent definitions; 8 skills-based variants × 20 skills = 160 `SKILL.md` templates; per-agent layout, alias flags and completion guides. | `agents/registry.ts` · `agentDefinitions`, `agentList`; `tools/cc-sdd/templates/agents/**` | `construido` |
| Governance profiles (repo-level) and chain profiles (§9.5) | Two distinct axes: `governance.json` ships `solo|team|enterprise` (what blocks); the Zero-Trust chain resolver accepts `solo|team|regulated` (which controls are declared). | `governance.ts` · `governanceProfiles`, `resolveGovernanceSettings`; `gateCatalog.ts` · `ChainProfile`, `PROFILE_MANDATED` | `construido` — but see G-08 (naming divergence) |

---

## 5. Gaps between the paper and this implementation

Each gap is stated plainly, with the paper section and the code location.

### G-01 — The prototype (SteelHarness) is not published

Paper: Table 5 caption, Table 32 caption, §16 "Nota sobre el prototipo"; retracted-conjecture
history in §1. An external reader **must** collapse the paper's `construido` and `propuesto` into
`declarado`. Nothing in this repository makes the prototype's artifacts inspectable: there is no
`.steelharness/`, no `configs/gates.yaml`, no `bin/sh-gate`, no `bin/sh-claims`, no
`docs/feature-status.md`, no `docs/lab/`. Claims CLM-028/029/031 confirm three of those absences by
exit code. Where this report says a paper element is `construido`, it means *in this repository*,
never *in the paper's prototype*.

### G-02 — The paper's measured numbers are properties of the prototype, not of this repository

These figures may **not** be restated as measurements of `open-sdd`:

| Figure | Paper locus | Why it must not be restated here |
|---|---|---|
| κ = 0.86, n = 15, 5 TP / 1 FN / 0 FP / 9 TN, `mode=ollama` | §7.4, §14.1, §14.2, Table 5 | No live judge and no sentinel corpus exist here. `metaEval.ts` reproduces the coefficient from the hardcoded confusion matrix to exercise the arithmetic; `cohensKappa` flags `tooSmallToConclude: true`. The console prints the **paper's** pilot label, not a fresh measurement. |
| C4 FPR = 20.0 % (3/15), specificity 0.8000, Wilson CI [0.5481, 0.9295] | §8.4, §14.2, Table 31 | Calculated over the prototype's balanced n=30 corpus, which this repository does not ship. `assurance.ts` stores the string as the `measured` value of the `c4-fpr` threshold — a transcription, not a local run. |
| Full sweep 2.1–2.2 s; symbol check 61 s → <1 s; index built at commit close | §9.5, §14.1 | There is no `bin/sh-gate` and no cached index here (CLM-029). `gates run` executes the TS runner over the current tree; no sweep latency is claimed. |
| Chain sizes 7 / 9 / 12 on the implementation repository | §9.5 | `gateCatalog.ts` reproduces the **policy** that yields 7/9/12 on a repository matching the paper's profile. The counts here fall out of `PROFILE_MANDATED` and detected signals; they are not a re-measurement of the paper's repository. |
| −53 % wasted context tokens, ~−40 % cost per session | Appendix B.1 | One-installation pilot of the prototype; no equivalent instrumentation exists here. |
| `sh-claims --check` → OK (14 real, 0 stub, 0 spec-only); e2e 6/6 | §14.1, Table 5 | Neither the `sh-claims` tool nor the `tests/e2e/e2e_runner.py` harness is shipped here. |

This is the paper's own rule applied to this report: a figure whose instrument cannot be named is
withdrawn rather than repeated (§12.3, §16).

### G-03 — No labelled corpus, no gate calibration, no measured false-positive rate

Paper: §9.3/§9.4 (A2 measurement failed), §14.2 (C4 FPR threshold reached), §14.4 open problem 1,
Table 31. This repository implements the *catalog* of controls and the *protocol data* of the five
lab banks, but runs none of them: `docs/lab/` does not exist (CLM-028). Consequently:

- C3 conformity (Table 18) is **not claimed**; `govern conformance` reports **C1**.
- The "calibration is a security control" thesis (§15, item 4) is argued in `assurance.ts`, not shown.
- The FN/FP/latency table that bench 3 would produce has no data here, and inventing it is the exact
  defect `claims.ts` exists to prevent.

### G-04 — No model backend: C5 and META-EVAL judging degrade honestly

Paper: §7.3 (judge heterogeneity as a *requirement*), §16 limitation 8 (the prototype itself did not
always satisfy it), §B.5 (model-judgment controls fail open, record, mark unaudited). Here
`gateRunner.ts` always reports `sensorAvailable: false` for C5 with
`mode=degraded: … NO cuenta como evidencia de alineamiento de intención`. Under the default flexible
regime that self-authorizes and requires an I6 receipt; under `strict` (chain profile `regulated`)
it fails. `checkJudgeIndependence` implements the family rule but with one provider it can only
return `advisory`. Intent alignment (G15) and session consistency (G14) are therefore **not
measured** in this repository, and META-EVAL is a computational model, not a running judge.

### G-05 — No ON/OFF delta table exists in the paper, so none is invented here

Paper: §14.1 sends the reader to "el protocolo de la tabla anterior"; §17 refers to "los deltas del
piloto de la Sección 14.3" — but **no ON/OFF delta table is published anywhere in the paper**.
`telemetry.ts` provides `compareLoopEconomy` to compute tokens/task, iterations, escalations and
latency deltas from two `LoopEconomy` records; no records exist. The harness-ON vs harness-OFF claim
(Table 30) is unimplemented here and unpublished there.

### G-06 — The §9.7 decidable properties are exposed, but not as chain gates

Paper: §9.7, §8.4. `triad.ts` implements `checkDecidableDiscipline` — diff budget, scope
containment, declared-uncertainty — and `NON_DECIDABLE_DISCIPLINE_NOTE`, and the Zero-Trust console
now runs them over the working tree: `govern discipline` reads the pending diff, applies the
declared budget (`SDD_MAX_LINES` / `SDD_MAX_FILES`) and scope (`SDD_SCOPE`), and exits `1` on a
decidable violation.

Two limits remain honest rather than papered over. First, **no chain gate calls them**: C7 still
returns "activación sin medición", which is the paper's own finding about `gate_C7` and is not
laundered here, so the properties inform a human rather than blocking a wave. Second, of the three,
only **diff budget and scope containment** are decidable from a diff; `declared-uncertainty` is
reported as `no medible` because it needs the assumption register, which this call does not receive.
Reporting `ok` for a property nobody inspected would be exactly the vacuity the paper rejects — an
acknowledged gap is worth more than a weak check.

### G-07 — The claims registry is wired, and it registers more than the paper's did

Paper: §9.6 (`./bin/sh-claims verify` against `docs/claims/paper-claims.yaml`). The product CLI now
runs the registry directly: `assure claims --verify` → `claimsRegistry.ts` · `parseClaimsRegistry`,
`runClaimsRegistry`, dispatched from `cli/commands/paper.ts`; it reports the five states and exits
`1` only on `broken`. There is exactly one runner: a second, documentation-side copy was removed
rather than left to drift against the product command. Two declared differences from the paper's run:

- The registry holds **35 claims**, not the paper's 33, because it registers this port's components.
- The **three `not-measured` entries are the honest residue of the unpublished prototype** (no
  `docs/lab`, no `bin/sh-gate`, no `.steelharness/`): the paper's own instrument cannot decide them
  from here, and this report does not pretend otherwise.

### G-08 — Two different profile axes, with different names

- `governance.json` (shipped) accepts `solo | team | enterprise` — this decides what **blocks**
  (`governance.ts`, `governanceProfiles`).
- `gates chain --profile` accepts `solo | team | regulated` — this decides which Zero-Trust
  **controls are declared** (`gateCatalog.ts`, `ChainProfile`, `PROFILE_MANDATED`).

They are not the same axis and the names do not line up: `enterprise` is not accepted by
`--profile`, and `regulated` is not accepted by `governance.json`. Whether this is a defect or a
deliberate separation (blocking policy vs. chain resolution) is not settled by the paper — it
publishes one instance, not two vocabularies. Treat the two tables as independent.

### G-09 — Conformity is claimed at C1 here, whereas the paper claims C2 for its instance

Paper: Table 18 caption — the described instance claims **C2**, with I5 partially satisfied and I6
satisfied only since receipts exist; C3 requires measurements not performed. In this repository
`govern conformance` declares **C1** and reports `I4 no cumple` (needs a different-family judge and
an agent-identity registry) and `I5 no cumple` (the per-change constraint scope is declared but not
measured). This is a real disagreement between the paper's self-assessment and what this instance can
evidence, and it is resolved in the honest direction: the instance claims less, not more.

### G-10 — Waves are planned and specified, not executed

Paper: §7.2 (state: built). `waves.ts` implements the state machine, the six invariants, the
all-or-nothing `resolveWave`, the scope gate, worktree/identity assignment and the git command
generation; `scheduler.ts` builds the DAG waves. The `waves <feature>` command **prints** the plan
and the commands; nothing runs them (`planWorktrees`/`waveGitCommands`/`resolveWave` are not invoked
by an executor). There is no swarm runtime, no worktree lifecycle, and no provenance graph. Note also
that `buildTaskDependencyWaves` defaults to `maxParallel = 4` — the paper explicitly publishes **no**
numeric cap (§7.2, "no numeric max-subagents value is published"), so this is an implementation
choice, not a transcription. Additionally, `waves <feature>` needs `.sdd/specs/<feature>/tasks.md`;
with none it exits 1 with `Sin tasks.md en .sdd/specs/<feature>/`.

### G-11 — The commit/merge floor is declared, not installed here

Paper: §6.3, §16.1, Table 19 caption — the floor is B (commit) and C (merge) because those boundaries
belong to the organization. `resolveFloor` returns `floor: B, C` for every known tool **by ownership
reasoning**, before any installation is verified. But this repository ships **no pre-commit/pre-push
hooks and no CI gate workflow**: `.github/workflows/` contains only `publish.yml`, `stale.yml`,
`claude.yml` and `claude-dispatch.yml`. So the floor is a design property of the boundary, not a
verified property of this installation. The paper's own reading rule applies (§6.3): the table
describes the *ceiling a tool allows*, and only a periodically re-run behavioural sentinel (probe
must return the host's exact blocking code) establishes the floor. No sentinel is run here; the
console prints `interpretSentinel(1)` as a warning, which is a demonstration of the semantics, not a
verification of this installation.

### G-12 — Brownfield is a heuristic bootstrap, not spec extraction as regression oracle

Paper: §12, Figure 9, Tables 40/41. `reverseEngineering.ts` scans for `package.json` / `Cargo.toml` /
`go.mod` / `pyproject.toml`, detects language, frameworks, package manager and source/test
directories, then writes descriptive steering and up to five spec seeds (`initSpec`). It does not
derive behaviour from the running system, it builds no regression oracle, and it emits no
`ADDED/MODIFIED/REMOVED` delta sections (a repository-wide grep for those markers in
`tools/cc-sdd/src` returns nothing). The descriptive-constitution step is partially honoured by the
generated `tech.md`/`structure.md` ("the stack as an established fact"), but the central inversion of
§12 — the extracted specification as the thing modernization must preserve — is not implemented.

### G-13 — Provenance, MCP mediation and sandboxes are represented, not enforced

Paper: §6.1/§6.2 (harness countermeasures), Table 5 rows 4 and 7. `assurance.ts` maps
`AML.T0010`/SLSA and defines the complementary controls; `skills.ts` enforces the MCP *rule* on
declared data. But there is no stdio MCP proxy, no per-role allow-list enforcement at a boundary, no
in-toto/SLSA attestation, no sandbox-of-record, and no destructive-command interception in an
enforcement layer before content evaluation (the destructive patterns appear only as C2 content
scanning of changed files). These are `propuesto` in this repository, consistent with the paper's own
Table 5 labelling of full taint-tracking and microVMs as `propuesto`.

### G-14 — I5 (minimum privilege applied to attention) is declared, not measured

Paper: §5.1 (I5), §6.4 (skills selection from the impact graph, not agent judgement), Table 8
(Marri n=1 attention-budget evidence). `skills.ts` states the principle and the class taxonomy, but
nothing scopes the loaded constraint set to a change's impact radius, and nothing resolves skill
selection from an impact graph. `govern conformance` records `I5 no cumple`. The consequence the
paper names — a governance corpus degrading past the attention budget it is read with — is
acknowledged and unrepaired here.

---

## 6. Where the paper and the code genuinely disagree

1. **Conformity level** — paper claims C2 for its described instance (Table 18 caption); this code
   declares C1 because I4 and I5 are unsatisfied (`govern conformance`). Section reference: §5.2,
   Table 18. Code: `invariants.ts` · `assessConformity`, `cli/commands/paper.ts` · `govern conformance`.
2. **C7/Karpathy** — the paper's Table 33 says G21 was "previsto como bloqueo"; the executable chain
   classifies C7 as `ejecutable` because its body branches, while §8.4 says it checks nothing. This
   code resolves the tension by adding a third state, `inspects: false` → `vacío`, and refusing to
   count it as a passing control. Section reference: §9.7, §8.4, Table 33 row G21. Code:
   `gateCatalog.ts` · `EXECUTABLE_CHAIN['C7']`, `enforcement.ts` · `applyDefaultFail`.
3. **Profile vocabulary** — one published instance in the paper, two independent axes here
   (`enterprise` vs `regulated`); see G-08. Code: `governance.ts` · `governanceProfiles`;
   `gateCatalog.ts` · `ChainProfile`.
4. **Level B/C floor** — the paper asserts the floor is universal and cheap ("cuesta una tarde de
   trabajo"); this repository ships neither the hooks nor the CI matrix, so the floor is
   declaration-only here (G-11). Section reference: §6.3, Table 19 caption, §16.1.
5. **`implemented: false` gap** — the paper's §9.5 describes a period where the regulated profile
   declared 12 controls and executed 7. This port models that state (`ExecutableGate.implemented`)
   but has no gate in it, so the declared-vs-executed gap reads zero. That is a difference in
   state, not a contradiction, but a reader should not read "0 no implementados" as evidence that
   the paper's gap was closed by this port.

---

## 7. Reading rules for anyone citing this report

1. Do **not** cite the paper's prototype figures as measurements of `open-sdd` (G-02).
2. Do **not** cite METR / GitClear / DORA (§1, Table 2, §16 limitation 6) as evidence *for* this
   harness — they establish the problem, not the remedy.
3. Do **not** present the gate-tier firing distribution (§14.1/§14.2) as a measure of prevented
   defects; the paper itself reclassifies it as a design sanity check (§15).
4. `default-FAIL` is exact only for the hard subset and for strict mode; process gates start
   flexible and self-authorize with a receipt (§9.2, §16 limitation 9).
5. No `propuesto` component participates in today's security guarantees (§2.3 defensive reading);
   `assure claims` states this at runtime.
6. Where prose and this report disagree, the running system is ground truth and the sentence is the
   bug — the paper's own rule ("Donde la prosa y el prototipo demostrativo discrepen, el sistema en
   ejecución es la verdad de terreno y la frase es el bug", §9.6 prototype note).
