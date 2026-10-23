---
name: opensdd-boundary
plugin: opensdd
fires: gate
---

# opensdd-boundary

Changed files stay inside the task boundaries.

Runs `open-sdd govern discipline` through `bin/opensdd-sensor boundary`. Exit 0 → pass; anything else → fail. If the open-sdd CLI is not installed the sensor FAILS: an absent instrument is never read as a passed check.
