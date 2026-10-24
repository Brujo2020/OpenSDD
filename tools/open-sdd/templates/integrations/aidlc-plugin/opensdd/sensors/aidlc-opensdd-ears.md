---
id: opensdd-ears
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-opensdd-ears.ts
default_severity: advisory
description: Converts every statement of a requirements artifact with steelforge assist ears and reports those that are not EARS or need an answer (opensdd plugin, advisory)
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

# opensdd-ears sensor (opensdd)

ADVISORY. Converts every statement of a requirements artifact with steelforge assist ears and reports those that are not EARS or need an answer. Runs the steelforge CLI (`OPEN_SDD_CLI` = path to `cli.js`, else `open-sdd` on PATH).
If the CLI cannot be found the sensor fails with one finding: an absent instrument is never read as a pass.
