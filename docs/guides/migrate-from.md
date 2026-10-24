# Migrating from spec-kit

SteelForge can read what spec-kit already wrote. This guide is honest about what that means:
**a conversion is a mapping, never a promise of equivalence.** We move documents to the place our
engine reads, we rename what has a declared alias, and we say out loud what we did not convert and
why. Nothing is ever overwritten, and nothing is silently "fixed".

```bash
steelforge import                          # detect spec-kit and print the plan
steelforge import spec-kit --write         # apply the plan
steelforge import spec-kit --json          # machine-readable plan
steelforge import spec-kit --write --dry-run   # show what would change, write nothing
```

In this repository, replace `steelforge` with `node tools/open-sdd/dist/cli.js`. The importer never
writes without `--write`, and it never overwrites a file that already exists — it reports the path it
refused to touch.

## What a mapping is, and what it is not

- It **is** a relocation: the document lands where `steelforge status`, the gate chain and the MCP
  server look for it.
- It **is** a rename where a canonical name exists: `design.md` is a declared alias of `plan.md` in
  `tools/open-sdd/src/core/triad.ts`, so it is normalized to `plan.md` with the content copied
  verbatim.
- It is **not** a semantic conversion. spec-kit's `spec.md` is not an
  EARS-checked requirements document; no validator has approved it, and no gate has run on it.
- It is **not** a merge. If the target exists, the import stops at that path.

What every user must do by hand after an import:

1. Read `steelforge import <source>` (no `--write`) and read the `skip` list. Those are the losses.
2. Rewrite requirements into checkable EARS form and run the requirements validation.
3. Write or review `.sdd/steering/constitution.md`: an imported constitution is not automatically
   the authority a blocking verdict can cite.
4. Recreate each spec's metadata with `steelforge init <feature>` if you need the engine's `spec.json`.
5. Run `steelforge status --check` and `steelforge doctor`, then `steelforge gates run`.

## spec-kit

**What we take:** the constitution, the spec documents, and the auxiliary documents of the spec
lifecycle.

| From | To | Action | Notes |
|---|---|---|---|
| `.specify/memory/constitution.md` | `.sdd/steering/constitution.md` | convert | Copied **verbatim**. `validateConstitution` runs on it and every issue is reported; nothing is fixed. |
| `.specify/specs/**` or `specs/**` `spec.md` | `.sdd/specs/<f>/requirements.md` | convert | A provenance banner states it is a mapping and not EARS. |
| `.specify/specs/**` or `specs/**` `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md` | same name under `.sdd/specs/<f>/` | copy | Verbatim. |
| `.specify/specs/**/contracts/**` | `.sdd/specs/<f>/contracts/**` | copy | Same role: the spec's executable interface. |
| `.specify/templates/**` | — | skip | Our templates are different by design; importing them would produce documents our gates do not recognize. |
| `.specify/scripts/**` | — | skip | They run spec-kit's flow, not ours. |
| other `.specify/memory/*.md` | — | skip | No declared role in our steering set. |
| unknown documents in a spec directory | — | skip | Named with a reason. |

**Known losses:** the constitution's prose is not converted into our principle anatomy. If
`validateConstitution` reports that no principle was recognized (the usual outcome for a prose
constitution), the file is still imported so you can diff it, and the plan says it must be rewritten
by hand before it can govern anything. Templates and scripts are deliberately not migrated.

## After the import

```bash
steelforge status                       # what the engine now sees
steelforge brownfield constitution .    # if you need a descriptive constitution from the code
steelforge integrate <host> --write     # register MCP and install the skills for your host
steelforge doctor                       # verify the whole installation
```

## See also

- [Integrations](integrations.md) — the per-host matrix, MCP snippets and invocation syntax.
- [Command reference](command-reference.md) — every console command.
- [Quickstart in 60 seconds](quickstart-60s.md) — install and first spec.
