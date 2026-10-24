# Requirements — trust-floor

**Objective:** close the five critical points of `docs/REVISION-EXPERTO.md` reusing existing pieces:
approvers are known, the audit log cannot be rewritten silently, the floor reaches CI, a missing sensor
never approves, and every `check` loop escalates to a person.

## REQ-TF-001 — Known approvers
- Statement: WHEN `setup --write` runs in a repository with a git identity and no `.sdd/settings/approvers.json`, the [installer] shall write it with that identity.
- Statement: WHILE the governance profile is `team` or `enterprise`, the [HIL] shall refuse an approval when no approvers list exists (`APPROVERS_REQUIRED`).

## REQ-TF-002 — Tamper-evident audit log
- Statement: The [engine] shall store in every audit event `prev`, the sha256 of the previous line.
- Statement: WHEN a chained audit line does not match the sha256 of the line before it, or a line after the first chained one has no `prev`, the [gate run] shall fail with `AUDIT_CHAIN_BROKEN`, and the [engine] shall treat `AUDIT_CHAIN_BROKEN` as a critical code.

## REQ-TF-003 — The floor reaches CI
- Statement: WHEN `setup --write` runs in a git repository without `.github/workflows/open-sdd-gates.yml`, the [installer] shall write the PR gate workflow (`floor install --ci` template) for the `team` and `enterprise` profiles and plan it as offered (`keep`, with the command) for `solo`.

## REQ-TF-004 — No silent approval by a missing sensor
- Statement: WHILE the governance profile is `team` or `enterprise`, WHEN C5 is self-authorized because its sensor is unavailable and the feature has no fresh review receipt, the [gate run] shall fail with `REVIEW_REQUIRED`.

## REQ-TF-005 — `check` feeds the escalation
- Statement: WHEN `check` fails, the [console] shall record `CHECK_FAILED` with the failing gates in the audit log of `_check` and apply `escalationVerdict`; WHEN it escalates, it shall prepare a decision card for `_check`.
- Statement: WHILE a `_check` decision card is open or answered only with `park`, `check` shall exit 1 and name the `decide` command; a person's retry (`reject`) or exception (`override`) lifts it.

## Out of scope
- Verifying approvals through PR reviews / CODEOWNERS (documented as the next step).
