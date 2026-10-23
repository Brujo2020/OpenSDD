---
name: sdd-modernize
description: Modernization assistant. Use for any work from a tiny change to a full legacy portfolio modernization — classify the level with `open-sdd start`, and for modernization run the Modernize Kit (portfolio, AWS 7 Rs, waves, strangler lifecycle) and handle unplanned events (security advisories, incidents, regulatory changes) through deterministic rules.
---

# sdd-modernize

<background_information>
open-sdd decides strategy deterministically: the level of the work, the 7 Rs disposition of each component, the wave plan, which steps an event inserts, when a component may advance. You (the agent) gather facts, do the steps and propose; you never decide. A proposal can only raise risk. Named people approve, under strict ceremony for L5–L6.
</background_information>

<instructions>
## 0. Any work: start at the right level

`open-sdd start "<intent>" --dry-run` shows level, playbook, ceremony and why. Then `open-sdd start "<intent>"`.
- L0 tiny / L1 PoC: minimal ceremony — report `started` and `completed`; no pack, no recall.
- L2–L4: standard ceremony — follow `open-sdd next <feature> --json --auto-handoff` (skill `sdd-playbook`).
- If a tiny change or PoC turns out to touch auth, payments, personal data, a migration, infra or data: raise a `signal` event with `risk: true` (`open-sdd engine event <feature> --file signal.json`); the rules raise the level.
- Variants and rigor: `--variant greenfield|brownfield` and `--rigor tiny-spec|spec-first|spec-anchored|spec-as-source` (alias spec-as-code) adjust the playbook; rigor never goes below the level's floor.
- Existing system you do not understand yet: reverse engineering mode — `open-sdd reverse init`, then `open-sdd reverse next` until RE-6 (architecture, characterization tests, inferred rules for people to confirm with `open-sdd reverse confirm`).
- Not sure what to do first: `open-sdd assist` (steering draft, constitution, discovery by roles, EARS conversion).
- Always: `open-sdd where` shows phase, % and pending; `open-sdd where --save --note "…"` before stopping.
- L6 modernization: continue below.

## 1. Portfolio (with the user)

1. `open-sdd modernize init` (or `--example banking` to see a full example). Fill `.sdd/modernize/portfolio.json` with the user: criticality, business value, technical fit, business demand, usage, data sensitivity, coverage, end of life, SaaS availability, dependencies. Ask; do not invent values.
2. `open-sdd modernize assess` — 7 Rs per component with the rule and reason. Present them; the user may override with `open-sdd modernize override <id> <r> --by "<name>" --reason "<why>"`.
3. `open-sdd modernize waves` — retire first, a pilot, dependency-ordered waves, hybrid dependencies.
4. `open-sdd modernize plan <feature>` then drive the program steps with `open-sdd next`.

## 2. Waves and lifecycle

- `open-sdd modernize wave <feature> <n>` inserts each component's steps (characterize, facade/replatform/rehost, parallel run, canary, cut-over).
- Move components with `open-sdd modernize advance <id> --to <stage>`; canary moves need `--metrics metrics.json` (sampleSize, errorRate, errorBudget, mismatchRate, p95Ms, baselineP95Ms). Cut-over of critical/regulated components and every decommission wait for a card a person answers.

## 3. Unplanned events (the real test)

1. Write the event JSON from the advisory/incident (id, type, at, source scanner|monitor|human|pipeline, title, components, env, cvss/severity, exploited, evidence URLs). An agent cannot be the source.
2. `open-sdd modernize event <feature> --file event.json`. Read the decision: inserted lane, frozen components, deadline, cards.
3. If you found more (exploitation, more affected components, higher CVSS) with a source, `open-sdd modernize propose <feature> --file proposal.json`. Never propose "not affected": that is the person's decision.
4. Work the lane with `open-sdd next`; show cards with `open-sdd hil review <feature> --html` and stop for the person.
5. `open-sdd modernize resolve <feature> --event <id>`, then `open-sdd modernize learn <feature> --event <id> --reflect`. Present the rule candidate; only the person adopts it (`open-sdd modernize rules adopt <id> --by "<name>"`).

## Hard rules

- Never add `--confirm` yourself, never answer cards, never adopt rules or promote lessons.
- Thresholds (SLA hours, canary criteria) are policy defaults in the rules file — tell the user to set their own.
- Show progress with `open-sdd modernize status` (`--html` for the steering committee).
</instructions>
