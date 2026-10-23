/**
 * The wave referee (REQ-PB-007), adopted from AI-DLC's stateless swarm referee.
 *
 * Waves are the topological levels of the unit/task dependency graph. Unlike the planner in
 * `scheduler.ts` (which breaks a cycle by force to keep printing a plan), the referee REFUSES a
 * cyclic or dangling graph: a merge decision cannot rest on an order that does not exist.
 *
 * Finalizing a wave trusts one signal only: the project's own check command, re-run for every unit
 * that claims completion (exit 0 is the only pass). Protected test files are compared with the
 * baseline taken when the wave started, so a unit cannot pass by editing the tests that judge it.
 * A failed unit keeps its passing siblings and stops for a human decision.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './questions.js';

export interface UnitNode {
  id: string;
  depends: string[];
  done: boolean;
}

export const topologicalWaves = (nodes: UnitNode[]): { waves: string[][]; error?: string } => {
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) for (const d of n.depends) if (!ids.has(d)) return { waves: [], error: `unit ${n.id} depends on unknown ${d}` };
  const placed = new Set<string>();
  const waves: string[][] = [];
  while (placed.size < nodes.length) {
    const level = nodes.filter((n) => !placed.has(n.id) && n.depends.every((d) => placed.has(d))).map((n) => n.id);
    if (level.length === 0) {
      const rest = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id);
      return { waves, error: `dependency cycle among ${rest.join(', ')}` };
    }
    level.forEach((id) => placed.add(id));
    waves.push(level);
  }
  return { waves };
};

const baselineFile = (cwd: string, feature: string, wave: number): string => path.join(cwd, '.sdd', 'waves', feature, `wave-${wave}.baseline.json`);

export const recordBaseline = async (cwd: string, feature: string, wave: number, protect: string[]): Promise<Record<string, string>> => {
  const snap: Record<string, string> = {};
  for (const p of protect) {
    const text = await readFile(path.join(cwd, p)).catch(() => null);
    snap[p] = text ? sha256(text) : '';
  }
  await mkdir(path.dirname(baselineFile(cwd, feature, wave)), { recursive: true });
  await writeFile(baselineFile(cwd, feature, wave), `${JSON.stringify(snap, null, 2)}\n`, 'utf8');
  return snap;
};

export interface UnitVerdict {
  unit: string;
  exitCode: number;
  workdir: string;
}

export interface RefereeVerdict {
  wave: number;
  units: UnitVerdict[];
  tampered: string[];
  mergeAllowed: boolean;
  failed: string[];
  kept: string[];
}

export const finalizeWave = async (
  cwd: string,
  input: { feature: string; wave: number; units: string[]; check: string; worktreeBase?: string },
): Promise<RefereeVerdict> => {
  const units: UnitVerdict[] = [];
  for (const unit of input.units) {
    const wt = path.join(cwd, input.worktreeBase ?? '.worktrees', `${input.feature}-w${input.wave}-${unit}`);
    const workdir = existsSync(wt) ? wt : cwd;
    const run = spawnSync(input.check, { cwd: workdir, shell: true, env: { ...process.env, OPEN_SDD_UNIT: unit, OPEN_SDD_WAVE: String(input.wave) }, stdio: 'ignore' });
    units.push({ unit, exitCode: run.status ?? 1, workdir: path.relative(cwd, workdir) || '.' });
  }
  const tampered: string[] = [];
  const rawBaseline = await readFile(baselineFile(cwd, input.feature, input.wave), 'utf8').catch(() => null);
  if (rawBaseline) {
    const base = JSON.parse(rawBaseline) as Record<string, string>;
    for (const [p, h] of Object.entries(base)) {
      const text = await readFile(path.join(cwd, p)).catch(() => null);
      if ((text ? sha256(text) : '') !== h) tampered.push(p);
    }
  }
  const failed = units.filter((u) => u.exitCode !== 0).map((u) => u.unit);
  return { wave: input.wave, units, tampered, mergeAllowed: failed.length === 0 && tampered.length === 0, failed, kept: units.filter((u) => u.exitCode === 0).map((u) => u.unit) };
};
