# Revisión experta 3 — 5 mejoras de cierre

Lente: arquitectura de agentes en producción y lo que hoy es estándar para operarla con garantías:
observabilidad abierta, superficie MCP, cadena de suministro verificable, coste visible y estado donde
ocurre la revisión (el PR).

| # | Brecha | Mejora | Prueba |
|---|---|---|---|
| 1 | El coste de los agentes no se veía por feature: los pasos ya declaraban tokens y modelo, pero nadie los sumaba. | **FinOps** en `flow`: tokens, modelos, duración y coste estimado con precios declarados en `.sdd/settings/finops.json`; aviso al superar el presupuesto. | `e2eClosing.test.ts` §1 |
| 2 | La auditoría solo vivía en ficheros del repo. | **OpenTelemetry**: `audit trail --otlp <f>` exporta OTLP/JSON (`event.name`, `gen_ai.request.model`, `sdd.*`) para cualquier backend vía Collector. | §2 |
| 3 | Agentes y tableros no podían consultar el estado nuevo por MCP. | **MCP**: `open_sdd_flow`, `open_sdd_validation`, `open_sdd_audit_trail`, con las mismas funciones que la CLI. | §3 |
| 4 | Nada probaba después QUÉ spec se entregó. | **Atestación in-toto v1**: `attest <feature> --write` (sha256 de spec y constitución, commit, estado, validación, cabeza de la cadena de auditoría); `attest --verify` detecta cambios, líneas borradas e historia reescrita. Firmar con Sigstore queda fuera y se indica. | §4 |
| 5 | El estado no llegaba al PR. | **Markdown**: `flow --markdown`; la GitHub Action lo publica en el resumen del job (y pasa a Node 22). | §5 |

Límites: el coste es una estimación con los precios que declares, no una factura; el tipo de predicado de
la atestación es propio del proyecto; la atestación no está firmada hasta que la firmes.
