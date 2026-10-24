# Revisión experta 2 — 10 mejoras para el mejor kit SDD

Una segunda revisión con tres lentes: **arquitectura y patrones agénticos**, **determinismo en procesos con LLM**
y **consultoría tecnológica** (ofertas, estimación y aceptación con cliente). Cada punto se resolvió en el
código con un test que lo demuestra. Nada de esta revisión sustituye la evaluación de un caso real.

| # | Lente | Problema encontrado (con evidencia) | Cambio | Prueba |
|---|---|---|---|---|
| 1 | Determinismo | La CI de `main` estaba en rojo: `check` leía `process.env.CI` y no el entorno inyectado, así que el test pasaba en local y fallaba en GitHub. | `check` usa el entorno del runtime; el test inyecta `CI` explícitamente. | `trustFloor.test.ts` pasa con y sin `CI=true` |
| 2 | Agéntica / adopción | Construir la constitución era hostil: un proyecto nuevo «escríbela a mano»; las respuestas de la entrevista iban a un fichero JSON; la decisión de fronteras se «aplicaba» a un principio que no existía y se perdía; y los principios normativos no se podían ratificar sin evidencia del código, es decir, nunca en un proyecto nuevo. | Asistente guiado: `open-sdd assist constitution` (y al final de `setup --write`) pregunta de a una, Enter = valor por defecto, «?» = por qué; guarda el borrador y ofrece ratificar con nombre. Las decisiones normativas se ratifican por persona nombrada; las descriptivas siguen exigiendo evidencia. | `constitutionGuided.test.ts`; E2E con pseudo-terminal |
| 3 | Seguridad agéntica | Una spec es lo que el agente lee como instrucciones, pero C2 solo escaneaba los ficheros cambiados: una inyección ya comprometida en `.sdd/specs` pasaba siempre. Faltaban patrones dirigidos a agentes. | C2 escanea siempre `specs/` y `steering/`; nuevos patrones `guardrail-bypass`, `self-approval`, `role-header`. El repositorio propio sigue en verde. | `expertReview2.test.ts` |
| 4 | Determinismo | Tres vocabularios de «términos vagos»: C1 y clarify aceptaban *quickly* mientras `requirements review` lo marcaba. | Una sola lista en `ears.ts` que usan C1, el asistente EARS y clarify. | `expertReview2.test.ts` |
| 5 | Agéntica | Con requisitos no comprobables, la acción siguiente apuntaba a un comando de consejo; sin constitución, a escribirla. | La siguiente acción es `brownfield clarify <f>` o `assist constitution`, con su porqué. | `coreSddScore.test.ts` |
| 6 | Consultoría | No había forma de pasar de la spec a una oferta. | `open-sdd estimate <f>`: P50/P90 de esfuerzo y calendario con paralelismo, penalización por ambigüedad abierta, factores declarados y sustituibles en `.sdd/settings/estimate.json`. `--sow` redacta alcance, exclusiones, entregables, criterios de aceptación, supuestos y riesgos. | `expertReview2.test.ts` |
| 7 | Agéntica | `impl --parallel` no decía cuánto ahorra el paralelismo. | Línea de camino crítico: olas frente a tareas y aceleración máxima, con el consejo de marcar `(P)` y `_Boundary:_`. | ejecución manual |
| 8 | Consultoría | Las migraciones no tenían estimación por ola. | `open-sdd migrate estimate`: semanas-persona P50/P90 por ola según la R, la criticidad, la cobertura de tests y la regulación; pesos en `.sdd/settings/migration-estimate.json`. | `expertReview2.test.ts` |
| 9 | Consultoría | La trazabilidad no salía en un formato que un cliente firme. | `open-sdd trace <f> --csv`: requisito × tarea × estado × evidencia; los huecos aparecen como `uncovered` y `unlinked`. | `expertReview2.test.ts` |
| 10 | Agéntica | Una petición enorme se clasificaba (L4) pero el reparto en features era manual. | `start` propone una spec por cada trozo literal de la lista («:», with/con), con el comando exacto. No decide por ti. | `expertReview2.test.ts` |

## Límites declarados

- Los factores de estimación son **valores de partida**, no un estándar ni una calibración: cada salida lo dice.
- Los patrones de inyección son heurísticos: reducen el riesgo, no lo eliminan. Un falso positivo se declara en `.sdd/settings/security-allowlist.json` con motivo.
- El asistente guiado se probó con una pseudo-terminal; queda pendiente probarlo en Terminal.app y en Windows Terminal.
- En una constitución que ya tiene `C-BOUNDARIES` (código con fronteras), la respuesta permitir/prohibir solo la confirma; no la reescribe.
