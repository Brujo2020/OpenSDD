# Por qué existe SteelFoundry

> Edición en inglés: [WHY.md](WHY.md) · Manual: [MANUAL.es.md](MANUAL.es.md)

## 1. Por qué nace

Los agentes de código escriben más rápido de lo que un equipo puede revisar, y lo que dan por «hecho» no
es verificable: no se sabe qué requisito cumple, quién lo decidió ni con qué evidencia. Los toolkits de
Spec-Driven Development existentes resuelven trozos del problema:

- unos ordenan las fases (requisitos → diseño → tareas) pero suponen un proyecto nuevo;
- otros traen roles y discovery pero dejan la decisión final al modelo;
- otros describen cambios sobre código existente pero no gobiernan quién aprueba;
- casi ninguno escala la ceremonia: una errata recibe el mismo proceso que una migración, o al revés.

Un equipo que usa varios agentes y varios tipos de trabajo acaba con varios toolkits, cada uno con sus
archivos, su vocabulario y su propia idea de «hecho». SteelFoundry nace para **consolidar en un solo
toolkit todo el rango de casos** (de una PoC a un programa de migración regulado), **sobre cualquier
agente y modelo**, con **un motor determinista** que decide lo que la evidencia puede decidir y deja a una
**persona con nombre** lo que es una decisión humana.

## 2. Qué soluciona

| Problema | Cómo lo resuelve SteelFoundry | Dónde |
|---|---|---|
| «Hecho» sin pruebas | gates ejecutables (C1–C8) y validación exigida por reglas en cada tarea; exit 1 si falta | `check`, `validation` |
| Un mismo proceso para todo | niveles L0–L6 y escalera de rigor decididos por la intención y el repositorio; el riesgo solo sube | `start`, §4 del manual |
| El agente decide lo que no le corresponde | el motor dicta el siguiente paso; aprobar, ratificar y adoptar reglas exige a una persona (terminal + email git) | `next`, `decide`, `govern constitution --ratify` |
| Requisitos ambiguos que el agente rellena inventando | EARS, coach de requisitos y clarify; avisa y ofrece clarificar en el acto | `assist ears`, `requirements review`, `brownfield clarify` |
| Código existente tratado como si fuera nuevo | specs delta (lo que cambia, no el sistema), constitución descriptiva desde el código, oráculo de regresión | `delta`, `brownfield` |
| No se sabe en qué va | estado claro (5 estados, etapa n/9, qué bloquea, siguiente orden) para personas, tableros y PR | `flow`, `flow --json/--markdown` |
| No se puede auditar | registro de decisiones encadenado por hash: quién, por qué, sobre qué requisito y principio; atestación de lo entregado | `audit trail`, `attest` |
| Cada agente con su herramienta | skills, comandos y MCP para 25+ hosts; el mismo `.sdd/` | `integrate`, `mcp` |
| Ofertas a ojo | estimación P50/P90 desde las tareas y borrador de alcance (SOW) | `estimate --sow`, `migrate estimate` |

## 3. Qué valor aporta

- **Previsibilidad**: mismas entradas → misma decisión (nivel, playbook, exigencia de pruebas, disposición 7R). Se puede discutir el supuesto, no el método.
- **Confianza demostrable**: cada «hecho» trae su evidencia; cada decisión, su autor y su porqué; cada entrega, su atestación.
- **Proporcionalidad**: lo pequeño sigue siendo rápido (L0: 2 pasos); lo crítico recibe más pruebas y aprobaciones, sin configurarlo a mano.
- **Independencia del proveedor**: cambiar de agente o de modelo no cambia el proceso ni los artefactos.
- **Una sola herramienta** para discovery, specs, brownfield, migraciones, gobierno, estado, auditoría y estimación.

## 4. Qué tomó de cada toolkit, en qué lo convirtió y cómo lo integró

