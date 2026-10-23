# Tasks — modernize-kit

- [x] 1. Level ladder, `start`, ceremony — _Requirements: REQ-MK-001, REQ-MK-002_ — _Boundary:_ `tools/open-sdd/src/core/levels.ts`, `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/core/hilCards.ts`, `tools/open-sdd/src/core/hilIdentity.ts`, `tools/open-sdd/src/core/handoff.ts`, `tools/open-sdd/src/core/playbook.ts`, `tools/open-sdd/templates/playbooks/`, `tools/open-sdd/src/cli/commands/playbook.ts`
  - Done when: AC-01, AC-02 pass.
- [x] 2. Rule engine and events — _Requirements: REQ-MK-003, REQ-MK-004_ — _Boundary:_ `tools/open-sdd/src/core/dynamicRules.ts`, `tools/open-sdd/templates/modernize/`
  - Done when: AC-03, AC-04 pass.
- [x] 3. Proposals — _Requirements: REQ-MK-005_ — _Boundary:_ `tools/open-sdd/src/core/modernize/proposals.ts`
  - Done when: AC-05 passes.
- [x] 4. Portfolio, 7 Rs, waves — _Requirements: REQ-MK-006, REQ-MK-007_ — _Boundary:_ `tools/open-sdd/src/core/modernize/`
  - Done when: AC-06, AC-07 pass.
- [x] 5. Lifecycle and cutover — _Requirements: REQ-MK-008_ — _Boundary:_ `tools/open-sdd/src/core/modernize/lifecycle.ts`
  - Done when: AC-08 passes.
- [x] 6. Learning — _Requirements: REQ-MK-009_ — _Boundary:_ `tools/open-sdd/src/core/modernize/learn.ts`
  - Done when: AC-09 passes.
- [x] 7. CLI, status, skill — _Requirements: REQ-MK-010_ — _Boundary:_ `tools/open-sdd/src/cli/commands/modernize.ts`, `tools/open-sdd/src/cli/commands/help.ts`, `tools/open-sdd/src/index.ts`, `tools/open-sdd/src/core/modernize/report.ts`, `tools/open-sdd/templates/agents/`
  - Done when: AC-10 passes.
- [x] 8. Tests (≥100), banking scenario, docs, claims, release 3.8.0 — _Requirements: REQ-MK-001…010_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `README.md`, `README.es.md`, `AGENTS.md`, `CLAUDE.md`, `package.json`, `tools/open-sdd/package.json`, `tools/open-sdd/package-lock.json`, `HANDOFF.md`, `tools/open-sdd/templates/integrations/`, `.sdd/specs/modernize-kit/`
  - Done when: AC-11 passes; full suite green; claims 0 broken.
