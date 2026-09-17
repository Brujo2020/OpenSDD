# Open-SDD: Agentic SDLC and Spec-Driven Development

Open-SDD: Model-agnostic Spec-Driven Development on an enterprise agentic SDLC.
Living specifications, Zero-Trust validation, and auditable architecture.

## Project Context

### Paths
- Steering: `.sdd/steering/` (persistent project memory & architecture standards)
- Specs: `.sdd/specs/` (executable feature specifications)
- Memory: `.sdd/memory/` (temporal session ledgers and AST knowledge graph)

### Steering vs Specification

**Steering** (`.sdd/steering/`) - Guides AI with project-wide rules, architecture, and technology standards.
**Specs** (`.sdd/specs/`) - Formalizes the development lifecycle for individual features into an auditable Documentary Triad (`requirements.md`, `design.md`, `tasks.md`).

### Active Specifications
- Check `.sdd/specs/` for active specifications
- Use `/sdd-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in English. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).
- **Specs are Living Documentation**: Stored and versioned natively in Git alongside source code. Specs never drift from code.

## Minimal Workflow
- Phase 0 (Steering): `/sdd-steering`, `/sdd-steering-custom`
- Discovery: `/sdd-discovery "idea"` — identifies action path (Greenfield or Brownfield), writes `brief.md` and `roadmap.md`
- Phase 1 (Specification):
  - Single spec: `/sdd-spec-quick {feature} [--auto]` or step-by-step:
    - `/sdd-spec-init "description"`
    - `/sdd-spec-requirements {feature}`
    - `/sdd-validate-gap {feature}` (gap & blast-radius analysis on existing codebase)
    - `/sdd-spec-design {feature} [-y]`
    - `/sdd-validate-design {feature}` (design review gate)
    - `/sdd-spec-tasks {feature} [-y]`
  - Multi-spec: `/sdd-spec-batch` — initializes all specs from roadmap.md in parallel dependency waves
- Phase 2 (Implementation): `/sdd-impl {feature} [tasks] [--review required|inline|off]`
  - Without task numbers: autonomous mode (subagent per task + independent review + verify gate)
  - With task numbers: manual mode (selected tasks only in main context)
  - `/sdd-validate-impl {feature}` (standalone feature-level verification; supports Agentic QE autonomous validation fleets)
- Governance & Compliance: `/sdd-audit {feature}` — generates auditable compliance report (EU AI Act, NIST RMF, ADR genealogy)
- Progress check: `/sdd-spec-status {feature}` (use anytime)

## Skills Structure
Skills are located under the agent-specific skills directory (e.g., `.claude/skills/sdd-*/SKILL.md`, `.agents/skills/sdd-*/SKILL.md`, etc.):
- Each skill is a directory with a `SKILL.md` file
- Skills run inline with access to conversation context
- Skills delegate parallel research to subagents for context efficiency
- `sdd-review` — task-local adversarial review protocol
- `sdd-debug` — root-cause-first debug protocol
- `sdd-verify-completion` — fresh-evidence gate before success or completion claims
- **If there is even a 1% chance a skill applies to the current task, invoke it.**

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Karpathy Guidelines (Think before coding, Simplicity first, Surgical changes, Goal-driven execution) are mandatory.
- Autonomous Quality Engineering: Agentic QE (`agentic-qe.dev`, PACTS framework) enabled for boundary-scoped metamorphic invariant testing.
- Keep steering current and verify alignment with `/sdd-status`.

## Steering Configuration
- Load entire `.sdd/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/sdd-steering-custom`)
