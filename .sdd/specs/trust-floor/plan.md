# Plan — trust-floor

- `core/engine.ts`: `appendAudit` chains `prev`; `verifyAuditChain`; `AUDIT_CHAIN_BROKEN` in `CRITICAL_CODES`; `escalationVerdict` also counts `CHECK_FAILED`, reset by `CHECK_PASSED`.
- `core/trustFloor.ts`: `auditChainIssues`, `freshReviewReceipt`, `recordCheckOutcome`, `checkBlock`.
- `cli/commands/paper.ts` (`gates run`): audit chain + C5 rule for every run; escalation only when invoked as `check`.
- `cli/commands/init.ts`: `approvers` and `ci` artifacts.
- `cli/commands/playbook.ts`: `requireApprovers` also for `team`/`enterprise`.
- Tests: `test/trustFloor.test.ts` (AC-01…AC-05), each failing on the previous code.

## Acceptance criteria
- AC-01: `setup --write` writes approvers.json with the git identity; in `team`, an approval without the list is refused.
- AC-02: editing one audit line makes `gates run` fail with `AUDIT_CHAIN_BROKEN`.
- AC-03: `setup --write` with `team` writes the workflow; with `solo` it is planned as offered.
- AC-04: in `team`, C5 unavailable without a receipt fails with `REVIEW_REQUIRED`; with a fresh receipt it passes that rule.
- AC-05: two identical failing `check` runs escalate with a `_check` card; the next `check` exits 1 naming `decide`; after a person's retry it runs again.
