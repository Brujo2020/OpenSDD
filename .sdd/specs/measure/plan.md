# Plan — measure

- `core/calibrate.ts` (corpus + `runCalibration`, ♻️ `cohensKappa`); `assure calibrate` in `cli/commands/paper.ts`.
- `scripts/mutation.mjs`: family `trust`, M28–M32.
- `scripts/sync-templates.mjs`, `templates/agents/_shared/shared-skills.json`, `templates/shared/always-on-rules.md`; `ALWAYS_ON_RULES` reads the file.
- CI (`.github/workflows/gates.yml`): `sync:templates:check` and `assure calibrate`.

## Acceptance criteria
- AC-01: every detector κ ≥ 0.61, precision 1, no false alarm; misses equal the declared gaps.
- AC-02: `node scripts/mutation.mjs --family trust` → 5/5 killed.
- AC-03: `--check` passes on the repository; a hand-edited copy fails `--check` and is restored by sync.
