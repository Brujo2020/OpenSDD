# Agentic SDLC and Spec-Driven Development

SDD-style Spec-Driven Development on an agentic SDLC

## Project Memory
Project memory keeps persistent guidance (steering, specs notes, component docs) so Cursor honors your standards each run. Treat it as the long-lived source of truth for patterns, conventions, and decisions.

- Use `{{SDD_DIR}}/steering/` for project-wide policies: architecture principles, naming schemes, security constraints, tech stack decisions, api standards, etc.
- Use local `AGENTS.md` files for feature or library context (e.g. `src/lib/payments/AGENTS.md`): describe domain assumptions, API contracts, or testing conventions specific to that folder.
- Specs notes stay with each spec (under `{{SDD_DIR}}/specs/`) to guide specification-level workflows.

## Project Context

### Paths
- Steering: `{{SDD_DIR}}/steering/`
- Specs: `{{SDD_DIR}}/specs/`

### Steering vs Specification

**Steering** (`{{SDD_DIR}}/steering/`) - Guide AI with project-wide rules and context
**Specs** (`{{SDD_DIR}}/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `{{SDD_DIR}}/specs/` for active specifications
- Use `/sdd-spec-status [feature-name]` to check progress

## Development Guidelines
{{DEV_GUIDELINES}}

## Minimal Workflow
- Phase 0 (optional): `/sdd-steering`, `/sdd-steering-custom`
- Discovery: `/sdd-discovery "idea"` — determines action path, writes brief.md + roadmap.md for multi-spec projects
- Phase 1 (Specification):
  - Single spec: `/sdd-spec-quick {feature} [--auto]` or step by step:
    - `/sdd-spec-init "description"`
    - `/sdd-spec-requirements {feature}`
    - `/sdd-validate-gap {feature}` (optional: for existing codebase)
    - `/sdd-spec-design {feature} [-y]`
    - `/sdd-validate-design {feature}` (optional: design review)
    - `/sdd-spec-tasks {feature} [-y]`
  - Multi-spec: `/sdd-spec-batch` — creates all specs from roadmap.md in parallel by dependency wave
- Phase 2 (Implementation): `/sdd-impl {feature} [tasks] [--review required|inline|off]`
  - Without task numbers: autonomous mode (subagent per task + independent review + final validation)
  - With task numbers: manual mode (selected tasks in main context, still reviewer-gated before completion)
  - `--review off` skips task-local review; use it intentionally and keep `/sdd-validate-impl {feature}` as the final quality gate
  - `/sdd-validate-impl {feature}` (standalone re-validation)
- Progress check: `/sdd-spec-status {feature}` (use anytime)

## Skills Structure
Skills are located in `.cursor/skills/kiro-*/SKILL.md`
- Each skill is a directory with a `SKILL.md` file
- Invoke a skill directly with `/kiro-<skill-name>`
- **If there is even a 1% chance a skill applies to the current task, invoke it.** Do not skip skills because the task seems simple.
- `sdd-review` — task-local adversarial review protocol used by reviewer subagents
- `sdd-debug` — root-cause-first debug protocol used by debugger subagents
- `sdd-verify-completion` — fresh-evidence gate before success or completion claims

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/sdd-spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `{{SDD_DIR}}/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/sdd-steering-custom`)
