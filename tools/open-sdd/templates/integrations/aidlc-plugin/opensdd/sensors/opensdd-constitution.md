---
name: opensdd-constitution
plugin: opensdd
fires: gate
---

# opensdd-constitution

The spec obeys the project constitution.

Runs `open-sdd status <feature> --check` through `bin/opensdd-sensor constitution`. Exit 0 → pass; anything else → fail. If the open-sdd CLI is not installed the sensor FAILS: an absent instrument is never read as a passed check.
