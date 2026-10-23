# Handoff

## Objetivo
Implementar la spec `.sdd/specs/multi-unit-playbooks/` (18 requisitos REQ-PB-001…018, 17 criterios AC-01…AC-17, 18 tareas en 6 olas) y publicar **v3.6.0**: un ciclo planificar → ejecutar → comprobar → decidir → aprender → mejorar, con playbooks a medida por caso, un contrato `next`/`report` común a todos los hosts, revisión humana (HIL) preparada, memoria con procedencia y mejora por propose‑probe‑compose. Fuentes: AWS AI-DLC (método), Google Harness² (método), open-sdd.

## Estado actual
**Parcial. Escrito ≠ verificado.** El núcleo (`src/core`) de casi todas las tareas está escrito y compila; **no hay tests nuevos, no hay comandos CLI conectados, ni help, skill, plugin, docs, claims ni release.** La suite existente sigue en verde.

| Tarea (tasks.md) | Estado | Fichero(s) |
|---|---|---|
| 1 Perfil | escrito, sin test | `src/core/profile.ts` |
| 2 Directivas `next`/`report` | escrito, sin test, sin CLI | `src/core/engine.ts` |
| 3 Ficheros de preguntas | escrito, sin test, sin CLI | `src/core/questions.ts` |
| 4 Memoria: captura, reflector, gate de admisión | escrito, sin test, sin CLI | `src/core/memoryStore.ts` |
| 5 Tipo `multi-unit` | **hecho y verificado** (test actualizado) | `src/core/sddModes.ts`, `test/steelforgePort.test.ts` |
| 6 Playbook: catálogo, checker, `when` | escrito, sin test | `src/core/playbook.ts`, `templates/playbooks/aidlc-stages.json` |
| 7 Promoción, índice, dedupe, retirada | escrito, sin test, sin CLI | `src/core/memoryStore.ts` |
| 8 Tarjetas HIL, ids con semilla, escalera de aprobación | escrito, sin test, sin CLI | `src/core/hilCards.ts`, `engine.ts` (`applyDecision`) |
| 9 Biblioteca de playbooks y planner | escrito, sin test | `templates/playbooks/**/*.playbook.json` (13), `src/core/playbookPlanner.ts` |
| 10 Paquete de traspaso, recall, stale | escrito, sin test, sin CLI | `src/core/handoff.ts` |
| 11 Guard de artefactos, recibos de revisión, freeze, traza de fase | escrito, sin test; **freeze no conectado al pre-commit** | `src/core/reviewReceipts.ts`, `engine.ts` |
| 12 Árbitro de olas | escrito, sin test; **no conectado a `waves`** | `src/core/waveReferee.ts` |
| 13 Skill `sdd-playbook` | **no iniciado** | — |
| 14 Build multi-host | escrito, sin test, sin CLI | `src/core/playbookBuild.ts` |
| 15 Plugin AI-DLC, importador, status | importador y status **escritos**; plantilla del plugin **no iniciada** | `src/core/aidlc.ts`, `importers.ts`, `cli/commands/status.ts` |
| 16 Estadísticas HIL y propuestas de umbral | escrito, sin test (vive en `hilCards.ts`, no en `hitlStats.ts`) | `src/core/hilCards.ts` |
| 17 `playbook improve` | escrito, sin test, sin CLI | `src/core/playbookImprove.ts` |
| 18 Docs, help, claims | **no iniciado** | — |
| Release v3.6.0 | **no iniciado** | — |

