/** Sprint 3 of docs/REVISION-EXPERTO.md: calibration by κ (point 8) and one source (point 10). */
import { describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calibrationCorpus, runCalibration } from '../src/core/calibrate.js';
import { PREREGISTERED_N, SUBSTANTIAL_KAPPA } from '../src/core/metaEval.js';
import { ALWAYS_ON_RULES, alwaysOnRules, installCommandTemplates } from '../src/core/commandTemplates.js';

const repo = path.resolve(__dirname, '..', '..', '..');

describe('calibration (point 8)', () => {
  const rows = runCalibration();
  const row = (d: string) => rows.find((r) => r.detector === d)!;

  it('every detector agrees substantially with the labelled corpus and has no false alarm', () => {
    for (const r of rows) {
      expect(r.kappa.kappa, r.detector).toBeGreaterThanOrEqual(SUBSTANTIAL_KAPPA);
      expect(r.precision, r.detector).toBe(1);
      expect(r.falseAlarms, r.detector).toEqual([]);
    }
  });

  it('the misses are exactly the declared gaps (measured, not hidden)', () => {
    expect(row('audit-chain').misses.every((id) => id.startsWith('AC-truncate'))).toBe(true);
    expect(row('escalation').misses).toEqual(['ES-fake-progress']);
    expect(row('ears').misses.length).toBeGreaterThan(0);
  });

  it('nothing may block on calibration alone until the preregistered size is reached', () => {
    expect(calibrationCorpus().length).toBeLessThan(PREREGISTERED_N * 3);
    for (const r of rows) expect(r.mayBlock, r.detector).toBe(r.n >= PREREGISTERED_N && r.kappa.kappa >= SUBSTANTIAL_KAPPA);
  });
});

describe('one source (point 10)', () => {
  const sync = (root: string, ...flags: string[]) =>
    spawnSync(process.execPath, [path.join(repo, 'scripts', 'sync-templates.mjs'), '--root', root, ...flags], { encoding: 'utf8' });

  it('the repository has no drift', () => {
    const r = sync(repo, '--check');
    expect(r.stdout).toContain('every copy matches its source');
    expect(r.status).toBe(0);
  });

  it('a hand-edited copy is reported by --check and restored by sync', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'sync-'));
    cpSync(path.join(repo, 'tools', 'open-sdd', 'templates'), path.join(tmp, 'tools', 'open-sdd', 'templates'), { recursive: true });
    const copy = path.join(tmp, 'tools/open-sdd/templates/agents/cursor-skills/skills/sdd-help/SKILL.md');
    writeFileSync(copy, `${readFileSync(copy, 'utf8')}\nlocal edit\n`);
    const quick = path.join(tmp, 'tools/open-sdd/templates/agents/codex/docs/AGENTS.md');
    writeFileSync(quick, readFileSync(quick, 'utf8').replace('more than 3 failed iterations', 'more than 9 failed iterations'));
    const checked = sync(tmp, '--check');
    expect(checked.status).toBe(1);
    expect(checked.stdout).toContain('cursor-skills/skills/sdd-help/SKILL.md');
    expect(checked.stdout).toContain('codex/docs/AGENTS.md');
    expect(sync(tmp).status).toBe(0);
    expect(sync(tmp, '--check').status).toBe(0);
  });

  it('a file that only exists in a copy is drift; a CRLF checkout is not', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'sync2-'));
    cpSync(path.join(repo, 'tools', 'open-sdd', 'templates'), path.join(tmp, 'tools', 'open-sdd', 'templates'), { recursive: true });
    const stray = path.join(tmp, 'tools/open-sdd/templates/agents/codex-skills/skills/sdd-help/old-notes.md');
    writeFileSync(stray, 'removed from the source long ago');
    const quick = path.join(tmp, 'tools/open-sdd/templates/agents/cursor/docs/AGENTS.md');
    writeFileSync(quick, readFileSync(quick, 'utf8').replace(/\n/g, '\r\n'));
    const checked = sync(tmp, '--check');
    expect(checked.status).toBe(1);
    expect(checked.stdout).toContain('old-notes.md (not in the source)');
    expect(checked.stdout).not.toContain('cursor/docs/AGENTS.md');
    expect(sync(tmp).status).toBe(0);
    expect(existsSync(stray)).toBe(false);
  });

  it('installed commands read the same rules file', () => {
    const rules = readFileSync(path.join(repo, 'tools/open-sdd/templates/shared/always-on-rules.md'), 'utf8');
    expect(rules.trim().length).toBeGreaterThan(0);
    expect(ALWAYS_ON_RULES).toContain(rules.replace(/\{\{SDD_DIR\}\}/g, '.sdd'));
  });

  it('installed commands honour --sdd-dir in the rules', async () => {
    expect(alwaysOnRules('docs/sdd')).not.toContain('{{SDD_DIR}}');
    expect(alwaysOnRules('docs/sdd')).toContain('docs/sdd/');
    const dir = mkdtempSync(path.join(tmpdir(), 'osdd-sdddir-'));
    await installCommandTemplates({ cwd: dir, hosts: ['claude-code'], write: true, sddDir: 'docs/sdd' });
    const cmd = readFileSync(path.join(dir, '.claude', 'commands', 'sdd-constitution.md'), 'utf8');
    expect(cmd).toContain('docs/sdd/');
    expect(cmd).not.toContain('{{SDD_DIR}}');
  });
});
