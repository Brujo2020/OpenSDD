---
id: opensdd-steering
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-opensdd-steering.ts
default_severity: advisory
description: Reports steelforge steering files that are missing or still carry inferred markers (opensdd plugin, advisory)
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

# opensdd-steering sensor (opensdd)

ADVISORY. Reports steelforge steering files that are missing or still carry inferred markers. Runs the steelforge CLI (`OPEN_SDD_CLI` = path to `cli.js`, else `open-sdd` on PATH).
If the CLI cannot be found the sensor fails with one finding: an absent instrument is never read as a pass.
