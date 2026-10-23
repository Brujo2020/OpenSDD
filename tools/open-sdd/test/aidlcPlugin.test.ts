/** REQ-PB-011: the `opensdd` AI-DLC plugin template — prefixed sensors, fail-closed runner. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = path.join(process.cwd(), 'templates/integrations/aidlc-plugin/opensdd');

describe('aidlc plugin opensdd', () => {
  it('declares four opensdd- sensors whose files exist', () => {
    const plugin = JSON.parse(readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    expect(plugin.name).toBe('opensdd');
    expect(plugin.sensors.map((s: { id: string }) => s.id)).toEqual(['opensdd-ears', 'opensdd-constitution', 'opensdd-boundary', 'opensdd-gates']);
    for (const s of plugin.sensors) {
      expect(s.id.startsWith('opensdd-')).toBe(true);
      expect(existsSync(path.join(dir, s.file))).toBe(true);
    }
  });

  it('fails closed when the CLI is absent', () => {
    const r = spawnSync('/bin/sh', [path.join(dir, 'bin/opensdd-sensor'), 'gates'], { env: { PATH: '/nonexistent' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('CLI not found');
  });

  it('runs the gates sensor through the CLI when present', () => {
    const r = spawnSync('/bin/sh', [path.join(dir, 'bin/opensdd-sensor'), 'nope'], { env: { ...process.env, OPEN_SDD_CLI: path.join(process.cwd(), 'dist/cli.js') }, encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
