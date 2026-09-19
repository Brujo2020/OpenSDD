import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveredProject } from './types.js';
import { initSpec, resolveSddDir } from './specManager.js';

/**
 * Discover what a project IS, before anyone plans a change to it.
 *
 * Two properties matter for brownfield work and both were missing:
 *
 *   1. **A repository is not always its root.** In a workspace/monorepo layout the real project
 *      lives in a nested package (`tools/cc-sdd`, `packages/*`, `apps/*`). Scanning the root only
 *      made this tool report "JavaScript, no tests detected" on the very repository that ships it —
 *      a brownfield survey that lies about the project it is run on is worse than no survey.
 *   2. **Tooling is declared in config as often as in dependencies.** A language, test runner or
 *      build tool is visible through `tsconfig.json`, `vitest.config.ts`, `jest.config.js`,
 *      `go.mod` or `pyproject.toml` even when no manifest at the scanned root mentions them.
 *
 * The result is evidence, not opinion: every field below is derived from a file that exists. When
 * something cannot be determined the field stays `unknown` rather than being guessed, because a
 * descriptive constitution may only assert what the code already is.
 */
export const scanProject = async (cwd: string = process.cwd()): Promise<DiscoveredProject> => {
  const checkExists = async (target: string): Promise<boolean> => {
    try {
      await stat(path.join(cwd, target));
      return true;
    } catch {
      return false;
    }
  };

  const readJson = async (rel: string): Promise<Record<string, unknown> | null> => {
    try {
      return JSON.parse(await readFile(path.join(cwd, rel), 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const subdirsWithManifest = async (parent: string): Promise<string[]> => {
    try {
      const entries = await readdir(path.join(cwd, parent), { withFileTypes: true });
      const found: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (await checkExists(path.join(parent, entry.name, 'package.json'))) {
          found.push(path.posix.join(parent, entry.name));
        }
      }
      return found;
    } catch {
      return [];
    }
  };

  // --- workspace roots -------------------------------------------------------------------------
  const rootPkg = await readJson('package.json');
  const workspaceGlobs = (() => {
    const declared = rootPkg?.workspaces;
    if (Array.isArray(declared)) return declared.filter((w): w is string => typeof w === 'string');
    if (declared && typeof declared === 'object' && Array.isArray((declared as { packages?: unknown }).packages)) {
      return ((declared as { packages: unknown[] }).packages).filter((w): w is string => typeof w === 'string');
    }
    return [];
  })();

  const workspaceRoots = new Set<string>();
  for (const glob of workspaceGlobs) {
    const parent = glob.replace(/\/\*+$/, '').replace(/\*+$/, '').replace(/\/$/, '');
    for (const dir of await subdirsWithManifest(parent || '.')) workspaceRoots.add(dir);
  }
  for (const conventional of ['packages', 'apps', 'tools', 'services', 'libs', 'modules']) {
    for (const dir of await subdirsWithManifest(conventional)) workspaceRoots.add(dir);
  }

  const roots = ['.', ...Array.from(workspaceRoots).sort()];

  // --- Node/TypeScript evidence, merged across every root --------------------------------------
  let name = path.basename(cwd) || 'project';
  let language = 'unknown';
  let packageManager: string | undefined;
  let buildTool: string | undefined;
  let testFramework: string | undefined;
  const frameworks = new Set<string>();
  let sawAnyManifest = false;

  for (const root of roots) {
    const pkg = root === '.' ? rootPkg : await readJson(path.posix.join(root, 'package.json'));
    if (!pkg) continue;
    sawAnyManifest = true;

    if (root === '.' && typeof pkg.name === 'string' && pkg.name) name = pkg.name;
    else if (root !== '.' && typeof pkg.name === 'string' && pkg.name && name === path.basename(cwd)) {
      name = pkg.name;
    }

    const deps: Record<string, unknown> = {
      ...((pkg.dependencies as Record<string, unknown>) ?? {}),
      ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
      ...((pkg.peerDependencies as Record<string, unknown>) ?? {}),
    };

    const hasTsConfig = await checkExists(root === '.' ? 'tsconfig.json' : path.posix.join(root, 'tsconfig.json'));
    if (deps.typescript || hasTsConfig) language = 'TypeScript';
    else if (language === 'unknown') language = 'JavaScript';

    const frameworkMap: [string, string][] = [
      ['react', 'React'],
      ['next', 'Next.js'],
      ['vue', 'Vue'],
      ['svelte', 'Svelte'],
      ['angular', 'Angular'],
      ['@angular/core', 'Angular'],
      ['express', 'Express'],
      ['fastify', 'Fastify'],
      ['@nestjs/core', 'NestJS'],
      ['nest', 'NestJS'],
      ['koa', 'Koa'],
      ['hapi', 'hapi'],
    ];
    for (const [dep, label] of frameworkMap) if (deps[dep]) frameworks.add(label);

    const testMap: [string, string][] = [
      ['vitest', 'Vitest'],
      ['jest', 'Jest'],
      ['mocha', 'Mocha'],
      ['@jasmine/core', 'Jasmine'],
      ['jasmine', 'Jasmine'],
      ['ava', 'AVA'],
      ['playwright', 'Playwright'],
      ['@playwright/test', 'Playwright'],
      ['cypress', 'Cypress'],
    ];
    for (const [dep, label] of testMap) if (!testFramework && deps[dep]) testFramework = label;

    const buildMap: [string, string][] = [
      ['typescript', 'tsc'],
      ['vite', 'Vite'],
      ['webpack', 'webpack'],
      ['esbuild', 'esbuild'],
      ['rollup', 'rollup'],
      ['tsup', 'tsup'],
      ['turbo', 'Turborepo'],
      ['nx', 'Nx'],
    ];
    for (const [dep, label] of buildMap) if (!buildTool && deps[dep]) buildTool = label;
  }

  // Config files are evidence too: a test runner or transpiler declared only by its config.
  const configProbes: [string, () => void][] = [
    ['vitest.config.ts', () => (testFramework = testFramework ?? 'Vitest')],
    ['vitest.config.js', () => (testFramework = testFramework ?? 'Vitest')],
    ['jest.config.js', () => (testFramework = testFramework ?? 'Jest')],
    ['jest.config.ts', () => (testFramework = testFramework ?? 'Jest')],
    ['playwright.config.ts', () => (testFramework = testFramework ?? 'Playwright')],
    ['cypress.config.ts', () => (testFramework = testFramework ?? 'Cypress')],
    ['tsconfig.json', () => (language = 'TypeScript')],
    ['vite.config.ts', () => (buildTool = buildTool ?? 'Vite')],
    ['turbo.json', () => (buildTool = buildTool ?? 'Turborepo')],
    ['nx.json', () => (buildTool = buildTool ?? 'Nx')],
  ];
  for (const [probe, apply] of configProbes) {
    for (const root of roots) {
      const rel = root === '.' ? probe : path.posix.join(root, probe);
      if (await checkExists(rel)) apply();
    }
  }

  // Lockfiles: the first one found anywhere decides the package manager.
  const managerProbes: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];
  for (const [probe, manager] of managerProbes) {
    if (packageManager) break;
    for (const root of roots) {
      const rel = root === '.' ? probe : path.posix.join(root, probe);
      if (await checkExists(rel)) {
        packageManager = manager;
        break;
      }
    }
  }
  if (sawAnyManifest && !packageManager) packageManager = 'npm';

  // --- other ecosystems, at the root or inside a workspace -------------------------------------
  if (!sawAnyManifest) {
    const ecosystems: [string, string, string, string][] = [
      ['Cargo.toml', 'Rust', 'cargo', 'cargo test'],
      ['go.mod', 'Go', 'go mod', 'go test'],
    ];
    for (const [manifest, lang, manager, test] of ecosystems) {
      if (await checkExists(manifest)) {
        language = lang;
        packageManager = manager;
        buildTool = manager;
        testFramework = test;
        break;
      }
    }
    if (language === 'unknown' && ((await checkExists('pyproject.toml')) || (await checkExists('requirements.txt')))) {
      language = 'Python';
      packageManager = (await checkExists('poetry.lock')) ? 'poetry' : (await checkExists('uv.lock')) ? 'uv' : 'pip';
    }
  }

  // --- source and test directories, per root ---------------------------------------------------
  const sourceDirs: string[] = [];
  for (const root of roots) {
    for (const dir of ['src', 'lib', 'app', 'core', 'source']) {
      const rel = root === '.' ? dir : path.posix.join(root, dir);
      if (await checkExists(rel)) sourceDirs.push(rel);
    }
  }

  const testDirs: string[] = [];
  for (const root of roots) {
    for (const dir of ['test', 'tests', '__tests__', 'spec', 'e2e']) {
      const rel = root === '.' ? dir : path.posix.join(root, dir);
      if (await checkExists(rel)) testDirs.push(rel);
    }
  }

  const modules: string[] = [];
  for (const sDir of sourceDirs) {
    try {
      const entries = await readdir(path.join(cwd, sDir), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) modules.push(entry.name);
      }
    } catch {
      // unreadable directory: reported by absence, not guessed
    }
  }
  // No fabricated fallback: a module named 'core' that nobody observed would be cited as evidence
  // of an existing boundary. When a source directory has no subdirectories the boundary is that
  // directory itself, which the constitution uses as its fallback.

  return {
    name,
    language,
    frameworks: Array.from(frameworks).sort(),
    ...(packageManager ? { packageManager } : {}),
    ...(buildTool ? { buildTool } : {}),
    ...(testFramework ? { testFramework } : {}),
    sourceDirs,
    testDirs,
    modules: Array.from(new Set(modules)).sort(),
    ...(workspaceRoots.size > 0 ? { workspaceRoots: Array.from(workspaceRoots).sort() } : {}),
  };
};

export const bootstrapSteering = async (
  cwd: string = process.cwd(),
  project?: DiscoveredProject,
  sddDir?: string,
): Promise<{ steeringDir: string; filesCreated: string[] }> => {
  const resolvedDir = sddDir ?? (await resolveSddDir(cwd));
  const steeringDir = path.join(cwd, resolvedDir, 'steering');
  await mkdir(steeringDir, { recursive: true });

  const proj = project ?? (await scanProject(cwd));
  const filesCreated: string[] = [];

  const checkAndWrite = async (file: string, content: string) => {
    const fullPath = path.join(steeringDir, file);
    try {
      await stat(fullPath);
      // exists: do not overwrite existing steering
    } catch {
      await writeFile(fullPath, content, 'utf8');
      filesCreated.push(file);
    }
  };

  // product.md
  const productMd = `# Product Steering: ${proj.name}

## Mission & Purpose
Reverse-engineered architecture foundation for ${proj.name}.

## Domain Boundaries
- Core Application: ${proj.name}
- Detected Modules: ${proj.modules.length > 0 ? proj.modules.join(', ') : 'Standard architecture'}
`;
  await checkAndWrite('product.md', productMd);

  // tech.md
  const techMd = `# Technical Steering: ${proj.name}

## Architecture & Technology Stack
- **Primary Language**: ${proj.language}
- **Frameworks**: ${proj.frameworks.length > 0 ? proj.frameworks.join(', ') : 'Standard standard library'}
- **Package Manager**: ${proj.packageManager ?? 'Native'}
- **Testing Framework**: ${proj.testFramework ?? 'Native test runner'}

## Development Conventions
- Strict boundaries: modifications must stay within task \`_Boundary:_\` definitions.
- TDD required: tests written before implementation code.
- Zero-Trust validation: all specs require review and validation gates before release.
`;
  await checkAndWrite('tech.md', techMd);

  // structure.md
  const structureMd = `# Structure Steering: ${proj.name}

## Directory Topology
- Source directories: ${proj.sourceDirs.length > 0 ? proj.sourceDirs.join(', ') : 'Root'}
- Test directories: ${proj.testDirs.length > 0 ? proj.testDirs.join(', ') : 'test/'}
- Specifications: \`${resolvedDir}/specs/\`
- Persistent Steering: \`${resolvedDir}/steering/\`
`;
  await checkAndWrite('structure.md', structureMd);

  return { steeringDir, filesCreated };
};

export const bootstrapSpecSeeds = async (
  cwd: string = process.cwd(),
  focus?: string,
  sddDir?: string,
): Promise<{ seedsCreated: string[] }> => {
  const resolvedDir = sddDir ?? (await resolveSddDir(cwd));
  const proj = await scanProject(cwd);
  const targets = focus ? [focus] : proj.modules.slice(0, 5); // Limit initial batch to top 5 modules

  const seedsCreated: string[] = [];
  for (const target of targets) {
    const slug = target
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) continue;

    const res = await initSpec(cwd, slug, {
      title: `Reverse-engineered: ${target}`,
      sddDir: resolvedDir,
      createBranch: false,
    });

    seedsCreated.push(slug);
  }

  return { seedsCreated };
};
