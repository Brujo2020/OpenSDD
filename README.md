# Open-SDD: Spec-Driven Development & Autonomous Orchestration for AI Coding Agents

<!-- npm badges -->
[![npm version](https://img.shields.io/npm/v/cc-sdd?logo=npm)](https://www.npmjs.com/package/cc-sdd?activeTab=readme)
[![install size](https://packagephobia.com/badge?p=cc-sdd)](https://packagephobia.com/result?p=cc-sdd)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

<div align="center" style="font-size: 1.1rem; margin-bottom: 1rem;"><sub>
Package README: <a href="./tools/cc-sdd/README.md">English</a> | <a href="./tools/cc-sdd/README_ja.md">日本語</a> | <a href="./tools/cc-sdd/README_zh-TW.md">繁體中文</a>
</sub></div>

## Turn approved specs into long-running autonomous implementation

One command installs an agentic SDLC workflow as Agent Skills: brownfield bootstrap, discovery, requirements, design, tasks, gap analysis, regulatory audit, and autonomous implementation with per-task independent review. Works across 8 AI coding agents, with the same 19-skill set on each.

- **5th Generation Software Abstraction (InfoQ 2026)**: Architecture becomes executable. Machine Code → Assembly → High-level compiled → Scripting/Dynamic → **SpecOps (SDD)**.
- **Universal Brownfield Reverse-Engineering (`/sdd-getspecs`)**: Over 90% of real-world software is brownfield. Deduce living specifications from any existing repository—from solo indie projects and startup MVPs to hyperscaler platforms—through code-first reverse engineering, generating spec seeds that require human editing and validation before approval.
- **Living Documentation in Git (*Spec-as-Code*)**: Specifications live in Git alongside the code (`.sdd/specs/`), versioned together in PRs to eradicate architectural drift.
- **Strict Git Mode & SpecOps Flow**: Automates feature branch lifecycle (`feat/<slug>`), commits/pushes living specs upon Documentary Triad approval, strictly forbids unapproved implementation, and automates PR creation upon test validation.
- **Karpathy Principles**: Think before coding, surgical changes, simplicity first, minimal blast radius, and goal-driven test verification.
- **Zero-Trust Multi-Agent Governance & Compliance**: Enforces verification gates, tamper-evident audit trails, and compliance with EU AI Act (Art. 11/12/14), NIST AI RMF, and ISO/IEC 42001 via `/sdd-audit`.
- **Autonomous Quality Engineering (Agentic QE & PACTS)**: Integrates autonomous testing via [Agentic QE](https://agentic-qe.dev/) (Proactive, Autonomous, Collaborative, Targeted, Structured) for metamorphic invariant generation and boundary-scoped verification.

## What's new in Open-SDD

Open-SDD represents a major evolution into an agent-agnostic, multi-tier SDLC standard:

- **Universal Brownfield Code-First Bootstrap (`/sdd-getspecs`)**: Dissects existing codebases (solo projects, startups, scale-ups, and enterprise systems), extracts architectural invariants into steering, and generates spec seeds (`brief.md`, `spec.json`, requirements stubs) that must be reviewed, edited, and validated before approval.
- **`/sdd-discovery` as the unified entry point for new work**: Routes new work into extending an existing spec, implementing directly with no spec, creating one new spec, or decomposing into multiple specs.
- **`/sdd-impl` for long-running autonomous implementation**: Each task gets a fresh implementer running TDD (RED → GREEN) behind a feature flag, an independent reviewer (`sdd-review`), and an auto-debug pass (`sdd-debug`). Learnings propagate forward via `## Implementation Notes` in `tasks.md`.
- **`/sdd-audit` for architectural drift & regulatory compliance**: Evaluates spec-to-code alignment, detects ambient code divergence, generates Requirements Traceability Matrices (RTM), and produces EU AI Act / NIST AI RMF audit reports.
- **Agentic QE Autonomous Verification (`/sdd-validate-impl`)**: Native integration with Agentic QE fleets (`agentic-qe.dev`) using the PACTS framework for metamorphic invariants, property testing, and boundary-scoped verification.
- **Brownfield Gap Validation (`/sdd-validate-gap`)**: Reverse-engineers call graphs and invariant boundaries in existing repositories before proposing architectural changes.
- **Boundary-first spec discipline**: `design.md` includes a File Structure Plan that drives task boundaries. Tasks carry `_Boundary:_` and `_Depends:_` annotations.
- **Agent Skills across 8 coding agents**: 19 skills per install, loaded on demand via progressive disclosure: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf, OpenCode, Gemini CLI, and Antigravity.

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
# For existing projects without specs:
/sdd-getspecs

# For new features or greenfield ideas:
/sdd-discovery <idea>
```

### Common workflows

| You want to... | Skills mode |
|---|---|
| **Reverse-engineer existing code (Brownfield)** | `/sdd-getspecs` → review/edit seeds → `/sdd-spec-requirements` → `/sdd-validate-gap` → `/sdd-spec-design` → `/sdd-impl` |
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

All 8 skills variants ship the complete 19-skill set:

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

## Strict Git Mode (`.sdd/settings/git.json`)

Configure automated Git branch and commit orchestration:

```json
{
  "mode": "strict",
  "branch_prefix": "feat/",
  "auto_branch": true,
  "auto_commit": true,
  "auto_push": true,
  "require_approved_spec": true
}
```

- **Branch on Init**: Automatically creates and switches to `feat/<slug>` on `/sdd-spec-init`.
- **Spec Approval Lock**: Automatically commits and pushes `.sdd/specs/<slug>/` when the Documentary Triad (`requirements.md` + `design.md` + `tasks.md`) is approved.
- **Spec Mandatory Block**: `/sdd-impl` strictly refuses to generate code if `spec.json` is not in approved state.
- **Implementation Validation Push**: Commits and pushes verified code upon `/sdd-validate-impl` passing, outputting a complete PR summary.

Read the complete guide: [Strict Git Mode & SpecOps Flow](docs/guides/git-workflow.md).

## License

MIT License
