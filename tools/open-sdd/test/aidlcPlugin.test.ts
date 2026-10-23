/** REQ-PB-011: the `opensdd` AI-DLC plugin — AI-DLC plugin layout, prefixed sensors, fail-closed runners. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = path.join(process.cwd(), 'templates/integrations/aidlc-plugin/opensdd');
const sensor = (id: string, args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', path.join(dir, 'tools', `aidlc-sensor-${id}.ts`), ...args], { env, encoding: 'utf8' });

describe('aidlc plugin opensdd', () => {
  it('follows the AI-DLC plugin layout', () => {
    const m = JSON.parse(readFileSync(path.join(dir, '.aidlc-plugin/plugin.json'), 'utf8'));
    expect(m.name).toBe('opensdd');
    expect(m.dependencies).toEqual(['core']);
    expect(m.aidlc.contributes).toEqual({ overlays: 'contributions/', sensors: 'sensors/', tools: 'tools/' });
  });
  it('every sensor manifest is prefixed, deterministic, advisory and has its tool', () => {
    for (const id of ['opensdd-ears', 'opensdd-gates', 'opensdd-steering']) {
      const md = readFileSync(path.join(dir, 'sensors', `aidlc-${id}.md`), 'utf8');
      expect(md).toContain(`id: ${id}`);
      expect(md).toContain('kind: deterministic');
      expect(md).toContain('default_severity: advisory');
      expect(md).toContain(`tools/aidlc-sensor-${id}.ts`);
      expect(existsSync(path.join(dir, 'tools', `aidlc-sensor-${id}.ts`))).toBe(true);
    }
  });
  it('contributions attach sensors to AI-DLC stages', () => {
    expect(readFileSync(path.join(dir, 'contributions/inception/requirements-analysis.md'), 'utf8')).toContain('- opensdd-ears');
    expect(readFileSync(path.join(dir, 'contributions/construction/code-generation.md'), 'utf8')).toContain('- opensdd-gates');
  });
  it('fails closed when the CLI is absent', () => {
    const r = sensor('opensdd-gates', ['--output-path', 'x'], { PATH: '/nonexistent' });
    const j = JSON.parse(r.stdout);
    expect(j.pass).toBe(false);
    expect(j.findings[0]).toContain('CLI not found');
  });
  it('the EARS sensor reports unconvertible statements through the CLI', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'aidlc-'));
    const f = path.join(d, 'requirements.md');
    writeFileSync(f, '- When a refund is approved the ledger must record it.\n- The export should be fast.\n');
    const j = JSON.parse(sensor('opensdd-ears', ['--output-path', f], { PATH: process.env.PATH, OPEN_SDD_CLI: path.join(process.cwd(), 'dist/cli.js') }).stdout);
    expect(j.pass).toBe(false);
    expect(j.findings.join(' ')).toContain('not testable');
  });
  it('a write the sensor does not own passes through', () => {
    const j = JSON.parse(sensor('opensdd-ears', ['--output-path', '/tmp/other.md'], { PATH: '/nonexistent' }).stdout);
    expect(j).toEqual({ pass: true, findings_count: 0, findings: [] });
  });
});
