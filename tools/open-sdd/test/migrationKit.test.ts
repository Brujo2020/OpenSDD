/**
 * feat/migrate: «migrate» es el verbo (alias «modernize»), L6 se llama migration, ejemplos enterprise
 * y la regla D-RETAIN-TARGET (lo que ya está en cloud/SaaS no se mueve).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { classifyLevel, LEVEL_LABEL } from '../src/core/levels.js';
import { dispositions } from '../src/core/modernize/disposition.js';
import { validatePortfolio } from '../src/core/modernize/portfolio.js';
import { MIGRATION_EXAMPLES } from '../src/cli/commands/modernize.js';

const TEMPLATES = path.join(__dirname, '..', 'templates', 'modernize');
const run = async (cwd: string, ...argv: string[]) => {
  const out: string[] = [];
  const io = { log: (m: string) => out.push(m), error: (m: string) => out.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer', '--color', 'never'], { platform: process.platform, env: process.env }, io as never, {}, { cwd });
  return { code, out: out.join('\n') };
};

describe('migrate', () => {
  it('L6 se llama migration', () => {
    expect(LEVEL_LABEL.L6).toBe('migration');
  });

  it.each([
    'migración de la cartera de aplicaciones a la nube',
    'salida del datacenter antes de 2027',
    'migrar el mainframe de pólizas',
    'de Oracle a PostgreSQL en facturación',
    'cloud migration of the retail estate',
  ])('«%s» es L6', (intent) => {
    expect(classifyLevel(intent).level).toBe('L6');
  });

  it('una migración de datos de una feature no es L6', () => {
    expect(classifyLevel('add a data migration for the orders table').level).not.toBe('L6');
  });

  it.each(MIGRATION_EXAMPLES)('el ejemplo %s es un portafolio válido', (id) => {
    const r = validatePortfolio(JSON.parse(readFileSync(path.join(TEMPLATES, `portfolio.${id}.json`), 'utf8')));
    expect(r.errors).toEqual([]);
  });

  it('lo que ya está en cloud o SaaS se retiene, no se rehospeda', () => {
    const p = validatePortfolio(JSON.parse(readFileSync(path.join(TEMPLATES, 'portfolio.monolith.json'), 'utf8'))).portfolio!;
    const gw = dispositions(p).find((d) => d.id === 'payments-gw')!;
    expect(gw.r).toBe('retain');
    expect(gw.rule).toBe('D-RETAIN-TARGET');
  });

  it('migrate y modernize hacen lo mismo', async () => {
    const a = mkdtempSync(path.join(tmpdir(), 'sdd-mig-'));
    const b = mkdtempSync(path.join(tmpdir(), 'sdd-mod-'));
    expect((await run(a, 'migrate', 'init', '--example', 'database')).code).toBe(0);
    expect((await run(b, 'modernize', 'init', '--example', 'database')).code).toBe(0);
    const ra = await run(a, 'migrate', 'assess');
    const rb = await run(b, 'modernize', 'assess');
    expect(ra.code).toBe(0);
    expect(ra.out).toBe(rb.out);
    expect(ra.out).toContain('steelfoundry migrate waves');
  });

  it('rechaza un ejemplo desconocido nombrando los válidos', async () => {
    const r = await run(mkdtempSync(path.join(tmpdir(), 'sdd-mig-')), 'migrate', 'init', '--example', 'nope');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('insurance-mainframe');
  });
});