## Contexto y decisiones
- **Playbooks en JSON** (`.playbook.json`), no YAML: el repo no tiene librería YAML y `C-STACK-FACT` prohíbe añadir dependencias. **Pendiente actualizar la spec** (plan §4 y requirements muestran YAML).
- **Artefactos open-sdd con prefijo `sdd:`** (`sdd:requirements`, `sdd:tasks`…); los de AI-DLC sin prefijo. Así el checker distingue productores de ambos mundos.
- **Regla de inanición:** un paso que corre y requiere un artefacto cuyo productor está en el plan pero se salta (o va después) → `STARVED_STEP`, exit 1.
- **`when`** se evalúa en open-sdd; `unknown` nunca satisface una comparación.
- **`approved` nunca sale de `report`**: solo de `hil answer --by` → `applyDecision`. El valor por defecto de una tarjeta nunca puede aprobar; `irreversible-damage` debe aparcar; `accept-as-is` solo desde la 3.ª revisión; override rechazado en modo autónomo.
- **Reflector (Harness²):** `confounded` se fuerza si cambió más de un componente o solo hay 1 run; una lección apoyada solo en filas `confounded` queda en cuarentena.
- **Planner sin modelo:** bandas LOW <0.30, MED <0.70, HIGH; coste ≥4 necesita >0.4, 2–3 >0.2, 1 >0; biblioteca a ≤2 decisiones de distancia → se propone sin cambios. La puntuación compuesta se muestra como no calibrada.
- **Árbitro de olas:** rechaza grafos con ciclo (a diferencia de `scheduler.ts`, que fuerza el orden).
- **Snapshot AI-DLC** (`aidlc-stages.json`, v2.7.1): `produces` sale de la referencia de artefactos; `consumes` está simplificado; `cost`/`component` son priors de open-sdd. **El esquema del bloque de dependencias de unidades de AI-DLC no está verificado**; el parser es tolerante y, si no puede leerlo, lo deja como aviso.
- Descartado: el compuesto de AI-DLC como router, sus hooks de Stop/compactación, el bucle LLM de Harness² y la adopción automática.

## Entorno local
- Plataforma: macOS (host) + sandbox Linux para build/tests.
- Repo: `/Users/mramospe/Proyectos/Development/open-sdd`.
- Rama del commit: `feat/multi-unit-playbooks`, creada desde `main` `12967c6` (v3.5.0, igual a `origin/main`).
- El commit se hizo en una copia de trabajo del sandbox y se entrega como **bundle** `feat-multi-unit-playbooks.bundle` en la raíz del repo (las operaciones git directas sobre la carpeta montada dejan `index.lock`).
- `node_modules` de `tools/open-sdd` instalado con `npm ci`.

## Repositorio remoto
- `origin` = `https://github.com/Brujo2020/OpenSDD.git`, `main` en `12967c6`.
- La rama `feat/multi-unit-playbooks` es **solo local; no publicada**.

## Cambios realizados
- `.sdd/specs/multi-unit-playbooks/` — la spec (requirements, plan, tasks, spec.json).
- `tools/open-sdd/src/core/` nuevos: `profile.ts`, `playbook.ts`, `playbookPlanner.ts`, `playbookBuild.ts`, `playbookImprove.ts`, `engine.ts`, `questions.ts`, `memoryStore.ts`, `hilCards.ts`, `handoff.ts`, `reviewReceipts.ts`, `waveReferee.ts`, `aidlc.ts`.
- Modificados: `sddModes.ts` (tipo `multi-unit`, export `MODULE_IDS`), `importers.ts` (fuente `aidlc`, `content` generado), `cli/commands/status.ts` (línea AI-DLC de solo lectura cuando `lead: aidlc`).
- `tools/open-sdd/templates/playbooks/`: `aidlc-stages.json` + 13 playbooks (`base/{explore,spec-first,spec-anchored,spec-as-source}`, `greenfield`, `brownfield-extension`, `legacy-untested`, `bug`, `refactor`, `spike`, `fuzzy-idea`, `multi-feature`, `multi-unit`).
- `tools/open-sdd/test/steelforgePort.test.ts`: la lista de tipos incluye `multi-unit`.
- `tools/open-sdd/dist/`: recompilado desde `src`.
- Sin migraciones, flags ni cambios de contrato en comandos existentes, salvo `import` aceptando `aidlc`.

## Evidencia
- `npx tsc --noEmit -p tools/open-sdd` → sin errores.
- `npm run build` → exit 0.
- `npx vitest run` en `tools/open-sdd` → **156 ficheros, 2047 tests en verde**. Ninguno cubre los módulos nuevos.
- Sobre la spec (copia): constitución 0 errores, adhesión 97/100, 1 aviso `BOUNDARY_VIOLATION`; `open-sdd waves multi-unit-playbooks` → 6 olas.
- No ejecutado: ningún comando nuevo de punta a punta, AC-01…AC-17, `assure claims --verify` con claims nuevos, validador de plugins de AI-DLC.

