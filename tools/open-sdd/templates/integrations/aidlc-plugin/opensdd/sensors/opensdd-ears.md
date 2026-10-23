---
name: opensdd-ears
plugin: opensdd
fires: gate
---

# opensdd-ears

Requirements are in checkable EARS form.

Runs `open-sdd requirements review <feature>` through `bin/opensdd-sensor ears`. Exit 0 → pass; anything else → fail. If the open-sdd CLI is not installed the sensor FAILS: an absent instrument is never read as a passed check.
