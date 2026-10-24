/**
 * `steelforge import` — absorbing spec-kit.
 *
 * Fixtures live in `mkdtemp` and are removed in `afterEach`: the suite NEVER writes inside the
 * repository. The contract under test is deliberately pessimistic, because the importer is:
 * a conversion is a MAPPING, every artifact we cannot map is a named `skip`, the plan says in
 * `detail` what it did not convert, an invalid constitution is reported instead of silently copied,
 * and `applyImport` never overwrites an existing file.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyImport, planImport } from '../src/core/importers.js';
import { handleImportCommand } from '../src/cli/commands/init.js';

const tempDirs: string[] = [];

const makeRoot = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sdd-import-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

const makeIO = () => {
  const logs: string[] = [];
  const errs: string[] = [];
  return {
    io: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errs.push(message),
      exit: () => undefined,
    },
    get logs() {
      return logs;
    },
    get errs() {
      return errs;
    },
    text: () => logs.join('\n'),
  };
};

const write = async (dir: string, rel: string, content: string): Promise<void> => {
  const full = path.join(dir, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
};

const exists = async (p: string): Promise<boolean> => (await stat(p).catch(() => null)) !== null;

const readText = (p: string): Promise<string> => readFile(p, 'utf8');

describe('importers — spec-kit', () => {
  const specKitFixture = async (dir: string): Promise<void> => {
    await write(
      dir,
      '.specify/memory/constitution.md',
      ['# Acme Constitution', '', '## Principles', '', '### P-01 — Library first', '', '- Level: MUST', '- Restriction: Every feature starts as a library.', ''].join('\n'),
    );
    await write(dir, '.specify/specs/001-auth/spec.md', '# Auth spec\n\n## User Scenarios\n\nA user signs in.\n');
    await write(dir, '.specify/specs/001-auth/plan.md', '# Plan\n');
    await write(dir, '.specify/specs/001-auth/tasks.md', '# Tasks\n');
    await write(dir, '.specify/specs/001-auth/research.md', '# Research\n');
    await write(dir, '.specify/specs/001-auth/notes.md', 'unmapped document\n');
    await write(dir, '.specify/templates/spec-template.md', 'template\n');
  };

  it('reports the validation issues of an invalid constitution instead of copying it silently', async () => {
    const dir = await makeRoot();
    await specKitFixture(dir);

    const [plan] = await planImport(dir, 'spec-kit');
    expect(plan.source).toBe('spec-kit');
    expect(plan.warnings.some((warning) => warning.includes('validateConstitution') && warning.includes('ID-POSITIONAL'))).toBe(
      true,
    );
    expect(plan.complete).toBe(false);

    const constitution = plan.conversions.find((conversion) => conversion.from.endsWith('constitution.md'));
    expect(constitution?.action).toBe('convert');
    expect(constitution?.reason).toContain('VERBATIM');

    const outcome = await applyImport(dir, plan, { write: true });
    expect(outcome.written).toContain('.sdd/steering/constitution.md');
    // Verbatim: the validator's findings never become silent edits.
    expect(await readText(path.join(dir, '.sdd/steering/constitution.md'))).toBe(
      await readText(path.join(dir, '.specify/memory/constitution.md')),
    );
  });

  it('maps spec.md to requirements.md behind a provenance banner and skips templates by design', async () => {
    const dir = await makeRoot();
    await specKitFixture(dir);

    const [plan] = await planImport(dir, 'spec-kit');
    const spec = plan.conversions.find((conversion) => conversion.from.endsWith('spec.md'));
    expect(spec?.to).toBe('.sdd/specs/001-auth/requirements.md');
    expect(spec?.action).toBe('convert');
    expect(spec?.reason).toContain('NO es EARS');

    const templates = plan.conversions.find((conversion) => conversion.from === '.specify/templates');
    expect(templates?.action).toBe('skip');
    expect(templates?.reason).toContain('distintas por diseño');

    const notes = plan.conversions.find((conversion) => conversion.from.endsWith('notes.md'));
    expect(notes?.action).toBe('skip');

    await applyImport(dir, plan, { write: true });
    const requirements = await readText(path.join(dir, '.sdd/specs/001-auth/requirements.md'));
    expect(requirements.startsWith('<!-- Importado por steelforge')).toBe(true);
    expect(requirements).toContain('A user signs in.');
    expect(plan.detail).toContain('MAPEO');
  });

  it('with an explicit source, an empty repository still yields one honest plan', async () => {
    const dir = await makeRoot();
    const [plan] = await planImport(dir, 'spec-kit');
    expect(plan.found).toEqual([]);
    expect(plan.complete).toBe(false);
    expect(plan.detail).toContain('No se observó');
  });
});

describe('importers — no incumbent observed', () => {
  it('planImport without a source returns nothing when no incumbent is present', async () => {
    const dir = await makeRoot();
    expect(await planImport(dir)).toEqual([]);
  });

  it('the CLI reports the absence and validates the source', async () => {
    const dir = await makeRoot();
    const empty = makeIO();
    expect(await handleImportCommand([], empty.io, dir)).toBe(0);
    expect(empty.text()).toContain('No se observó ningún incumbente');

    const bad = makeIO();
    expect(await handleImportCommand(['svn'], bad.io, dir)).toBe(1);
    expect(bad.errs.join('\n')).toContain('spec-kit');
  });

});
