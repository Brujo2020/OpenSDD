---
id: opensdd-gates
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-opensdd-gates.ts
default_severity: advisory
description: Runs open-sdd gates C1 C2 C3 (triad, security baseline, evidence) on the repository (opensdd plugin, advisory)
category: document-shape
matches: "**/{aidlc-docs,intents}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  findings: array
timeout_seconds: 30
---

# opensdd-gates sensor (opensdd)

ADVISORY. Runs open-sdd gates C1 C2 C3 (triad, security baseline, evidence) on the repository. Runs the open-sdd CLI (`OPEN_SDD_CLI` = path to `cli.js`, else `open-sdd` on PATH).
If the CLI cannot be found the sensor fails with one finding: an absent instrument is never read as a pass.