## Fallos e intentos
- `test/steelforgePort.test.ts` falló al añadir `multi-unit` (lista cerrada de tipos) → se actualizó la lista.
- `test/wave2Weaknesses.test.ts` (dist = src) falló con un `dist/` desactualizado → se recompiló y se copió `dist/`.
- `git status` sobre la carpeta montada dejó `.git/index.lock` vacíos dos veces → todo git se hace en la copia del sandbox; si ves un `index.lock` vacío, bórralo.

## Pendiente
1. **CLI** (`src/cli/commands/playbook.ts` nuevo + routing en `src/index.ts` + entradas en `help.ts`, que `cliHelpContract.test.ts` exige):
   - `playbook profile|check|plan|build|improve|save|list`
   - `engine start|status`, `next <feature> --json`, `report <feature> --step --result`
   - `handoff write|recall|check`, `questions check|confirm`
   - `hil prepare|answer|list|stats`, `memory capture|reflect|promote|withdraw|list`
   - `review record|freeze-check`; `waves <feature> --baseline <n> --protect …` y `--verify <n> --check "<cmd>"`
2. **Tests** por módulo, con un fixture por criterio AC-01…AC-17.
3. **Freeze** en el hook pre-commit (`templates/hooks/pre-commit`) y en el MCP server (`next`/`report` como herramientas).
4. **Skill `sdd-playbook`** en `_shared` y en cada árbol de skills (CLM-027 exige que sean iguales); actualizar los conteos "27 skills" → 28 en docs.
5. **Plugin AI-DLC** en `templates/integrations/aidlc-plugin/opensdd/`: `plugin.json`, sensores `aidlc-opensdd-*.md`, adaptador `tools/aidlc-sensor-opensdd.ts`, contributions, scope, doctor. Comprobar que el test "no orphan template trees" lo tolera. AC-10 con el validador de AI-DLC (necesita bun y el checkout) o informarlo como no ejecutado.
6. **Spec al día:** YAML → JSON; boundary de la tarea 16 → `hilCards.ts`; resolver el aviso `BOUNDARY_VIOLATION`.
7. **Docs** `docs/guides/playbooks.md` con diagramas Mermaid a color (ciclo, quién decide qué, flujo HIL, memoria, multi-host). README EN/ES. Claims en `docs/claims/paper-claims.yaml`.
8. **Release v3.6.0:** versión en ambos `package.json`, CHANGELOG, `assure claims --verify` 0 broken, suite completa, commit. Push y publicación npm los hace Mario.

## Reanudación exacta
1. Traer la rama:
   ```bash
   cd /Users/mramospe/Proyectos/Development/open-sdd
   rm -f .git/index.lock
   git fetch ./feat-multi-unit-playbooks.bundle feat/multi-unit-playbooks:feat/multi-unit-playbooks
   # the working tree already holds exactly these files: point HEAD at the branch without touching them
   git symbolic-ref HEAD refs/heads/feat/multi-unit-playbooks
   git reset
   git status --short        # expected: only the .bundle file, untracked
   rm feat-multi-unit-playbooks.bundle
   ```
2. Verificar: `cd tools/open-sdd && npm ci && npx tsc --noEmit -p . && npx vitest run` → 2047 en verde.
3. Primera acción: crear `src/cli/commands/playbook.ts` con `playbook profile|check|plan` y sus entradas en `help.ts`, más un test para AC-02, AC-03 y AC-04.

## Prompt de continuación
"Abre el repositorio en /Users/mramospe/Proyectos/Development/open-sdd. Lee las instrucciones del proyecto (CLAUDE.md), la spec .sdd/specs/multi-unit-playbooks/ y HANDOFF.md. Verifica primero rama, HEAD, working tree y remote sin modificar nada. Continúa desde 'Reanudación exacta'; no repitas el trabajo ya verificado ni asumas que un commit local fue publicado."
