# Open-SDD: Spec-Driven Development & Autonomous Orchestration for AI Coding Agents

<!-- npm badges -->
[![npm version](https://img.shields.io/npm/v/cc-sdd?logo=npm)](https://www.npmjs.com/package/cc-sdd?activeTab=readme)
[![install size](https://packagephobia.com/badge?p=cc-sdd)](https://packagephobia.com/result?p=cc-sdd)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

<div align="center" style="font-size: 1.1rem; margin-bottom: 1rem;"><sub>
Package README: <a href="./tools/cc-sdd/README.md">English</a> | <a href="./tools/cc-sdd/README_ja.md">日本語</a> | <a href="./tools/cc-sdd/README_zh-TW.md">繁體中文</a>
</sub></div>

## Turn approved specs into long-running autonomous implementation

One command installs an agentic SDLC workflow as Agent Skills: brownfield bootstrap, discovery, requirements, design, tasks, gap analysis, regulatory audit, and autonomous implementation with per-task independent review. Works across 8 AI coding agents, with the same 20-skill set on each.

- **5th Generation Software Abstraction (InfoQ 2026)**: Architecture becomes executable. Machine Code → Assembly → High-level compiled → Scripting/Dynamic → **SpecOps (SDD)**.
- **"It Just Works" (Apple-Grade Simplicity)**: Eliminates the "Steel Harness" antipattern (excessive bureaucratic gates that paralyze velocity). Focuses on **3 Critical Invariant Gates** with **Dual Governance (`fluid` vs `strict`)**.
- **Universal Brownfield Reverse-Engineering (`/sdd-getspecs`)**: Over 90% of real-world software is brownfield. Deduce living specifications from any existing repository—from solo indie projects and startup MVPs to hyperscaler platforms—through code-first reverse engineering, generating spec seeds that require human editing and validation before approval.
- **Living Documentation in Git (*Spec-as-Code*)**: Specifications live in Git alongside the code (`.sdd/specs/`), versioned together in PRs to eradicate architectural drift.
- **Strict Git Mode & SpecOps Flow**: Automates feature branch lifecycle (`feat/<slug>`), commits/pushes living specs upon Documentary Triad approval, strictly forbids unapproved implementation, and automates PR creation upon test validation.
- **Karpathy Principles**: Think before coding, surgical changes, simplicity first, minimal blast radius, and goal-driven test verification.
- **Dual-Mode Governance (`fluid` vs `strict`)**: By default, **Modo Libre (`fluid`)** guarantees high development speed with non-blocking warnings, while **Modo Estricto (`strict`)** activates full regulatory compliance (EU AI Act, NIST AI RMF).
- **Autonomous Quality Engineering (Agentic QE & PACTS)**: Integrates autonomous testing via [Agentic QE](https://agentic-qe.dev/) (Proactive, Autonomous, Collaborative, Targeted, Structured) for metamorphic invariant generation and boundary-scoped verification.

## The Apple Philosophy: "It Just Works" & No "Steel Harness" Paralysis

Excessive validation gates and rigid harnesses often paralyze engineering velocity, turning AI assistants into bureaucratic blockers. 

**Open-SDD rejects the "Steel Harness" antipattern.** Instead of 20+ blocking gates, Open-SDD focuses exclusively on the **3 Vital Critical Invariant Gates**:
1. **Boundary & Blast-Radius Gate**: Protects codebase topology and stops unintended file mutations.
2. **Spec Contract Gate**: Ensures implementation maps to clear user intent, preventing hallucinated scope.
3. **Verification Gate**: Guarantees tests pass with fresh evidence before release.

### Dual Governance: Speed vs. Compliance (`.sdd/settings/governance.json`)

| Mode | Designed For | Developer Experience |
|---|---|---|
| **`fluid` (Default / Modo Libre)** | Solo devs, startups, rapid prototyping, scale-ups | **Maximum speed.** Non-blocking warnings, zero bureaucratic pauses, fast-track by default (`-y`, `--auto`). |
| **`strict` (Enterprise / Sovereign)** | Regulated industries, hyperscalers, EU AI Act audits | **Full regulatory lock.** Mandatory Gate 0 approval, tamper-evident commit trails, hard drift blocks. |

| What You Type | What You Experience | What Open-SDD Orchestrates Under the Hood |
|---|---|---|
| `/sdd-getspecs` | Instant understanding of your legacy code | AST traversal, dependency graphing, boundary extraction, reverse-engineered spec seeds |
| `/sdd-spec-quick auth --auto` | Specs generated and locked in seconds | EARS requirements synthesis, ADR generation, blast-radius gap analysis, Git branch lock |
| `/sdd-impl auth` | Features implemented autonomously | Subagent isolation, TDD RED→GREEN execution, adversarial review, auto-debugging |
| `/sdd-audit auth` | Instant compliance certificate | Regulatory traceability matrix, EU AI Act Art. 11/12/14 audit, drift report |

## Quick Installation (Global & Per-Project)

### 🚀 Option 1: Universal Installer (`install.sh`)
Run the installer directly from the root:
```bash
./install.sh
```
Or with automated flags:
```bash
./install.sh --global       # Installs 'open-sdd' and 'sdd' globally in PATH
./install.sh --project      # Installs all 20 skills in current project directory
./install.sh --both         # Both (CLI globally + skills in current project)
```

### 🌐 Option 2: Global NPM Install (Terminal Everywhere)
```bash
npm install -g cc-sdd@latest

# Verify installation
open-sdd status
open-sdd help
```

### 📦 Option 3: Per-Project Install (Zero Global Installs)
Run `npx` inside any project folder to immediately inject the 20 skills for your active agent:
```bash
# Google Antigravity
npx open-sdd@latest --antigravity -y

# Claude Code
npx open-sdd@latest -y

# Cursor IDE
npx open-sdd@latest --cursor-skills -y

# GitHub Copilot / Windsurf / OpenCode / Gemini CLI
npx open-sdd@latest --copilot-skills -y
npx open-sdd@latest --windsurf-skills -y
npx open-sdd@latest --opencode-skills -y
npx open-sdd@latest --gemini-cli-skills -y
```

## What's new in Open-SDD

Open-SDD represents a major evolution into an agent-agnostic, multi-tier SDLC standard:

- **Interactive `/sdd-help` Assistant**: Built-in interactive command center with instant copy-paste recipes, workflow diagrams, and contextual advice directly in-chat.
- **Universal Brownfield Code-First Bootstrap (`/sdd-getspecs`)**: Dissects existing codebases (solo projects, startups, scale-ups, and enterprise systems), extracts architectural invariants into steering, and generates spec seeds (`brief.md`, `spec.json`, requirements stubs) that must be reviewed, edited, and validated before approval.
- **`/sdd-discovery` as the unified entry point for new work**: Routes new work into extending an existing spec, implementing directly with no spec, creating one new spec, or decomposing into multiple specs.
- **`/sdd-impl` for long-running autonomous implementation**: Each task gets a fresh implementer running TDD (RED → GREEN) behind a feature flag, an independent reviewer (`sdd-review`), and an auto-debug pass (`sdd-debug`). Learnings propagate forward via `## Implementation Notes` in `tasks.md`.
- **`/sdd-audit` for architectural drift & regulatory compliance**: Evaluates spec-to-code alignment, detects ambient code divergence, generates Requirements Traceability Matrices (RTM), and produces EU AI Act / NIST AI RMF audit reports.
- **Agentic QE Autonomous Verification (`/sdd-validate-impl`)**: Native integration with Agentic QE fleets (`agentic-qe.dev`) using the PACTS framework for metamorphic invariants, property testing, and boundary-scoped verification.
- **Brownfield Gap Validation (`/sdd-validate-gap`)**: Reverse-engineers call graphs and invariant boundaries in existing repositories before proposing architectural changes.
- **Boundary-first spec discipline**: `design.md` includes a File Structure Plan that drives task boundaries. Tasks carry `_Boundary:_` and `_Depends:_` annotations.
- **Agent Skills across 8 coding agents**: 20 skills per install, loaded on demand via progressive disclosure: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf, OpenCode, Gemini CLI, and Antigravity.

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
# Need help or recipe examples anytime:
/sdd-help

# For existing projects without specs:
/sdd-getspecs

# For new features or greenfield ideas:
/sdd-discovery "Add OAuth2 social logins with Google and GitHub"
```

## Complete Command Reference & Real-World Examples

Every Open-SDD command is designed to be self-explanatory, safe, and copy-paste friendly.

### 🌟 1. Discovery & Assistance

#### `/sdd-help` — Interactive Guide & Command Center
Provides in-chat guidance, usage cheat sheets, and practical workflow recipes.
```bash
# General help menu and command index
/sdd-help

# Help on a specific topic or phase
/sdd-help impl
/sdd-help getspecs
/sdd-help git
```

#### `/sdd-getspecs` — Brownfield Code-First Reverse Engineering
Reverse-engineers existing, un-specced codebases into steering context and editable spec seeds.
```bash
# Reverse-engineer the entire existing project
/sdd-getspecs

# Target a specific module, package, or subsystem
/sdd-getspecs "src/auth"
/sdd-getspecs "packages/billing-engine"
```

#### `/sdd-discovery` — Unified Starting Point for New Ideas
Explores a problem statement or feature idea, analyzes feasibility, and writes `brief.md` and `roadmap.md`.
```bash
# Explore a greenfield feature idea
/sdd-discovery "Add biometric WebAuthn passkey support for passwordless login"

# Explore a complex architectural refactor
/sdd-discovery "Migrate legacy REST API endpoints to high-performance GraphQL federation"
```

---

### 🧭 2. Steering & Architecture Memory

#### `/sdd-steering` — Core Architecture Synchronization
Scans the project to establish or update persistent project memory (`product.md`, `tech.md`, `structure.md`).
```bash
# Synchronize project-wide architectural context
/sdd-steering
```

#### `/sdd-steering-custom` — Specialized Governance & Technology Standards
Creates specialized, persistent domain guidelines that all agents adhere to across all tasks.
```bash
# Define enterprise security standards
/sdd-steering-custom zero-trust-security

# Define database indexing and migration policies
/sdd-steering-custom postgresql-performance-rules
```

---

### 📋 3. Documentary Triad: Requirements, Design & Tasks

#### `/sdd-spec-init` — Initialize Feature Specification & Git Branch
Scaffolds a new spec directory (`.sdd/specs/<feature>/`) and in Strict Git Mode switches to branch `feat/<feature>`.
```bash
# Initialize a new feature spec
/sdd-spec-init stripe-billing-integration
```

#### `/sdd-spec-requirements` — Author EARS Structured Requirements
Drafts formal EARS-format (Easy Approach to Requirements Syntax) requirements with verifiable acceptance criteria.
```bash
# Draft requirements for the feature
/sdd-spec-requirements stripe-billing-integration
```

#### `/sdd-validate-gap` — Brownfield Blast Radius & Gap Analysis
Checks proposed requirements against existing codebase call graphs, detecting potential breaking changes.
```bash
# Analyze architectural gap and blast radius
/sdd-validate-gap stripe-billing-integration
```

#### `/sdd-spec-design` — Architecture, Mermaid Diagrams & ADRs
Produces comprehensive system design including sequence diagrams, File Structure Plan, and Architecture Decision Records.
```bash
# Interactive design generation (prompts for confirmation)
/sdd-spec-design stripe-billing-integration

# Fast-track design generation (skip manual prompts)
/sdd-spec-design stripe-billing-integration -y
```

#### `/sdd-validate-design` — Design Review Gate
Verifies design document completeness, architectural feasibility, and alignment with steering standards.
```bash
# Validate design specifications
/sdd-validate-design stripe-billing-integration
```

#### `/sdd-spec-tasks` — Decompose Design into Bounded Tasks
Generates an actionable, dependency-ordered `tasks.md` with explicit file boundaries (`_Boundary:_`) and flags (`_Depends:_`).
```bash
# Generate implementation task list
/sdd-spec-tasks stripe-billing-integration -y
```

#### `/sdd-spec-quick` — Fast-Track End-to-End Specification
Accelerates the entire Documentary Triad (Requirements → Design → Tasks) in a single guided or automated command.
```bash
# Fast-track with interactive step confirmations
/sdd-spec-quick csv-export-reports

# Fully automated zero-prompt specification pipeline
/sdd-spec-quick csv-export-reports --auto
```

#### `/sdd-spec-batch` — Multi-Spec Roadmap Orchestration
Initializes all specifications defined in `roadmap.md` in parallel dependency waves.
```bash
# Batch-scaffold all specs from roadmap.md
/sdd-spec-batch
```

#### `/sdd-spec-status` — Specification & Implementation Progress Check
Displays live progress across all phases (Requirements, Design, Tasks, Implementation, Verification).
```bash
# Check status of a specific feature
/sdd-spec-status stripe-billing-integration

# Check overall project specs overview
/sdd-spec-status
```

---

### ⚡ 4. Implementation & Quality Engineering

#### `/sdd-impl` — Autonomous Implementation Engine
Executes tasks using isolated subagent context, strict TDD (RED → GREEN), feature flags, and independent code review.
```bash
# Autonomous mode: executes all tasks sequentially with subagents & auto-review
/sdd-impl stripe-billing-integration

# Targeted mode: execute only tasks 1, 2, and 3
/sdd-impl stripe-billing-integration 1 2 3

# Enforce strict independent human-in-the-loop review after every task
/sdd-impl stripe-billing-integration --review required
```

#### `/sdd-validate-impl` — Standalone Feature Verification & Agentic QE
Executes verification suites, regression checks, and autonomous Agentic QE metamorphic test fleets.
```bash
# Run verification suite for the implemented feature
/sdd-validate-impl stripe-billing-integration
```

#### `/sdd-review` — Adversarial Code Review Protocol
Inspects code changes against task boundary constraints, architectural guidelines, and security rules.
```bash
# Adversarially review the current working branch changes
/sdd-review

# Review a specific completed task
/sdd-review 2
```

#### `/sdd-debug` — Root-Cause-First Debugging
Investigates test failures or unexpected runtime behavior using hypothesis testing and scientific debugging.
```bash
# Debug a specific error message or symptom
/sdd-debug "Webhook signature verification returns 401 on Stripe test events"

# Debug a failing test case
/sdd-debug "test/billing/webhook.test.ts"
```

#### `/sdd-verify-completion` — Fresh-Evidence Completion Gate
Validates that all acceptance criteria are met with fresh test runs and zero residual ambient code before closing a feature.
```bash
# Run final fresh-evidence completion gate
/sdd-verify-completion
```

---

### 🛡️ 5. Governance & Regulatory Audit

#### `/sdd-audit` — Compliance & Traceability Report
Generates an auditable report validating Requirements Traceability Matrices (RTM) and regulatory standards.
```bash
# Generate standard spec-to-code traceability audit
/sdd-audit stripe-billing-integration

# Generate full regulatory compliance audit (EU AI Act, NIST AI RMF, ISO/IEC 42001)
/sdd-audit stripe-billing-integration --regulatory
```

## Common Workflows at a Glance

| You want to... | Recommended Command Flow |
|---|---|
| **Reverse-engineer existing code (Brownfield)** | `/sdd-getspecs` → review/edit seeds → `/sdd-spec-requirements` → `/sdd-validate-gap` → `/sdd-spec-design` → `/sdd-impl` |
| **Start a new feature or product** | `/sdd-discovery` → `/sdd-spec-init` → `/sdd-spec-requirements` → `/sdd-spec-design` → `/sdd-spec-tasks` → `/sdd-impl` |
| **Fast-track a feature in minutes** | `/sdd-spec-quick <feature> --auto` → `/sdd-impl <feature>` → `/sdd-validate-impl <feature>` |
| **Extend an existing brownfield system** | `/sdd-steering` → `/sdd-discovery` or `/sdd-spec-init` → `/sdd-validate-gap` → `/sdd-spec-design` → `/sdd-spec-tasks` → `/sdd-impl` |
| **Audit architectural drift & compliance** | `/sdd-audit <feature> --regulatory` |
| **Decompose a multi-service initiative** | `/sdd-discovery` → `/sdd-spec-batch` |

## Supported Agents

All 8 skills variants ship the complete 20-skill suite:

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
