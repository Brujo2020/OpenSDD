# Open-SDD: Spec-Driven Development & Autonomous Orchestration for AI Coding Agents

<!-- badges -->
[![GitHub repository](https://img.shields.io/badge/GitHub-Brujo2020%2Fopen--sdd-blue?logo=github)](https://github.com/Brujo2020/open-sdd)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Status: Production](https://img.shields.io/badge/status-active-brightgreen.svg)](https://github.com/Brujo2020/open-sdd)

## Turn approved specs into long-running autonomous implementation

One command installs the whole workflow as Agent Skills: read an existing codebase, discover what to build, write requirements, design, tasks — then implement autonomously with a review pass per task. Works across 8 AI coding agents, same 20 skills on each.

- **Works on existing code** (`/sdd-getspecs`): most software is not greenfield. Point it at a repo and it reads the code to draft specs for what is already there. You review and edit them before anything is approved.
- **Specs live in Git** next to the code (`.sdd/specs/`), so they are reviewed in PRs and cannot quietly drift.
- **Out of your way by default**: checks report, nothing blocks, and it never pushes to your remote until you say so. Turn enforcement up when you actually need it.
- **Autonomous implementation**: approved specs run task by task, in parallel where the tasks do not overlap, each with an independent review pass.
- **Compliance when you need it**: EU AI Act and NIST AI RMF reporting is there behind `--regulatory`, not in your face.

## How strict is it? One line.

By default, **nothing blocks you.** Open-SDD runs its checks and tells you what it found; you decide what to do. When you want it to start enforcing, change one word:

```json
// .sdd/settings/governance.json
{ "profile": "solo" }
```

| Profile | What it does |
|---|---|
| **`solo`** (default) | Nothing blocks. Checks run and report only. |
| **`team`** | Blocks only code written without an approved spec. |
| **`enterprise`** | Everything blocks. For audited environments. |

That is the whole configuration. Output looks like this:

```
Checks:
  ok        Code follows an approved spec
  heads up  Changes stayed in scope
            2 files modified outside the task's boundary
```

`heads up` means it found something but is letting you through. Under `team` or `enterprise` the same finding becomes `blocked`.

**Safe defaults**: a fresh install never pushes to your remote. Turn on `auto_push` in `.sdd/settings/git.json` yourself if you want it.

<details>
<summary>Fine-grained control (most people never need this)</summary>

Three checks exist. A profile decides which of them block:

| Check | id |
|---|---|
| Code follows an approved spec | `spec_contract_present` |
| Changes stayed in scope | `boundary_integrity` |
| Work is verified | `verification_proofs_pass` |

List exactly the ones you want to block on — anything you leave out still reports:

```json
{ "profile": "team", "critical_invariants": ["spec_contract_present", "boundary_integrity"] }
```

Explicit fields always beat the profile. Compliance reporting (EU AI Act Art. 11/12/14, NIST AI RMF) is opt-in via `open-sdd audit --regulatory`.

Full details: **[Governance Profiles](docs/guides/governance-profiles.md)**.
</details>

| What you type | What you get |
|---|---|
| `/sdd-getspecs` | Specs drafted from the code you already have |
| `/sdd-spec-quick auth --auto` | Requirements, design and tasks for one feature |
| `/sdd-impl auth --parallel` | The feature built task by task, reviewed as it goes |
| `/sdd-audit auth` | What drifted from the spec (add `--regulatory` for a compliance report) |

## Quick Installation (Global & Per-Project)

### 🚀 Option 1: Universal One-Line Installer (Public curl & bash)
Install Open-SDD on any machine with zero prior setup:
```bash
curl -fsSL https://raw.githubusercontent.com/Brujo2020/open-sdd/main/install.sh | bash
```
Or pass automated flags:
```bash
# Global CLI + current project skills (Recommended):
curl -fsSL https://raw.githubusercontent.com/Brujo2020/open-sdd/main/install.sh | bash -s -- --both

# Global CLI only ('open-sdd' command available everywhere in PATH):
curl -fsSL https://raw.githubusercontent.com/Brujo2020/open-sdd/main/install.sh | bash -s -- --global

# Or run locally from a cloned repo:
./install.sh
```

### 🌐 Option 2: Global CLI Install (Terminal Everywhere)
```bash
# Direct install from public GitHub repository:
npm install -g Brujo2020/open-sdd

# Or via npm:
npm install -g open-sdd@latest

# Verify installation (both open-sdd and sdd-open commands are available):
open-sdd status
sdd-open help
```

### 📦 Option 3: Per-Project Skills Install (Zero Global Installs)
Inside any repository, inject the 20 skills directly into your coding agent:
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
npx open-sdd@latest
```

The default installs **Claude Code Skills** with English docs and `.sdd/` storage. To pick another agent or language:

```bash
npx open-sdd@latest --codex-skills --lang ja      # Codex, Japanese
npx open-sdd@latest --cursor-skills --lang zh-TW  # Cursor IDE, Traditional Chinese
npx open-sdd@latest --antigravity --lang es       # Antigravity, Spanish
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

## Git automation (`.sdd/settings/git.json`)

Ships as `assisted` — branches and commits for you, **never pushes**:

```json
{
  "mode": "assisted",
  "branch_prefix": "feat/",
  "auto_branch": true,
  "auto_commit": true,
  "auto_push": false,
  "require_approved_spec": true
}
```

- **Branch on Init**: Creates and switches to `feat/<slug>` on `/sdd-spec-init`.
- **Spec Approval Lock**: Commits `.sdd/specs/<slug>/` when the Documentary Triad (`requirements.md` + `design.md` + `tasks.md`) is approved.
- **Spec Mandatory Block** (`mode: strict`): `/sdd-impl` refuses to generate code if `spec.json` is not approved.
- **Push**: only when you set `auto_push: true`.

Pair `mode: "strict"` with the `enterprise` governance profile for the full regulated flow.

Read the complete guide: [Git Automation & SpecOps Flow](docs/guides/git-workflow.md).

## License

MIT License
