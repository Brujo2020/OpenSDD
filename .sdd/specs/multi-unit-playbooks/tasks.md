# Implementation Plan — multi-unit-playbooks

## Tasks

- [x] 1. Profile detector — _Requirements: REQ-PB-002_ — _Boundary:_ `tools/open-sdd/src/core/profile.ts`
  - Done when: AC-02 passes.
- [x] 2. (P) Directive schemas, `next` and `report` — _Requirements: REQ-PB-006_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/cli/commands/engine.ts`
  - Done when: AC-05 passes.
- [x] 3. (P) Question files and answer checker — _Requirements: REQ-PB-013_ — _Boundary:_ `tools/open-sdd/src/core/questions.ts`
  - Done when: empty `[Answer]:` exits 1; confirmation id recorded.
- [x] 4. (P) Memory capture, reflector schema, admission gate — _Requirements: REQ-PB-014_ — _Boundary:_ `tools/open-sdd/src/core/memory.ts`
  - Done when: AC-13 passes.
- [x] 5. `multi-unit` project type — _Requirements: REQ-PB-001_ — _Depends:_ `1`_ — _Boundary:_ `tools/open-sdd/src/core/sddModes.ts`
  - Done when: AC-01 passes.
- [x] 6. Playbook loader, step catalogue and checker — _Requirements: REQ-PB-003_ — _Depends:_ `1`_ — _Boundary:_ `tools/open-sdd/src/core/playbook.ts`, `tools/open-sdd/templates/playbooks/aidlc-stages.json`
  - Done when: AC-03 passes; unknown keys exit 1.
- [x] 7. Promotion, injection index, dedupe, withdraw — _Requirements: REQ-PB-015_ — _Depends:_ `4`_ — _Boundary:_ `tools/open-sdd/src/cli/commands/memory.ts`
  - Done when: AC-14 passes.
- [x] 8. HIL cards, seeded ids, `hil answer`, approval ladder — _Requirements: REQ-PB-012, REQ-PB-013_ — _Depends:_ `2`, `3`_ — _Boundary:_ `tools/open-sdd/src/core/hitl.ts`, `tools/open-sdd/src/cli/commands/hil.ts`
  - Done when: AC-11 and AC-12 pass.
- [x] 9. Library playbooks and planner — _Requirements: REQ-PB-004_ — _Depends:_ `6`_ — _Boundary:_ `tools/open-sdd/src/core/playbookPlanner.ts`, `tools/open-sdd/templates/playbooks/`
  - Done when: AC-04 passes.
- [x] 10. Handoff pack, recall check, stale propagation — _Requirements: REQ-PB-008_ — _Depends:_ `2`, `6`, `7`_ — _Boundary:_ `tools/open-sdd/src/core/handoff.ts`
  - Done when: AC-07 passes.
- [x] 11. Artifact guard, review receipts, freeze, phase trace — _Requirements: REQ-PB-009, REQ-PB-010_ — _Depends:_ `2`_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/core/reviewReceipts.ts`, `tools/open-sdd/templates/hooks/`
  - Done when: AC-08 and AC-09 pass.
- [x] 12. Wave referee — _Requirements: REQ-PB-007_ — _Depends:_ `2`_ — _Boundary:_ `tools/open-sdd/src/core/waveReferee.ts`
  - Done when: AC-06 passes.
- [x] 13. `sdd-playbook` skill — _Requirements: REQ-PB-005_ — _Depends:_ `9`_ — _Boundary:_ `tools/open-sdd/templates/agents/_shared/skills/sdd-playbook/`
  - Done when: present in every skills tree; CLM-027 green.
- [x] 14. Playbook build for every host — _Requirements: REQ-PB-018_ — _Depends:_ `9`, `2`_ — _Boundary:_ `tools/open-sdd/src/core/playbookBuild.ts`
  - Done when: AC-17 passes.
- [x] 15. AI-DLC plugin, importer, read-only status — _Requirements: REQ-PB-011_ — _Depends:_ `14`_ — _Boundary:_ `tools/open-sdd/templates/integrations/aidlc-plugin/opensdd/`, `tools/open-sdd/src/core/importers.ts`, `tools/open-sdd/src/core/aidlc.ts`, `tools/open-sdd/src/cli/commands/status.ts`
  - Done when: AC-10 passes (or reported not run without the AI-DLC runtime). — AC-10 NOT RUN (2026-10-23): no AI-DLC runtime; plugin fail-closed covered by `test/aidlcPlugin.test.ts`.
- [x] 16. HIL statistics and threshold proposals — _Requirements: REQ-PB-016_ — _Depends:_ `8`_ — _Boundary:_ `tools/open-sdd/src/core/hilCards.ts`
  - Done when: AC-15 passes.
- [x] 17. `playbook improve` — _Requirements: REQ-PB-017_ — _Depends:_ `7`, `9`, `16`_ — _Boundary:_ `tools/open-sdd/src/core/playbookImprove.ts`
  - Done when: AC-16 passes.
- [x] 18. Docs, help, claims — _Requirements: REQ-PB-001…018_ — _Depends:_ `5`, `10`, `11`, `12`, `13`, `15`, `17`_ — _Boundary:_ `docs/guides/playbooks.md`, `docs/INSTALL.md`, `tools/open-sdd/src/cli/commands/help.ts`, `docs/claims/paper-claims.yaml`
  - Done when: one claim per offline AC; `assure claims --verify` 0 broken.

- [x] 19. CLI routing, MCP tools and tests (added 2026-10-23, plan D-3/D-5) — _Requirements: REQ-PB-002, REQ-PB-018_ — _Depends:_ `2`, `8`, `10`, `11`, `12`_ — _Boundary:_ `tools/open-sdd/src/index.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`, `tools/open-sdd/src/mcp/tools.ts`, `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `tools/open-sdd/templates/integrations/`, `.sdd/specs/multi-unit-playbooks/`
  - Done when: every new command routes, has help (`cliHelpContract`), and `test/playbookCli.test.ts` passes.

## Waves (computed by `open-sdd waves`)

| Wave | Tasks |
|---|---|
| 1 | 1, 2, 3, 4 |
| 2 | 5, 6, 7, 8 |
| 3 | 9, 10, 11, 12 |
| 4 | 13, 14, 16 |
| 5 | 15, 17 |
| 6 | 18 |
