# Upgrade

How to move an installed `open-sdd` to a newer release, and how to refresh the artifacts it put on
disk. This page is about **upgrading between our versions**. For moving a project that currently uses
spec-kit, see [Migrating from spec-kit](migrate-from.md).

The order that matters: update the CLI first, then re-run the installers inside each repository.
Nothing here deletes or rewrites your specs.

## 1. Know what you have

```bash
steelforge --version
steelforge doctor
```

`doctor` reports the CLI version, the commit-hook state and the declared rigor level. Run it again
after the upgrade to confirm the hook was refreshed.

## 2. Get the new CLI

**`npx` — no install, always the newest published version.** This is the frictionless path once
v3.0.2 is published. Today, the registry's `latest` is the older **v2.0.0**:

```bash
npx @brujo2020/steelforge@latest --version
```

The unscoped `npx steelforge@latest` is **not** this project (the name does not exist). Pin an exact
version when you need reproducibility: `npx @brujo2020/steelforge@3.0.2 …`.

**Global install.**

```bash
npm install -g @brujo2020/steelforge      # from the registry
npm run install:global                  # from a checkout: builds, then installs this version
steelforge --version
```

**From a clone.**

```bash
git pull
npm --prefix tools/open-sdd ci
npm --prefix tools/open-sdd run build
node tools/open-sdd/dist/cli.js --version
```

Full details and the pre-publication caveats are in [Install](../INSTALL.md).

## 3. Refresh what is on disk (idempotent)

From inside the target repository, re-run the two installers:

```bash
cd /path/to/your/repo
steelforge --claude-skills -y                             # skills + .sdd/settings templates
steelforge init . --agent claude-code-skills --write      # rigor + commit gate
```

Both are safe to re-run. The project initizer is **idempotent by construction**: it reports
`create` / `keep` / `update` for every artifact, and a second run is all `keep`. Real second-run
output:

```text
  Artefactos
    keep               .sdd/settings/rigor.json
    keep               .git/hooks/pre-commit
        el hook instalado ya es nuestra versión vigente: se conserva (instalador: steelforge floor install)
  Plan de init en /path/to/repo: … 0 artefacto(s) por crear, 0 por actualizar, 2 conservado(s).
```

### What is never overwritten

- **`init` never overwrites an edited file.** Existing artifacts are reported `keep`:
  `.sdd/settings/rigor.json` and the constitution are left exactly as they are. The one exception is
  the commit hook, which is refreshed when it is an older version of *our* template; a hook that is
  not ours (`foreign`) is preserved, never replaced.
- **The skills install** defaults to `--overwrite=prompt` (ask per file). In a non-TTY environment
  `prompt` falls back to `skip`, so an unattended run creates what is missing and **keeps what
  exists**. `-y` maps `prompt` to `force`, which *does* overwrite — drop `-y` (or pass
  `--overwrite=prompt`) if you have hand-edited generated files, and use `--backup[=<dir>]` to keep a
  copy.

There is no separate `integrate` subcommand. The integration step **is** the installer + `init` pair
above; the non-destructive behavior described here is what "integrate" would mean.

Your specs are yours: `.sdd/specs/` is populated by the workflow commands, not by the installers, and
an upgrade does not touch it.

## 4. The commit hook: refresh, and what `doctor` means

The commit gate is a file installed from `tools/open-sdd/templates/hooks/pre-commit.mjs` into
`.git/hooks/pre-commit`. A new release can change that template. `steelforge doctor` classifies the
installed copy:

| `doctor` state | Meaning | Fix |
|---|---|---|
| `current` | Identical to the shipped template. | Nothing to do. |
| `stale` | Ours, but an older version — this is the "gate is outdated" case. | `steelforge init . --write` or `steelforge floor install .` |
| `missing` | No hook installed. | `steelforge floor install .` |
| `not-executable` | Present but git silently ignores it. | Reinstall restores the executable bit. |
| `foreign` | Someone else's hook. Never overwritten. | `steelforge floor install . --force` backs it up first. |
| `unverifiable` | Present but not comparable to ours. | Left untouched. |

