---
name: opensdd-gates
plugin: opensdd
fires: gate
---

# opensdd-gates

C1 triad, C2 security and C3 evidence on the staged index.

Runs `open-sdd gates run C1 C2 C3 --staged --strict` through `bin/opensdd-sensor gates`. Exit 0 → pass; anything else → fail. If the open-sdd CLI is not installed the sensor FAILS: an absent instrument is never read as a passed check.
