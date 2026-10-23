# Tasks — variants-reverse
- [x] 1. Variants — _Requirements: REQ-VR-001_ — _Boundary:_ `tools/open-sdd/src/core/levels.ts`, `tools/open-sdd/templates/playbooks/`, `tools/open-sdd/src/cli/commands/modernize.ts`
  - Done when: AC-01 passes.
- [x] 2. Reverse engine and CLI — _Requirements: REQ-VR-002, REQ-VR-003, REQ-VR-004_ — _Boundary:_ `tools/open-sdd/src/core/reverse.ts`, `tools/open-sdd/src/core/engine.ts`, `tools/open-sdd/src/core/playbook.ts`, `tools/open-sdd/src/cli/commands/reverse.ts`, `tools/open-sdd/src/cli/commands/help.ts`, `tools/open-sdd/src/index.ts`
  - Done when: AC-02…AC-04 pass.
- [x] 4. Rigor overlay, assistants, where — _Requirements: REQ-VR-005…009_ — _Boundary:_ `tools/open-sdd/src/core/rigorOverlay.ts`, `tools/open-sdd/src/core/guidedAssistants.ts`, `tools/open-sdd/src/core/earsConvert.ts`, `tools/open-sdd/src/core/where.ts`, `tools/open-sdd/src/cli/commands/assist.ts`, `tools/open-sdd/src/cli/commands/where.ts`
  - Done when: AC-05…AC-09 pass.
- [x] 3. Tests, docs, skill, release 3.9.0 — _Requirements: all_ — _Boundary:_ `tools/open-sdd/test/`, `tools/open-sdd/dist/`, `docs/`, `CHANGELOG.md`, `README.md`, `README.es.md`, `package.json`, `tools/open-sdd/package.json`, `tools/open-sdd/package-lock.json`, `HANDOFF.md`, `tools/open-sdd/templates/agents/`, `tools/open-sdd/templates/integrations/`, `.sdd/specs/variants-reverse/`
  - Done when: suite green, claims 0 broken.
