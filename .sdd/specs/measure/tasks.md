# Tasks — measure
- [x] 1. Calibration corpus and `assure calibrate` — _Requirements: REQ-S3-001_ — _Boundary:_ `tools/open-sdd/src/core/calibrate.ts`, `tools/open-sdd/src/cli/commands/paper.ts`, `tools/open-sdd/src/cli/commands/help.ts`, `docs/MEASUREMENTS.md`
- [x] 2. Trust mutants — _Requirements: REQ-S3-002_ — _Boundary:_ `scripts/mutation.mjs`
- [x] 3. One source — _Requirements: REQ-S3-003_ — _Boundary:_ `scripts/sync-templates.mjs`, `tools/open-sdd/templates/`, `tools/open-sdd/src/core/commandTemplates.ts`, `package.json`, `.github/workflows/gates.yml`
- [x] 4. Tests, dist, docs, claims — _Requirements: all_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `HANDOFF.md`, `CLAUDE.md`, `.sdd/specs/measure/`

_Evidence (2026-10-23): `test/sprint3.test.ts` 6/6 green; `mutation.mjs --family trust` 5/5 killed; `assure calibrate` audit-chain κ 0.70, escalation κ 0.85, EARS κ 0.75, precision 1.00 each; `sync:templates:check` clean; full suite 175 files / 2518 tests green._
