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
- Use `/sdd:spec-status [feature-name]` to check progress

## Development Guidelines
{{DEV_GUIDELINES}}

## Minimal Workflow
- Phase 0 (optional): `/sdd:steering`, `/sdd:steering-custom`
- Phase 1 (Specification):
  - `/sdd:spec-init "description"`
  - `/sdd:spec-requirements {feature}`
  - `/sdd:validate-gap {feature}` (optional: for existing codebase)
  - `/sdd:spec-design {feature} [-y]`
  - `/sdd:validate-design {feature}` (optional: design review)
  - `/sdd:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/sdd:spec-impl {feature} [tasks]`
  - `/sdd:validate-impl {feature}` (optional: after implementation)
- Progress check: `/sdd:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/sdd:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `{{SDD_DIR}}/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/sdd:steering-custom`)
