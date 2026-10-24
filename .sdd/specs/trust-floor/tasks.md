# Tasks — trust-floor
- [x] 1. Audit chain and critical code — _Requirements: REQ-TF-002_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/core/trustFloor.ts`, `tools/open-sdd/src/cli/commands/paper.ts`
- [x] 2. Approvers and CI in setup — _Requirements: REQ-TF-001, REQ-TF-003_ — _Boundary:_ `tools/open-sdd/src/cli/commands/init.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`
- [x] 3. C5 fail-closed and check escalation — _Requirements: REQ-TF-004, REQ-TF-005_ — _Boundary:_ `tools/open-sdd/src/cli/commands/paper.ts`, `tools/open-sdd/src/core/trustFloor.ts`, `tools/open-sdd/src/index.ts`
- [x] 4. Tests, dist, docs, claims — _Requirements: all_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `HANDOFF.md`, `.sdd/specs/trust-floor/`

_Evidence (2026-10-23): `test/trustFloor.test.ts` AC-01…AC-05b — 5/5 fail on the previous code, 6/6 pass; full suite 173 files / 2509 tests green; claim CLM-085. Independent review (Sonnet) applied: a parked `_check` re-presents a fresh card (no dead end); `check` neither blocks nor escalates under `CI`; approvers.json omits empty fields. Declared gaps: tail truncation of an audit log is undetectable without an external anchor; concurrent appends can break the chain; audit logs merged across branches break it; with no spec the feature falls back to `governance`._
