# Agentic SDLC and Spec-Driven Development

SDD-style Spec-Driven Development on an agentic SDLC

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
- **Brownfield bootstrap** (existing codebase, no `.sdd/` specs): `/sdd-getspecs` — reverse-engineers steering + roadmap + spec seeds from code; then `/sdd-spec-requirements` or `/sdd-spec-batch`
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
Skills are located in `.claude/skills/sdd-*/SKILL.md`
- Each skill is a directory with a `SKILL.md` file
- Skills run inline with access to conversation context
- Skills may delegate parallel research to subagents for efficiency
- Additional files (templates, examples) can be added to skill directories
- `sdd-review` — task-local adversarial review protocol used by reviewer subagents
- `sdd-debug` — root-cause-first debug protocol used by debugger subagents
- `sdd-verify-completion` — fresh-evidence gate before success or completion claims
- **If there is even a 1% chance a skill applies to the current task, invoke it.** Do not skip skills because the task seems simple.

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/sdd-spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `{{SDD_DIR}}/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/sdd-steering-custom`)
