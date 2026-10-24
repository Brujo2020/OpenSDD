# Handoff

## Objetivo
Implementar la spec `.sdd/specs/multi-unit-playbooks/` (18 requisitos REQ-PB-001…018, 17 criterios AC-01…AC-17, 18 tareas en 6 olas) y publicar **v3.6.0**: un ciclo planificar → ejecutar → comprobar → decidir → aprender → mejorar, con playbooks a medida por caso, un contrato `next`/`report` común a todos los hosts, revisión humana (HIL) preparada, memoria con procedencia y mejora por propose‑probe‑compose. Fuentes: AWS AI-DLC (método), Google Harness² (método), open-sdd.

## Estado actual
**v3.9.0 publicada** (2026-10-23): npm `@brujo2020/open-sdd@3.9.0` = `latest` (shasum `8eecdbe3…`), tag `v3.9.0` → `7c13697` en GitHub. Tras ella, sin versión nueva: pendientes cerrados y tres reglas nuevas del usuario (en `main`, sin publicar en npm).

- v3.8.0: escalera L0–L6, reglas dinámicas deterministas, Modernize Kit.
- v3.9.0: variantes greenfield/brownfield; escalera de rigor tiny-spec → spec-first → spec-anchored → **spec-as-code** (`spec-as-source` aceptado como sinónimo); reverse engineering RE-1…RE-6; asistentes (`assist`); `where`; **conversor EARS v2**; **plugin AI-DLC** en el formato real (`.aidlc-plugin/plugin.json`, sensores `aidlc-opensdd-*`, fail closed).
- Post-release (`70ea828`): `docs/MANUAL.md` §7.2 EARS v2 y sección AI-DLC; README con diagramas Mermaid.
- Post-3.9.0 (2026-10-23):
  - **C-INDEPENDENT-REVIEW** (invariante MUST, enmienda en vigor `AMD-INDEPENDENT-REVIEW`): toda constitución generada lo incluye; `validateConstitution` avisa si falta; `review record --by-model <id> --author-model <id>` rechaza que revise el mismo modelo que generó.
  - **Escalado a HIL por falta de progreso** (`escalationVerdict`): 1.er fallo crítico (`RECEIPT_TAMPERED`, `QUESTIONS_CHANGED`), 2.º fallo idéntico sin menos problemas, o más de 3 fallos con progreso; el contador se reinicia con decisión humana, escalado o compleción. Motivo: un número fijo corta a un agente que converge y deja que uno atascado gaste intentos; «3» es el tope pedido por Mario, sin respaldo empírico medido.
  - **Karpathy siempre**: skill `karpathy-guidelines` (copia literal de github.com/multica-ai/andrej-karpathy-skills, MIT, con `NOTICE.md`) en los 9 árboles de skills + workflow Axet; regla en `settings/rules/karpathy-guidelines.md`; las 3 reglas en los 19 quickstarts (CLAUDE/AGENTS/GEMINI/QWEN.md).
  - REQ-STD-012 cerrada: `delta validate` reporta como **consultivo** el símbolo nuevo sin `reuse:` y su candidato `fichero:línea`; nunca cambia el exit.
  - Spec `multi-unit-playbooks`: ejemplo del plan §4 pasado de YAML a JSON.
  - **QC 2026-10-23 (5 fallos críticos, `test/qcCritical.test.ts`: 9 tests rojos con el código anterior → verdes):** (1) el agente ya no aprueba tarjetas HIL / adopta reglas / confirma reglas RE con `--confirm <id>`: hace falta teclear el id en `/dev/tty` (`confirmOnTty`, 60 s; nunca pregunta bajo vitest); (2) una sesión de agente no firma revisiones «humanas»; (3) el escalado prepara la tarjeta (A reintentar=solo persona · B aparcar=default · C excepción, no en autónomo) y se re-presenta al reanudar; (4) `setup` instala `.sdd/settings/rules/karpathy-guidelines.md` y cada comando lleva las 3 reglas; (5) la puerta sugiere `setup`/`start`/`check`. Guía visual `docs/GUIA.md`. Residual: un pty programático pasa `confirmOnTty` (documentado).
  - **Sprint 2 de la revisión experta** (spec `clarity`): nivel → perfil mínimo (`effectiveProfile`), titular = eslabón más débil, estándares solo en lo que cambia (≤3). Tests `sprint2.test.ts` 3/3 rojos antes → verdes; suite 174/2512; revisión Sonnet aplicada (runs terminados mantienen el suelo, rutas normalizadas). Pendiente: hook de commit y bloqueo sin spec con perfil efectivo; sprint 3 (puntos 8 y 10).
  - **Sprint 1 de la revisión experta** (spec `trust-floor`, `docs/REVISION-EXPERTO.md`): aprobadores en `setup` y obligatorios en team/enterprise; cadena de hashes en la auditoría (`AUDIT_CHAIN_BROKEN` crítico); PR gate en `setup` para team/enterprise; `REVIEW_REQUIRED` si C5 no tiene sensor; `check` escala y se detiene (no en CI). Tests `trustFloor.test.ts`: 5/5 rojos con el código anterior → 6/6 verdes; suite 173/2509. Límites declarados en el documento. Siguiente: sprint 2 (puntos 6, 7, 9).
  - **Experiencia simple «una puerta, cinco verbos»** (spec `simple-experience`, REQ-SX-001…005): `--help`/`help` = 5 verbos en 15 líneas; `help --all` = catálogo completo; `setup` = `init`; `check` = `gates run`; `decide` = decisiones humanas pendientes (tarjetas HIL y gates escalados) con el comando exacto. Nada eliminado. README/README.es/MANUAL abren con los 5 verbos, 2 diagramas Mermaid, leyenda de colores 🟢🟡🔴🔵 y las 3 reglas; 19 quickstarts y `sdd-help` presentan los verbos primero.

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
- 2026-10-23 (post-3.9.0), en copia Linux del repo (el `node_modules` local es de macOS): `tsc` OK; `vitest run` → **170 ficheros, 2477 tests en verde, 1 skipped**; `assure claims --verify` → 82 claims, 0 rotas (nuevas CLM-081 revisión independiente, CLM-082 escalado HIL; CLM-049 excluye la enmienda invariante); `gates run` → la cadena pasa.
- QC + escalado por progreso: `vitest run` → **172 ficheros, 2503 tests en verde**; claims 84, 0 rotas (CLM-084); `check` en este repo → «La cadena pasa»; `confirmOnTty` probado: sin terminal → false, con pty + id → true; 4 diagramas de `docs/GUIA.md` renderizados con `mmdc`; revisión independiente (Sonnet) aplicada.
- simple-experience: `vitest run` → **171 ficheros, 2483 tests en verde**; claims 83, 0 rotas (CLM-083); en este repo `check` → «La cadena pasa» exit 0, `decide` → «Nada que decidir.»; los 4 diagramas nuevos renderizados con `mmdc` sin error; revisión independiente (Sonnet) aplicada (error de uso en `decide f card`, pruebas de pie de `check`, ruta de respuesta y gate escalado).
- `delta validate` manual: `getUsers` → candidato `getUser` en `src/session.ts:1`, exit 0.
- `npx -y @brujo2020/open-sdd@3.9.0 --version` → `open-sdd v3.9.0`. `npm view … dist.attestations` vacío: 3.9.0 **sin provenance**.
- Revisión independiente del diff por otro modelo (Sonnet): hallazgos aplicados (retorno temprano + try/catch del aviso de reutilización, prueba de frescura de recibos, reinicio del contador al completar).
- v3.9.0: 167 ficheros / 2408 tests; 80 claims, 0 rotas.

