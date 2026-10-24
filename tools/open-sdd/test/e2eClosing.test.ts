/**
 * E2E de cierre (dominio ficticio «Acme Reservas»): las 5 mejoras finales sobre un repositorio real.
 *   1. FinOps: tokens, modelos y coste por feature en el estado, con aviso si supera el presupuesto.
 *   2. OpenTelemetry: el registro de decisiones exportado como OTLP/JSON.
 *   3. MCP: estado, validación y auditoría consultables por cualquier agente o tablero.
 *   4. Atestación in-toto v1 de lo entregado, y su verificación ante cambios posteriores.
 *   5. Estado en Markdown para el resumen de un PR o de un job de CI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { callTool } from '../src/mcp/tools.js';

let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer', '--color', 'never', '--no-input'], { platform: 'linux', env: {} }, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const write = (rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), content);
};
const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const SPEC = '.sdd/specs/checkin';

beforeAll(async () => {
  cwd = mkdtempSync(path.join(tmpdir(), 'acme-cierre-'));
  git('init', '-q');
  git('config', 'user.name', 'Ana Arquitecta');
  git('config', 'user.email', 'ana.arquitecta@acme.example');
  write('package.json', '{"name":"reservas"}');
  write(SPEC + '/requirements.md', '# R\n\n## Requirements\n\n### REQ-CHK-001 — Check-in\n\n#### Acceptance Criteria\n\n- When a guest checks in online, the [checkin service] shall issue a boarding pass within 2 seconds.\n');
  write(SPEC + '/plan.md', '# Plan\nREQ-CHK-001 checkin service\n');
  write(SPEC + '/tasks.md', '- [x] 1. Emitir la tarjeta de embarque — _Requirements: REQ-CHK-001_ — _Boundary:_ `src/checkin/pass.ts`_\n  - _Evidence:_ [unit] [performance] npm test → 18 passed\n');
  git('add', '.');
  git('commit', '-qm', 'spec', '--no-verify');
  expect((await run('engine', 'start', 'checkin', '--playbook', 'greenfield')).code).toBe(0);
});

afterAll(() => rmSync(cwd, { recursive: true, force: true }));

describe('cierre — 5 mejoras finales (E2E)', () => {
  it('1. FinOps: el consumo declarado por cada paso suma por feature, con coste y aviso de presupuesto', async () => {
    const steps = (JSON.parse((await run('flow', 'checkin', '--json')).out) as { run: { steps: { id: string }[] } }).run.steps;
    expect((await run('report', 'checkin', '--step', steps[0].id, '--result', 'started', '--tokens', '900000', '--model', 'claude-opus-5-5')).code).toBe(0);
    expect((await run('report', 'checkin', '--step', steps[1].id, '--result', 'started', '--tokens', '300000', '--model', 'claude-haiku-5-5')).code).toBe(0);
    write('.sdd/settings/finops.json', JSON.stringify({ budgetTokens: 1_000_000, usdPerMillionTokens: { 'claude-opus-5-5': 20, default: 2 } }));
    const f = JSON.parse((await run('flow', 'checkin', '--json')).out) as { metrics: { usage: { tokens: number; models: string[]; costUsd: number; overBudget: boolean } }; status: { warnings: string[] } };
    expect(f.metrics.usage.tokens).toBe(1_200_000);
    expect(f.metrics.usage.models).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
    expect(f.metrics.usage.costUsd).toBe(18.6);
    expect(f.metrics.usage.overBudget).toBe(true);
    expect(f.status.warnings).toEqual(['consumo 1200000 tokens > presupuesto 1000000']);
    expect((await run('flow', 'checkin')).out).toContain('≈ USD 18.6');
  });

  it('2. OpenTelemetry: el registro sale como OTLP/JSON con convenciones de OTel', async () => {
    expect((await run('audit', 'trail', 'checkin', '--otlp', 'out/otlp.json')).code).toBe(0);
    const otlp = JSON.parse(readFileSync(path.join(cwd, 'out/otlp.json'), 'utf8'));
    const records = otlp.resourceLogs[0].scopeLogs[0].logRecords as { attributes: { key: string; value: Record<string, unknown> }[]; timeUnixNano: string }[];
    expect(otlp.resourceLogs[0].resource.attributes[0]).toEqual({ key: 'service.name', value: { stringValue: 'open-sdd' } });
    const keys = (r: (typeof records)[number]) => Object.fromEntries(r.attributes.map((a) => [a.key, a.value]));
    const metered = records.map(keys).filter((a) => a['gen_ai.request.model']);
    expect(metered.map((a) => (a['gen_ai.request.model'] as { stringValue: string }).stringValue).sort()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
    expect(records.every((r) => /^\d+$/.test(r.timeUnixNano))).toBe(true);
    expect(records.map(keys).every((a) => a['event.name'] && a['sdd.audit.chain_intact'])).toBe(true);
  });

  it('3. MCP: estado, validación y auditoría por las mismas funciones que la CLI', async () => {
    const ctx = { cwd, sddDir: '.sdd' };
    const flow = await callTool('open_sdd_flow', { feature: 'checkin' }, ctx);
    expect((flow.data as { schema: string }).schema).toBe('open-sdd.flow/1');
    expect(flow.detail).toMatch(/etapa \d\/9/);
    const validation = await callTool('open_sdd_validation', { feature: 'checkin' }, ctx);
    expect(validation.isError).toBe(false);
    expect((validation.data as { plan: { required: string[] }[] }).plan[0].required).toEqual(['unit', 'performance']);
    const trail = await callTool('open_sdd_audit_trail', { feature: 'checkin', actor: 'system' }, ctx);
    expect(trail.isError).toBe(false);
    expect((trail.data as { records: { actor: { kind: string } }[] }).records.every((r) => r.actor.kind === 'system')).toBe(true);
    await expect(callTool('open_sdd_flow', { feature: 'checkin', extra: 1 }, ctx)).resolves.toBeDefined();
  });

  it('4. atestación in-toto v1: lo entregado, y cualquier cambio posterior detectado', async () => {
    expect((await run('attest', 'checkin', '--write')).code).toBe(0);
    const file = path.join(cwd, '.sdd/attestations/checkin.intoto.json');
    const statement = JSON.parse(readFileSync(file, 'utf8'));
    expect(statement._type).toBe('https://in-toto.io/Statement/v1');
    expect(statement.subject.map((s: { name: string }) => s.name)).toEqual(['.sdd/specs/checkin/requirements.md', '.sdd/specs/checkin/plan.md', '.sdd/specs/checkin/tasks.md']);
    expect(statement.predicate.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(statement.predicate.audit[0].intact).toBe(true);
    expect((await run('attest', '--verify', '.sdd/attestations/checkin.intoto.json')).code).toBe(0);

    write(SPEC + '/requirements.md', readFileSync(path.join(cwd, SPEC, 'requirements.md'), 'utf8').replace('2 seconds', '5 seconds'));
    const changed = await run('attest', '--verify', '.sdd/attestations/checkin.intoto.json');
    expect(changed.code).toBe(1);
    expect(changed.out).toContain('.sdd/specs/checkin/requirements.md: cambió después de la atestación');

    // Borrar la última línea del registro deja la cadena «válida»; la atestación lo detecta igual.
    const log = path.join(cwd, '.sdd/engine/checkin.audit.jsonl');
    const lines = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    writeFileSync(log, `${lines.slice(0, -1).join('\n')}\n`);
    expect((await run('attest', '--verify', '.sdd/attestations/checkin.intoto.json')).out).toMatch(/tiene menos líneas que al atestar/);
  });

  it('5. el estado en Markdown para el resumen de un PR o de un job de CI', async () => {
    const md = (await run('flow', '--markdown')).out;
    expect(md).toContain('## Estado de las specs');
    expect(md).toContain('| Feature | Estado | Etapa | Tareas | Bloqueado por | Siguiente |');
    expect(md).toMatch(/\| \S+ `checkin` \| \S+ \| \d\/9 /);
  });
});
