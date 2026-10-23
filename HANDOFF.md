# Handoff

## Objetivo
Implementar la spec `.sdd/specs/multi-unit-playbooks/` (18 requisitos REQ-PB-001…018, 17 criterios AC-01…AC-17, 18 tareas en 6 olas) y publicar **v3.6.0**: un ciclo planificar → ejecutar → comprobar → decidir → aprender → mejorar, con playbooks a medida por caso, un contrato `next`/`report` común a todos los hosts, revisión humana (HIL) preparada, memoria con procedencia y mejora por propose‑probe‑compose. Fuentes: AWS AI-DLC (método), Google Harness² (método), open-sdd.

## Estado actual
**v3.7.0 (spec `playbooks-v3-7`, 10 mejoras de la revisión) implementada, verificada y subida a GitHub (`feat/playbooks-v3.7` y `main`). npm y tags NO publicados.**

- v3.6.0: ciclo multi-unit completo (ver CHANGELOG).
- v3.7.0: identidad verificable en HIL + `--confirm` en sesiones de agente; plazos aplicados; página `hil review --html`; `improve` sin sesgo (`unobservedRisk`, nunca quita controles humanos/seguridad); captura automática `gate-block`/`human-edit`; telemetría tokens/modelo/duración; planner con escala y riesgo; unidades→olas + lock; `next` legible, `--auto-handoff`, `engine list`, `--mermaid`; `playbook.schema.json`, `playbook new|diff`, recetas `poc-to-feature` y `brownfield-aidlc-inception`.

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
- `npx tsc --noEmit`, `npm run build` OK; `open-sdd --version` → v3.7.0.
- `npx vitest run` → **160 ficheros, 2083 tests en verde, 1 skipped (AC-10 de v3.6)**; nuevos `test/playbooksV37Ac.test.ts` (AC-01…AC-10 de v3.7).
- `assure claims --verify` → 73 claims, 70 verificadas, 3 no medidas, **0 rotas** (nuevas CLM-072, CLM-073).
- `status playbooks-v3-7 --check` y `status multi-unit-playbooks --check` → 0 errores, 0 avisos de frontera.
- No ejecutado: AC-10 de v3.6 (validador AI-DLC); `npm publish`; push de tags (el proxy de la sesión los rechaza).

## Fallos e intentos
- `test/steelforgePort.test.ts` falló al añadir `multi-unit` (lista cerrada de tipos) → se actualizó la lista.
- `test/wave2Weaknesses.test.ts` (dist = src) falló con un `dist/` desactualizado → se recompiló y se copió `dist/`.
- `git status` sobre la carpeta montada dejó `.git/index.lock` vacíos dos veces → todo git se hace en la copia del sandbox; si ves un `index.lock` vacío, bórralo.

## Pendiente
1. `npm publish` de 3.7.0 (Mario).
2. Tags: `git tag v3.6.0 <commit release 3.6> && git tag v3.7.0 origin/main && git push origin --tags` desde el Mac.
3. AC-10 v3.6: validar `templates/integrations/aidlc-plugin/opensdd/` con el validador de AI-DLC.
4. La detección de sesión de agente es un freno, no autenticación (plan v3.7 D-3); para firma real, evaluar commits/respuestas firmados con GPG/SSH.

## Reanudación exacta
```bash
cd /Users/mramospe/Proyectos/Development/open-sdd
git fetch origin && git checkout main && git reset --hard origin/main   # solo si no hay cambios locales propios
cd tools/open-sdd && npm ci && npm run build && npx vitest run
```
Primera acción: AC-10 con el checkout de AI-DLC, o `npm publish` desde la raíz.

## Prompt de continuación
"Abre el repositorio en /Users/mramospe/Proyectos/Development/open-sdd. Lee las instrucciones del proyecto (CLAUDE.md), la spec .sdd/specs/multi-unit-playbooks/ y HANDOFF.md. Verifica primero rama, HEAD, working tree y remote sin modificar nada. Continúa desde 'Reanudación exacta'; no repitas el trabajo ya verificado ni asumas que un commit local fue publicado."
