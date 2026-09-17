# Open-SDD: Spec-Driven Development & Autonomous Orchestration for AI Coding Agents

<!-- npm badges -->
[![npm version](https://img.shields.io/npm/v/cc-sdd?logo=npm)](https://www.npmjs.com/package/cc-sdd?activeTab=readme)
[![install size](https://packagephobia.com/badge?p=cc-sdd)](https://packagephobia.com/result?p=cc-sdd)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

<div align="center" style="font-size: 1.1rem; margin-bottom: 1rem;"><sub>
Package README: <a href="./tools/cc-sdd/README.md">English</a> | <a href="./tools/cc-sdd/README_ja.md">日本語</a> | <a href="./tools/cc-sdd/README_zh-TW.md">繁體中文</a>
</sub></div>

## Turn approved specs into long-running autonomous implementation

One command installs an agentic SDLC workflow as Agent Skills: discovery, requirements, design, tasks, brownfield gap analysis, regulatory audit, and autonomous implementation with per-task independent review. Works across 8 AI coding agents, with the same 18-skill set on each.

- **5th Generation Software Abstraction (InfoQ 2026)**: Architecture becomes executable. Machine Code → Assembly → High-level compiled → Scripting/Dynamic → **SpecOps (SDD)**.
- **Enterprise Brownfield Ready**: Reverse-engineer existing codebases via *Graph before Grep*, blast radius estimation, and characterization test locking before modification.
- **Living Documentation in Git (*Spec-as-Code*)**: Specifications live in Git alongside the code (`.sdd/specs/`), versioned together in PRs to eradicate architectural drift.
- **Karpathy Principles**: Think before coding, surgical changes, simplicity first, minimal blast radius, and goal-driven test verification.
- **Zero-Trust Multi-Agent Governance & Compliance**: Enforces verification gates, tamper-evident audit trails, and compliance with EU AI Act (Art. 11/12/14), NIST AI RMF, and ISO/IEC 42001 via `/sdd-audit`.
- **Autonomous Quality Engineering (Agentic QE & PACTS)**: Integrates autonomous testing via [Agentic QE](https://agentic-qe.dev/) (Proactive, Autonomous, Collaborative, Targeted, Structured) for metamorphic invariant generation and boundary-scoped verification.

## What's new in Open-SDD

Open-SDD represents a major evolution into an agent-agnostic, enterprise-grade SDLC standard:

- **`/sdd-discovery` as the unified entry point**: Discovery routes new work into one of: extend an existing spec, implement directly with no spec, create one new spec, decompose into multiple specs, or mixed decomposition. It writes `brief.md` and, when needed, `roadmap.md`.
- **`/sdd-impl` for long-running autonomous implementation**: Each task gets a fresh implementer running TDD (RED → GREEN) behind a feature flag, an independent reviewer (`sdd-review`), and an auto-debug pass (`sdd-debug`). Learnings propagate forward via `## Implementation Notes` in `tasks.md`.
- **`/sdd-audit` for architectural drift & regulatory compliance**: Evaluates spec-to-code alignment, detects ambient code divergence, generates Requirements Traceability Matrices (RTM), and produces EU AI Act / NIST AI RMF audit reports.
- **Agentic QE Autonomous Verification (`/sdd-validate-impl`)**: Native integration with Agentic QE fleets (`agentic-qe.dev`) using the PACTS framework for metamorphic invariants, property testing, and boundary-scoped verification.
- **Brownfield Gap Validation (`/sdd-validate-gap`)**: Reverse-engineers call graphs and invariant boundaries in existing repositories before proposing architectural changes.
- **Boundary-first spec discipline**: `design.md` includes a File Structure Plan that drives task boundaries. Tasks carry `_Boundary:_` and `_Depends:_` annotations.
- **Agent Skills across 8 coding agents**: 18 skills per install, loaded on demand via progressive disclosure: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf, OpenCode, Gemini CLI, and Antigravity.

Read our research preprint: [Open-SDD: Spec-Driven Development Orchestration](docs/papers/open-sdd-preprint.pdf).

## Quick Start

```bash
cd your-project
npx cc-sdd@latest
# or alias:
npx open-sdd@latest
```

The default installs **Claude Code Skills** with English docs and `.sdd/` storage. To pick another agent or language:

```bash
npx cc-sdd@latest --codex-skills --lang ja      # Codex, Japanese
npx cc-sdd@latest --cursor-skills --lang zh-TW  # Cursor IDE, Traditional Chinese
npx cc-sdd@latest --antigravity --lang es       # Antigravity, Spanish
```

Then, in your agent:

```bash
/sdd-discovery <idea>
```

Not sure where to start? Start with `/sdd-discovery`. It routes your request and tells you what command to run next.

### Common workflows

| You want to... | Skills mode |
|---|---|
| **Start a new feature or product** | `/sdd-discovery` → `/sdd-spec-init` → `/sdd-spec-requirements` → `/sdd-spec-design` → `/sdd-spec-tasks` → `/sdd-impl` |
| **Extend an existing brownfield system** | `/sdd-steering` → `/sdd-discovery` or `/sdd-spec-init` → `/sdd-validate-gap` → `/sdd-spec-design` → `/sdd-spec-tasks` → `/sdd-impl` |
| **Audit architectural drift & compliance** | `/sdd-audit [feature-name] [--regulatory]` |
| **Break down a large initiative** | `/sdd-discovery` → `/sdd-spec-batch` |
| **Implement a small change with no spec** | `/sdd-discovery` → direct implementation |

## See It In Action

Example: build a new Photo Albums feature.

```bash
/sdd-discovery Photo albums with upload, tagging, and sharing
# discovery writes brief.md (and roadmap.md when multi-spec) and suggests the next command
/sdd-spec-init photo-albums
/sdd-spec-requirements photo-albums
/sdd-spec-design photo-albums
/sdd-spec-tasks photo-albums
/sdd-impl photo-albums
# autonomous: fresh implementer, independent reviewer, and auto-debug per task
/sdd-audit photo-albums --regulatory
# audit: verifies requirements traceability and regulatory compliance
```

Typical spec outputs (stored in `.sdd/specs/` under Git control):

- `requirements.md`: EARS-format requirements with acceptance criteria.
- `design.md`: architecture with Mermaid diagrams, File Structure Plan, and ADRs.
- `tasks.md`: implementation tasks with boundaries and dependency annotations.
- `audit-report.md`: compliance and drift verification report.

## Supported Agents

All 8 skills variants ship the complete 18-skill set:

| Agent | Skills mode | Stability |
|---|---|---|
| **Claude Code** | `--claude-skills` | Stable |
| **Codex** | `--codex-skills` | Stable |
| **Cursor IDE** | `--cursor-skills` | Stable |
| **GitHub Copilot** | `--copilot-skills` | Stable |
| **Windsurf IDE** | `--windsurf-skills` | Stable |
| **OpenCode** | `--opencode-skills` | Stable |
| **Gemini CLI** | `--gemini-skills` | Stable |
| **Antigravity** | `--antigravity` | Stable |

## Steering Context

Steering (`.sdd/steering/`) establishes persistent, project-wide memory that AI agents read on every task:

- `product.md`: Product vision, target users, and domain boundaries.
- `tech.md`: Tech stack, runtime prerequisites, coding conventions, and testing commands.
- `structure.md`: Architectural topology, folder layout, and component boundaries.
- Custom steering documents (`/sdd-steering-custom`) for API standards, security, databases, or cloud infrastructure.

## License

MIT License
