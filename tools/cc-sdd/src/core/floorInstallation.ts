/**
 * Is the enforcement floor actually installed, or only declared?
 *
 * The reference architecture's central structural claim is that the guarantee a programme can
 * make on day one is the commit/merge floor, because those boundaries belong to the organization.
 * Ownership is not installation, though: a repository can reason its way to "B and C are ours"
 * while shipping neither a pre-commit hook nor a pull-request gate matrix. This module answers the
 * second question separately, so the report cannot conflate the two.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface InstalledFloor {
  /** The repository ships an installable pre-commit hook. */
  commitHookShipped: boolean;
  /** The hook is installed in this checkout's `.git/hooks`. */
  commitHookInstalled: boolean;
  /** A workflow runs the gate chain on pull requests. */
  ciGateMatrix: boolean;
  /** Workflows that mention the gate chain at all. */
  workflowsReferencingGates: string[];
  /** True only when both owned boundaries are operational here. */
  floorInstalled: boolean;
  detail: string;
}

const fileExists = async (p: string): Promise<boolean> =>
  (await stat(p).catch(() => null)) !== null;

export const detectInstalledFloor = async (
  cwd: string,
  options: { hookPath?: string; workflowsDir?: string } = {},
): Promise<InstalledFloor> => {
  const hookPath = options.hookPath ?? path.join('tools', 'cc-sdd', 'templates', 'hooks', 'pre-commit');
  const workflowsDir = options.workflowsDir ?? path.join('.github', 'workflows');
  const gitHook = path.join('.git', 'hooks', 'pre-commit');

  const commitHookShipped = await fileExists(path.join(cwd, hookPath));
  const commitHookInstalled = await fileExists(path.join(cwd, gitHook));

  const entries = await readdir(path.join(cwd, workflowsDir), { withFileTypes: true }).catch(() => []);
  const workflowsReferencingGates: string[] = [];
  let ciGateMatrix = false;

  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const content = await readFile(path.join(cwd, workflowsDir, entry.name), 'utf8').catch(() => '');
    if (!/gates run/.test(content)) continue;
    workflowsReferencingGates.push(entry.name);
    // A gate matrix only counts as the merge boundary if it runs on pull requests. A workflow
    // that only runs on tag pushes is a release check, not a merge gate.
    if (/pull_request/.test(content)) ciGateMatrix = true;
  }

  const floorInstalled = commitHookShipped && commitHookInstalled && ciGateMatrix;
  const missing: string[] = [];
  if (!commitHookShipped) missing.push('hook no incluido en el repositorio');
  else if (!commitHookInstalled) missing.push('hook no instalado en .git/hooks (ejecuta `npm run hooks:install`)');
  if (!ciGateMatrix) missing.push('ningún workflow corre la cadena en pull_request');

  return {
    commitHookShipped,
    commitHookInstalled,
    ciGateMatrix,
    workflowsReferencingGates,
    floorInstalled,
    detail: floorInstalled
      ? 'Suelo instalado: el hook de commit ejecuta los gates críticos y la matriz completa corre en cada pull request.'
      : `Suelo declarado pero NO instalado: ${missing.join('; ')}.`,
  };
};
