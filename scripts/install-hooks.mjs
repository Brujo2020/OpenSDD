#!/usr/bin/env node
/**
 * Install the open-sdd commit gate (enforcement level B) into this checkout.
 *
 * Wired to `npm run prepare`, so a contributor gets the floor without reading any documentation.
 * It is deliberately forgiving about its environment and strict about one thing: it never installs
 * over an existing hook it does not recognise without saying so.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const finish = (message, code = 0) => {
  console.log(`[open-sdd] ${message}`);
  process.exit(code);
};

try {
  const hookSource = path.resolve(scriptDir, '..', 'tools', 'cc-sdd', 'templates', 'hooks', 'pre-commit');

  // No git checkout (installed as a dependency, or unpacked tarball): nothing to install.
  if (!existsSync(path.join(root, '.git'))) {
    finish('no git checkout in this directory; skipping commit-gate install.');
  }

  // Publishing or packing without the template: do not fail the install over it.
  if (!existsSync(hookSource)) {
    finish('commit-gate template not found; skipping install (the npm package ships prebuilt).');
  }

  const hooksDir = path.join(root, '.git', 'hooks');
  const hookTarget = path.join(hooksDir, 'pre-commit');
  mkdirSync(hooksDir, { recursive: true });

  if (existsSync(hookTarget)) {
    const existing = readFileSync(hookTarget, 'utf8');
    if (!existing.includes('open-sdd')) {
      const backup = `${hookTarget}.open-sdd-backup`;
      if (!existsSync(backup)) {
        copyFileSync(hookTarget, backup);
        finish(`existing pre-commit hook preserved as ${path.relative(root, backup)}.`);
      } else {
        finish(
          `an unrecognised pre-commit hook is already installed and a backup exists; leaving it untouched. Install manually with \`npm run hooks:install -- --force\`.`,
        );
      }
    }
  }

  const force = process.argv.includes('--force');
  const current = existsSync(hookTarget) ? readFileSync(hookTarget, 'utf8') : null;
  const desired = readFileSync(hookSource, 'utf8');

  if (force || current === null) {
    copyFileSync(hookSource, hookTarget);
    chmodSync(hookTarget, 0o755);
    finish(`commit gate installed at ${path.relative(root, hookTarget)} (level B: runs C1, C2, C3 on the staged index).`);
  }

  // An existing hook that is OURS but outdated must be refreshed. Skipping on mere presence meant a
  // contributor kept running the previous version of the gate forever — including versions that did
  // not yet enforce the declared rigor level.
  if (current !== desired) {
    copyFileSync(hookSource, hookTarget);
    chmodSync(hookTarget, 0o755);
    finish(`commit gate updated at ${path.relative(root, hookTarget)} (it was an older version of this gate).`);
  }

  finish('commit gate already up to date.');
} catch (error) {
  // Never break `npm install` over hook installation; report and continue.
  const message = error instanceof Error ? error.message : String(error);
  finish(`could not install the commit gate (${message}). Run \`npm run hooks:install\` manually.`);
}