| Origen | Qué tomó | En qué lo convirtió en SteelFoundry | Cómo lo integró (y qué cambió respecto del original) |
|---|---|---|---|
| **GitHub Spec Kit** | Constitución del proyecto; fases specify → plan → tasks; clarify, analyze, checklist | Constitución con **evidencia por principio** y **ratificación** por persona con nombre; plantillas de comando `specify`, `plan`, `tasks`, `clarify`, `analyze`, `checklist`; regla `REQUIREMENT_NOT_IN_PLAN`; `import spec-kit` | En Spec Kit la constitución se escribe y rige; aquí se **deriva del código** (descriptiva) o de una **entrevista guiada** (normativa) y no rige hasta teclear `RATIFICAR`. La importación copia la constitución tal cual y marca `spec.md` como no validado: es un mapeo, no una promesa. |
| **BMAD Method** | Discovery por roles (analista, PM, arquitecto, UX, QA) antes de especificar | `assist discover` + `assist brief` + `discovery lint/log` | Los roles **no son agentes con criterio propio**: el motor elige qué roles preguntan según nivel, variante y riesgo (seguridad solo si hay datos sensibles). Un agente solo puede responder `ASSUMPTION:`, que bloquea el brief hasta que una persona lo confirme. |
| **Kiro** (práctica popularizada) | Requisitos **EARS**; steering (`product`, `tech`, `structure`); fases requisitos → diseño → tareas con aprobación; hooks de agente | `assist ears` (5 patrones, estados converted / needs-confirmation / question), `steering draft/check`, tríada documental, Stop hook que corre la cadena de gates | EARS se **valida** (C1) además de redactarse; el steering marca lo supuesto como `(inferred)` y no está «listo» mientras quede algo sin confirmar; el hook no confía en el agente: ejecuta los gates. |
| **OpenSpec** | Specs **delta** (ADDED / MODIFIED / REMOVED / RENAMED); archivo de specs cerradas; ids de tarea únicos y verificables | `delta init/validate/merge`, `archive`, reglas `TASK_DUPLICATE_ID` y `TASK_WITHOUT_VERIFICATION` | La delta se cruza con el **oráculo de regresión** (`brownfield contracts`: qué tests protegen cada archivo cambiado) y con el análisis de impacto; un REMOVED exige motivo y contratos. |
| **AWS AI-DLC** | Etapas inception / construction y sensores en el ciclo de vida | Tipos de paso `aidlc:stage/*` y plantilla de plugin AI-DLC con sensores `opensdd-ears`, `opensdd-gates`, `opensdd-steering` | Los sensores son deterministas y **fallan cerrados** si no encuentran el CLI. La plantilla no se ha pasado por el validador oficial de AI-DLC (declarado). |
| **AWS Prescriptive Guidance (7 Rs)** | Estrategias de migración retire / retain / rehost / relocate / repurchase / replatform / refactor | `migrate assess`: tabla de reglas ordenada con id y motivo por componente; olas; ciclo strangler; `migrate estimate` | La guía se convirtió en **reglas ejecutables** (la primera que encaja gana) con override nominal registrado; se añadió `D-RETAIN-TARGET` (lo que ya está en cloud/SaaS no se mueve). |
| **SteelForge IDE** (herramienta propia del autor) | Niveles y modos que la gente elige primero; tinyspec; EARS → Gherkin; matriz de módulos por nivel | `modes`, `/sdd-tiny`, `/sdd-promote`, `gherkin`, comprobaciones de estructura de tareas | Reimplementado en TypeScript sobre los analizadores propios (`parseTasksMarkdown`, EARS); los escenarios Gherkin quedan trazados a cada REQ. |
| **INCOSE, ISO/IEC/IEEE 29148, NASA ARM** | Reglas de calidad de requisitos (lenguaje subjetivo, adjetivos de rendimiento sin cota, cláusulas de escape) | Coach de requisitos (`requirements review/fix`, AMB-001/002/003…) y una sola lista de términos vagos para C1, EARS y clarify | Cada hallazgo trae un remedio o una pregunta; nada se reescribe por heurística en bloque. |
| **Pautas Karpathy** | Pensar antes de implementar, simplicidad, cambios quirúrgicos, ejecución guiada por objetivos | Skill `karpathy-guidelines` en cada proyecto; gate C7 | C7 se declara **vacío** (activación sin medición) y así se informa. |
| **in-toto / SLSA, OpenTelemetry, OWASP LLM01, MCP** | Atestación de cadena de suministro; telemetría abierta; inyección indirecta de prompts; protocolo de herramientas | `attest` (Statement v1 + `--verify`), `audit trail --otlp`, C2 sobre `specs/` y `steering/`, servidor MCP con `open_sdd_*` | Mismas funciones para CLI y MCP; la atestación no se firma sola (se indica cómo con Sigstore). |

## 5. Por qué los flujos son así