## 5. When `doctor` reports the gate as outdated

This is the `stale` row above. Refresh it without touching anything else:

```bash
steelforge init . --agent claude-code-skills --write
steelforge doctor
```

Expected confirmation line:

```text
✓ [ok] Hook de commit: Hook instalado en .git/hooks/pre-commit (.git/hooks), ejecutable e idéntico a la plantilla vigente pre-commit.mjs.
```

If the hook is `foreign`, the installer reports a backup and does **not** install ours; that is the
designed behavior, not a failure. Re-read the message and decide, or use
`steelforge floor install . --force` which makes the backup explicit.

## 6. What changed

- **[CHANGELOG.md](../../CHANGELOG.md)** — the `[Unreleased]` section and the section for each
  released version, with the date.
- **[Paper alignment](../PAPER-ALIGNMENT.md)** — every declared gap (G-01 …) with its code location,
  so you can tell what a release added from what it still does not do.

## 7. If you need to go back

There is no automated rollback. npm cannot re-publish a version, so a bad release is deprecated and
followed by a new patch rather than overwritten ([Publishing](publish.md)):

```bash
npx @brujo2020/steelforge@2.0.0 --version    # pin the previous published version
```

To revert the on-disk artifacts, restore `.sdd/` and the agent's skill directory from version
control. `git diff` before you upgrade shows exactly what the installers changed.

## FAQ

**Does upgrading touch my specs or steering?** No. `.sdd/specs/` and `.sdd/steering/` are yours; the
installers do not write them.

**Do I have to upgrade every repository at once?** No. The installed artifacts are ordinary files.
Each repository upgrades when you re-run the installer inside it.

**Does `-y` overwrite my edits?** Yes — `-y` is `--overwrite=force`. Without it (or with
`--overwrite=prompt`), existing files are kept.

**Can I mix versions across repositories?** Yes. Version compatibility is per repository; the specs
in `.sdd/` are version-agnostic Markdown.

## Coming from the unscoped `open-sdd` package

Before this project was scoped, `npm install -g open-sdd` shipped the same three command names the
current package declares (`open-sdd`, `sdd-open`, `sdd`). Two residues of that install break the
upgrade, and both are silent about their cause:

**1. `npm error code EEXIST … /bin/sdd`.** Uninstalling the old package removes its directory but
**leaves its symlinks** in the npm prefix's `bin`. `npm install -g @brujo2020/steelforge@latest` then
refuses to overwrite a file it does not recognise as its own. The links point into a directory that no
longer exists, so check before removing:

```bash
ls -l "$(npm prefix -g)/bin/sdd" "$(npm prefix -g)/bin/sdd-open"   # dangling -> no such file
rm -f "$(npm prefix -g)/bin/sdd" "$(npm prefix -g)/bin/sdd-open"
npm install -g @brujo2020/steelforge@latest
```

**2. The shell still runs the old binary.** `steelforge --version` keeps printing the previous 2.x
banner after a successful upgrade, because the shell hashes the resolved command path. Nothing is
wrong with the install: clear the cache and it reports the new version.

```bash
hash -r          # bash   (zsh: rehash, or simply open a new terminal)
steelforge --version && sdd --version && sdd-open --version   # all three must print v3.4.0
```

**Why this matters more than a cosmetic version string.** The installed commit hook resolves its CLI
in this order: `$OPEN_SDD_CLI`, then project-relative candidates, then the first `open-sdd` on `PATH`.
A project installed with `npx` has no `node_modules` of its own, so a stale global is what the hook
runs — and a version that does not enforce turns the commit gate into decoration while the
configuration still reads "blocking". That is gap **G-36** in
[`docs/PAPER-ALIGNMENT.md`](../PAPER-ALIGNMENT.md): `gates run C1 C2 C3 --staged --strict` exits 1 with
an AWS-shaped key staged, while the installed hook exits 0 over the same index. The check that settles
it is not `doctor` (run through `npx` it reports the cached CLI) but the version of the binary the hook
actually resolves.
