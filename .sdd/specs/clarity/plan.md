# Plan — clarity

- `core/levels.ts`: `profileFloor`; `cli/commands/modernize.ts` prints it in `start`.
- `core/trustFloor.ts`: `effectiveProfile` (declared ⊔ open runs' floors); used by `gates run` (C5 rule), `decide` (approvers) — the places that read the profile in sprint 1.
- `core/sddScore.ts`: `weakestLink`; `renderScoreFooter` headline.
- `core/gateRunner.ts` (C8): scope findings to `changedFiles`; evidence ≤ 3, blocking first.

## Acceptance criteria
- AC-01: `profileFloor` maps L0–L6; an L5 run raises `solo` to `enterprise`; a declared `enterprise` is not lowered by an L0 run.
- AC-02: footer `SDD 53% · Fase 2 · Implementar · eslabón débil: evidencia · compuesto 93%`.
- AC-03: `gates run C8 --staged` reports findings «en lo que cambia (N en todo el repositorio)»; without scope it says how to scope.