| Decisión de diseño | Por qué |
|---|---|
| **El motor decide; el agente propone; la persona aprueba** | Un modelo es probabilístico: lo que debe ser repetible (nivel, siguiente paso, veredicto de un gate, exigencia de pruebas) lo decide código determinista; lo que es juicio humano (aprobar, ratificar, «no afectado») no puede delegarse en quien produce el trabajo. |
| **El nivel lo fija la intención y el riesgo solo lo sube** | La ceremonia debe ser proporcional: una errata no merece el proceso de una migración, pero una «errata» en autenticación no es una errata. Que una palabra de riesgo nunca baje el nivel se prueba como invariante. |
| **Constitución antes que specs, ratificada por una persona** | Un veredicto que bloquea necesita una autoridad citable; si la escribe el agente o rige sin ratificar, el agente se gobierna a sí mismo. |
| **Requisitos EARS y clarify antes del diseño** | Un requisito ambiguo llega al agente como licencia para inventar; se pregunta antes de que el error se multiplique en diseño, tareas y código. |
| **En brownfield se especifica el cambio (delta), no el sistema** | Especificar un sistema heredado entero es inabarcable; la delta mantiene la obligación finita y el oráculo de regresión protege lo que no se toca. |
| **Tareas con `(P)`, `_Boundary:_` y `_Depends:_`** | Paralelizar solo es seguro con límites de archivos disjuntos; las olas convierten las dependencias en un orden ejecutable y el árbitro rechaza un merge parcial. |
| **«Hecho» exige evidencia, y las reglas suben la exigencia** | Las pruebas se ponen donde el riesgo lo pide (dinero, datos personales, acceso…), no en todas partes por igual ni donde el agente prefiera. |
| **Escalar a una persona al 1.er fallo crítico, al 2.º idéntico o tras 3** | Evita bucles infinitos de un agente que «casi» lo logra y fija un punto de decisión humano reproducible. |
| **Todo queda en archivos del repositorio y en un registro encadenado** | Lo versionado en Git sobrevive a cualquier herramienta; la cadena de hashes hace detectable una edición posterior. |

## 6. Ventajas: lo que considera y otros no

- **Un solo toolkit de L0 a L6** con la ceremonia elegida por el motor, no por el usuario.
- **Brownfield de primera clase**: constitución descriptiva desde el código, delta, oráculo de regresión, impacto y reutilización; ingeniería inversa por etapas.
- **Migraciones de cartera** con 7 Rs ejecutables, olas, canary, cut-over aprobado y eventos imprevistos (CVE, incidentes) resueltos por reglas sin modelo.
- **Exigencia de pruebas por reglas de negocio**, auditables y ajustables por el proyecto.
- **Personas reales en el bucle**: aprobadores con email git, confirmación en terminal, intentos rechazados registrados.
- **Auditoría y atestación** que responden quién, por qué y sobre qué requisito y principio.
- **Estado claro** para personas, tableros (JSON estable), PR (Markdown) y agentes (MCP).
- **Seguridad agéntica**: el gate de seguridad busca instrucciones dirigidas al agente en lo que el agente lee.
- **Honestidad declarada**: lo no medido se dice (C5 degradado, C7 vacío, estimaciones no calibradas, límites del manual §21).

## 7. Alcance preciso

**Qué es**
- Un CLI en Node.js (sin dependencias de ejecución), un conjunto de skills y plantillas de comando para 25+ hosts de agentes, y un servidor MCP.
- Trabaja sobre archivos del repositorio (`.sdd/`) y Git; funciona sin red y sin claves.
- Requiere Node ≥ 20 (los sensores AI-DLC en TypeScript, Node ≥ 22.6).

**Qué hace**
- Clasifica el trabajo, elige el playbook y dicta el paso siguiente.
- Asiste en discovery, requisitos EARS, steering y constitución, y valida specs, tareas y evidencia.
- Gobierna brownfield (delta, contratos, impacto) y migraciones (7 Rs, olas, ciclo de vida).
- Bloquea con gates en commit y PR, registra y audita decisiones, atesta entregas y estima.

**Qué no es ni hace**
- **No es un agente ni incluye un modelo**: el trabajo lo hace el agente de tu host; SteelFoundry lo dirige y lo verifica.
- **No prueba la identidad**: usa el email git, la lista de aprobadores y la terminal; para garantía criptográfica, firma commits y atestaciones.
- **No sustituye el juicio**: las reglas de validación encajan por texto y rutas; las 7 Rs no reemplazan un assessment con los dueños; EARS no garantiza que un requisito sea correcto.
- **No está calibrado**: estimaciones, coste y tiempos restantes usan factores declarados y lo dicen.
- **No es un servicio**: no aloja tableros ni CI; produce JSON, Markdown, SARIF y OTLP para los tuyos.
