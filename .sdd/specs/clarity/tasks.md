# Tasks — clarity
- [x] 1. Level sets the governance floor — _Requirements: REQ-S2-001_ — _Boundary:_ `tools/open-sdd/src/core/levels.ts`, `tools/open-sdd/src/core/trustFloor.ts`, `tools/open-sdd/src/cli/commands/modernize.ts`, `tools/open-sdd/src/cli/commands/paper.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`
- [x] 2. Weakest-link headline — _Requirements: REQ-S2-002_ — _Boundary:_ `tools/open-sdd/src/core/sddScore.ts`
- [x] 3. Findings scoped to the change — _Requirements: REQ-S2-003_ — _Boundary:_ `tools/open-sdd/src/core/gateRunner.ts`
- [x] 4. Tests, dist, docs, claims — _Requirements: all_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `HANDOFF.md`, `.sdd/specs/clarity/`

_Evidence (2026-10-23): `test/sprint2.test.ts` AC-01…AC-03 — 3/3 fail on the previous code, 3/3 pass; full suite green._
