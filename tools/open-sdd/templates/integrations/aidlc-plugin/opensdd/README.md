# opensdd — AI-DLC plugin

Deterministic open-sdd sensors on AI-DLC stages (advisory): `opensdd-ears` on requirements-analysis,
`opensdd-gates` and `opensdd-steering` on code-generation. Each runs the open-sdd CLI and fails closed
when it is missing. Layout follows the AI-DLC plugin mechanism (`.aidlc-plugin/plugin.json`, `sensors/`,
`tools/`, `contributions/`).

```bash
bun <aidlc-tools>/aidlc-plugin-validate.ts .
bun <aidlc-tools>/aidlc-plugin-build.ts . claude
```
