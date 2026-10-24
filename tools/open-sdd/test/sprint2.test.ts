/** Spec clarity (sprint 2 of docs/REVISION-EXPERTO.md): AC-01…AC-03. */
import { describe, it, expect, beforeEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { effectiveProfile } from '../src/core/trustFloor.js';
import { profileFloor } from '../src/core/levels.js';
import { renderScoreFooter, weakestLink, type SddScoreReport } from '../src/core/sddScore.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const w = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), text);
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 's2-'));
  w('package.json', '{"name":"x"}');
});

describe('sprint 2 — one knob, weakest link, only what changes', () => {
  it('AC-01 the level sets the governance floor; a declaration raises it, never lowers it', async () => {
    expect(['L0', 'L2', 'L3', 'L4', 'L5', 'L6'].map((l) => profileFloor(l as never))).toEqual(['solo', 'solo', 'team', 'team', 'enterprise', 'enterprise']);
    mkdirSync(path.join(cwd, 'a', '.git'), { recursive: true });
    mkdirSync(path.join(cwd, 'b', '.git'), { recursive: true });
    const start = await run('start', 'split billing into 3 microservices', '--feature', 'big');
    expect(start.out).toContain('profile ≥ enterprise');
    expect(await effectiveProfile(cwd)).toEqual({ profile: 'enterprise', declared: 'solo', raisedBy: expect.stringContaining('big') });
    // A declared enterprise profile is never lowered by a small run.
    const other = mkdtempSync(path.join(tmpdir(), 's2b-'));
    cwd = other;
    w('package.json', '{"name":"x"}');
    w('.sdd/settings/governance.json', JSON.stringify({ profile: 'enterprise' }));
    await run('start', 'fix typo in README', '--feature', 'tiny');
    expect((await effectiveProfile(cwd)).profile).toBe('enterprise');
  });

  it('AC-02 the headline is the weakest measured link; the average is detail', () => {
    const c = (id: string, label: string, weight: number, score: number) => ({ id, label, weight, score, evidence: '' });
    const report = {
      total: 93,
      phase: 2,
      phaseLabel: 'Fase 2 · Implementar',
      components: [c('constitution', 'constitución', 20, 1), c('evidence', 'evidencia', 15, 0.53), c('contracts', 'contratos', 10, 0)],
      nextAction: 'steelforge check',
      notMeasured: ['contratos'],
      detail: '',
    } as unknown as SddScoreReport;
    expect(weakestLink(report)?.label).toBe('evidencia');
    const footer = renderScoreFooter(report);
    expect(footer).toMatch(/^SDD 53% · Fase 2 · Implementar · eslabón débil: evidencia · compuesto 93%/);
  });

  it('AC-03 judging a change shows only its findings, at most 3', async () => {
    const git = (...a: string[]) => spawnSync('git', a, { cwd, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'a@b.c');
    git('config', 'user.name', 'A');
    const vague = (n: number) => `# Requirements\n\n${Array.from({ length: n }, (_, i) => `### REQ-X-00${i + 1} — R\n- Statement: The system should be fast and user-friendly etc.\n`).join('\n')}`;
    cpSync(path.resolve(__dirname, '..', '..', '..', '.sdd', 'settings', 'standards'), path.join(cwd, '.sdd', 'settings', 'standards'), { recursive: true });
    w('.sdd/specs/old/requirements.md', vague(5));
    git('add', '.');
    git('commit', '-qm', 'base');
    w('.sdd/specs/new/requirements.md', vague(1));
    git('add', '.sdd/specs/new/requirements.md');
    const staged = await run('gates', 'run', 'C8', '--staged');
    expect(staged.out).toMatch(/\d+ hallazgo\(s\) en lo que cambia \(\d+ en todo el repositorio\)/);
    const whole = await run('gates', 'run', 'C8');
    expect(whole.out).toContain('usa --staged o --base <ref> para ver solo los de lo que cambia');
  });
});