## Fallos e intentos
- `test/steelforgePort.test.ts` falló al añadir `multi-unit` (lista cerrada de tipos) → se actualizó la lista.
- `test/wave2Weaknesses.test.ts` (dist = src) falló con un `dist/` desactualizado → se recompiló y se copió `dist/`.
- `git status` sobre la carpeta montada dejó `.git/index.lock` vacíos dos veces → todo git se hace en la copia del sandbox; si ves un `index.lock` vacío, bórralo.

## Pendiente
1. AC-10 (v3.6): validar el plugin AI-DLC con su validador — requiere checkout de AI-DLC + `bun` (no accesibles en esta sesión). Esquema de dependencias de unidades AI-DLC sigue sin verificar.
1b. El umbral «3» y la definición de progreso no están calibrados con datos reales: medir en uso (eventos `ESCALATED_TO_HIL` por motivo en `.sdd/engine/*.audit.jsonl`).
2. RQC tarea 5 (calibración): bloqueada hasta tener un corpus etiquetado de defectos; no inventar etiquetas.
3. MAT tarea 11: publicar vía `publish.yml` para obtener provenance y construir la imagen Docker.
4. Publicar una versión nueva (p. ej. 3.10.0) con los cambios post-3.9.0 si Mario lo decide.
4b. Subir el tag `v3.8.0` desde el Mac: `git push origin v3.8.0` (creado en local → `9ff144e`; el proxy de la nube bloquea tags).
5. `status variants-reverse --check --strict`: 1 aviso `BOUNDARY_VIOLATION` (archivos nuevos fuera de los límites de la spec: plugin, `rigor.ts` o playbooks base).
6. `README.es.md` no tiene los diagramas nuevos.
7. Informativo: umbrales SLA/canary son valores por defecto (`.sdd/settings/dynamic-rules.json`).

## Reanudación exacta
```bash
cd /Users/mramospe/Proyectos/Development/open-sdd
git fetch origin && git status --short --branch
cd tools/open-sdd && npm ci && npm run build && npx vitest run
```
Primera acción: AC-10 con el checkout de AI-DLC, o decidir la publicación 3.10.0.

## Prompt de continuación
"Abre el repositorio en /Users/mramospe/Proyectos/Development/open-sdd. Lee las instrucciones del proyecto (CLAUDE.md), la spec .sdd/specs/multi-unit-playbooks/ y HANDOFF.md. Verifica primero rama, HEAD, working tree y remote sin modificar nada. Continúa desde 'Reanudación exacta'; no repitas el trabajo ya verificado ni asumas que un commit local fue publicado."
