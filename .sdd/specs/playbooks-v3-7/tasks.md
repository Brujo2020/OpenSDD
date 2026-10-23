# Tasks — playbooks-v3-7

- [x] 1. Verifiable approver and deadlines — _Requirements: REQ-V37-001, REQ-V37-002_ — _Boundary:_ `tools/open-sdd/src/core/hilIdentity.ts`, `tools/open-sdd/src/core/hilCards.ts`, `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`
  - Done when: AC-01, AC-02 pass.
- [x] 2. Unbiased improvement — _Requirements: REQ-V37-004_ — _Boundary:_ `tools/open-sdd/src/core/playbookImprove.ts`
  - Done when: AC-04 passes.
- [x] 3. Telemetry and auto-capture — _Requirements: REQ-V37-005, REQ-V37-006_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`, `tools/open-sdd/src/mcp/tools.ts`
  - Done when: AC-05, AC-06 pass.
- [x] 4. Scale- and risk-aware planner — _Requirements: REQ-V37-007_ — _Boundary:_ `tools/open-sdd/src/core/playbookPlanner.ts`
  - Done when: AC-07 passes.
- [x] 5. Units, waves and lock — _Requirements: REQ-V37-008_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`
  - Done when: AC-08 passes.
- [x] 6. Visibility and HIL page — _Requirements: REQ-V37-003, REQ-V37-009_ — _Boundary:_ `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/core/hilCards.ts`, `tools/open-sdd/src/cli/commands/playbook.ts`, `tools/open-sdd/src/cli/commands/help.ts`, `tools/open-sdd/templates/agents/`
  - Done when: AC-03, AC-09 pass.
- [x] 7. Authoring: schema, new, diff, recipes — _Requirements: REQ-V37-010_ — _Boundary:_ `tools/open-sdd/src/core/playbook.ts`, `tools/open-sdd/templates/playbooks/`
  - Done when: AC-10 passes.
- [x] 8. Tests, docs, claims, release 3.7.0 — _Requirements: REQ-V37-001…010_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `README.md`, `README.es.md`, `package.json`, `tools/open-sdd/package.json`, `tools/open-sdd/package-lock.json`, `HANDOFF.md`, `docs/INSTALL.md`, `tools/open-sdd/templates/integrations/`, `.sdd/specs/playbooks-v3-7/`
  - Done when: full suite green; claims 0 broken.
