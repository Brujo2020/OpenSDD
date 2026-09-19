# Requirements Document

## Introduction

Applying spec-driven development to a system that is already in production inverts the unit of work:
the existing code is the de facto source of truth, so the specification describes the CHANGE, not the
system. This specification covers the delta engine, the reverse-engineered constitution, honest
reconnaissance of an existing repository, and the regression oracle.

The authoritative change contract is `delta.md` (ADDED / MODIFIED / REMOVED / RENAMED). This document
carries the same requirements in EARS form for the Documentary Triad; `delta.md` adds the change kind,
the behaviour being replaced, the targets and the contracts.

## Requirements

### Requirement 1: Describe only what changes

**Objective:** As an engineer, I want the change described as a delta, so that the obligation stays finite.

#### Acceptance Criteria

- The [delta engine] shall parse and render a change with sections ADDED, MODIFIED, REMOVED and RENAMED.
- The [delta engine] shall require an identifier of the form REQ-AREA-NNN scoped to the change.
- If a requirement is MODIFIED, REMOVED or RENAMED, then the [validator] shall require the behaviour being replaced.
- If a requirement is REMOVED, then the [validator] shall require its rationale and its covering contracts.
- When a delta exceeds twenty-five entries, the [validator] shall warn that it resembles a whole-system specification.

### Requirement 2: Trace the change to its tasks

**Objective:** As an auditor, I want every delta requirement traced to work, so that nothing is claimed without a task.

#### Acceptance Criteria

- When tasks declare delta identifiers, the [traceability check] shall report which delta requirements own which tasks.
- If a delta requirement has no task, then the [traceability check] shall report it as unmapped.
- If a task cites a delta identifier that the delta does not define, then the [traceability check] shall report a phantom task.

### Requirement 3: State the existing system as it is

**Objective:** As an architect, I want a descriptive constitution, so that an agent cannot silently modernize what nobody asked it to modernize.

#### Acceptance Criteria

- When a repository is surveyed, the [constitution generator] shall emit only principles with evidence in the code.
- If a practice is desired but not observed, then the [constitution generator] shall record it as a proposed amendment instead of a principle.
- The [constitution] shall declare the language, package manager, build tool and test runner as established facts.
- If a descriptive principle lacks evidence, then the [constitution validator] shall reject it.
- While every principle of a constitution of four or more principles is MUST, the [constitution validator] shall warn that the levels no longer distinguish anything.

### Requirement 4: Reconnaissance that does not lie

**Objective:** As a maintainer, I want the survey to describe my repository accurately, so that the generated artifacts are trustworthy.

#### Acceptance Criteria

- When a repository keeps its code in a nested workspace, the [scanner] shall detect the language, test runner and build tool declared there.
- When a language, test runner or build tool is declared only by a configuration file, the [scanner] shall detect it.
- If a fact cannot be determined, then the [scanner] shall report it as unknown instead of guessing.

### Requirement 5: Analyse the impact of a change before writing it

**Objective:** As an architect, I want the blast radius of a change measured, so that a bounded change does not become an involuntary refactor.

#### Acceptance Criteria

- When a change is analysed, the [impact analysis] shall report the files that depend on the changed files, walking the dependency graph.
- If an exported symbol disappears, then the [impact analysis] shall report a breaking change.
- If a changed migration has no rollback counterpart, then the [impact analysis] shall report an error.
- If the analysis cannot read the project sources, then the [impact analysis] shall report that the radius is unknown instead of reporting a small one.

### Requirement 6: Bind the change to the tests that protect it

**Objective:** As an engineer, I want the existing tests bound to the change, so that the specification's first use is regression protection.

#### Acceptance Criteria

- When contracts are extracted, the [oracle] shall bind each changed file to the test files that cover it.
- If a removed requirement declares contracts, then the [oracle] shall verify that those contracts exist.
- If a changed file has no covering contract, then the [oracle] shall report it as an uncovered change.
- The [oracle] shall not report success from an exit code alone when a declared contract is missing.

### Requirement 7: Search before creating

**Objective:** As a maintainer, I want a reuse check, so that a new symbol does not duplicate one that already exists.

#### Acceptance Criteria

- When a change proposes a new symbol, the [reuse check] shall report existing symbols that match by name or by variant above the similarity threshold.
- If a proposed symbol already has a reusable candidate, then the [reuse check] shall report a violation.
- If the source directories cannot be read, then the [reuse check] shall report that the search did not run.
