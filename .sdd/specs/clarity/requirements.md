# Requirements — clarity

**Objective:** points 6, 7 and 9 of `docs/REVISION-EXPERTO.md`, reusing the level ladder, the score
components and the change scope already computed.

## REQ-S2-001 — One knob: the level
- Statement: The [engine] shall derive a governance floor from the level of every open run (L0–L2 `solo`, L3–L4 `team`, L5–L6 `enterprise`), and the profile in force shall be the higher of that floor and the declared `governance.json`.
- Statement: `start` shall print the floor (`profile ≥ <profile>`).

## REQ-S2-002 — The weakest link is the headline
- Statement: The [score footer] shall start with the lowest measured component and, when it is below the weighted average, name it (`eslabón débil: <component>`) and show the average as `compuesto <n>%`.

## REQ-S2-003 — Only what changes
- Statement: WHEN a gate run judges a change (`--staged` or `--base`), the [standards gate] shall count and show only the findings on the changed files, with the repository total in parentheses; otherwise it shall say how to scope it.
- Statement: The [standards gate] shall show at most 3 findings, blocking ones first.
