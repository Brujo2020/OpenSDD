# Requirements — measure

**Objective:** points 8 and 10 of `docs/REVISION-EXPERTO.md`, reusing `metaEval` (κ), the mutation
harness and the `_shared` tree.

## REQ-S3-001 — Calibration by κ
- Statement: `assure calibrate` shall run a labelled corpus of seeded defects against the audit-chain, escalation and EARS detectors and report n, κ, precision, recall, misses and false alarms per detector.
- Statement: The [report] shall mark a detector as able to block only when κ ≥ `SUBSTANTIAL_KAPPA` and n ≥ `PREREGISTERED_N`.

## REQ-S3-002 — Mutants for the trust controls
- Statement: The [mutation harness] shall include a `trust` family whose mutants disable the audit chain, the no-progress escalation, the agent approval refusal, the agent human-review refusal and the `check` stop, each killed by a named test.

## REQ-S3-003 — One source for what is identical everywhere
- Statement: `npm run sync:templates` shall copy the skills listed in `_shared/shared-skills.json` to every agent tree and write `templates/shared/always-on-rules.md` between the rules markers of every quickstart; `--check` shall write nothing and exit 1 on any drift.
- Statement: Installed commands shall read the always-on rules from the same file.
