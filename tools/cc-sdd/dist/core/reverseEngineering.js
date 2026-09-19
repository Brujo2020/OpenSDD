import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initSpec, resolveSddDir } from './specManager.js';
export const scanProject = async (cwd = process.cwd()) => {
    const checkExists = async (target) => {
        try {
            await stat(path.join(cwd, target));
            return true;
        }
        catch {
            return false;
        }
    };
    let name = path.basename(cwd);
    let language = 'unknown';
    const frameworks = [];
    let packageManager;
    let buildTool;
    let testFramework;
    // Node.js detection
    if (await checkExists('package.json')) {
        try {
            const pkgRaw = await readFile(path.join(cwd, 'package.json'), 'utf8');
            const pkg = JSON.parse(pkgRaw);
            if (pkg.name)
                name = pkg.name;
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps.typescript || (await checkExists('tsconfig.json'))) {
                language = 'TypeScript';
            }
            else {
                language = 'JavaScript';
            }
            if (deps.react)
                frameworks.push('React');
            if (deps.next)
                frameworks.push('Next.js');
            if (deps.vue)
                frameworks.push('Vue');
            if (deps.express)
                frameworks.push('Express');
            if (deps.fastify)
                frameworks.push('Fastify');
            if (deps.nest || deps['@nestjs/core'])
                frameworks.push('NestJS');
            if (deps.vitest)
                testFramework = 'Vitest';
            else if (deps.jest)
                testFramework = 'Jest';
            else if (deps.mocha)
                testFramework = 'Mocha';
            if (await checkExists('pnpm-lock.yaml'))
                packageManager = 'pnpm';
            else if (await checkExists('yarn.lock'))
                packageManager = 'yarn';
            else if (await checkExists('bun.lockb'))
                packageManager = 'bun';
            else
                packageManager = 'npm';
        }
        catch {
            language = 'JavaScript/TypeScript';
        }
    }
    else if (await checkExists('Cargo.toml')) {
        language = 'Rust';
        packageManager = 'cargo';
        buildTool = 'cargo';
        testFramework = 'cargo test';
    }
    else if (await checkExists('go.mod')) {
        language = 'Go';
        packageManager = 'go mod';
        buildTool = 'go build';
        testFramework = 'go test';
    }
    else if (await checkExists('pyproject.toml') || (await checkExists('requirements.txt'))) {
        language = 'Python';
        if (await checkExists('poetry.lock'))
            packageManager = 'poetry';
        else if (await checkExists('uv.lock'))
            packageManager = 'uv';
        else
            packageManager = 'pip';
    }
    // Scan source dirs
    const candidateSourceDirs = ['src', 'lib', 'packages', 'apps', 'core', 'app'];
    const sourceDirs = [];
    for (const dir of candidateSourceDirs) {
        if (await checkExists(dir)) {
            sourceDirs.push(dir);
        }
    }
    // Scan test dirs
    const candidateTestDirs = ['test', 'tests', '__tests__', 'spec'];
    const testDirs = [];
    for (const dir of candidateTestDirs) {
        if (await checkExists(dir)) {
            testDirs.push(dir);
        }
    }
    // Discover modules
    const modules = [];
    for (const sDir of sourceDirs) {
        try {
            const entries = await readdir(path.join(cwd, sDir), { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    modules.push(entry.name);
                }
            }
        }
        catch {
            // ignore
        }
    }
    if (modules.length === 0 && sourceDirs.length > 0) {
        modules.push('core');
    }
    return {
        name,
        language,
        frameworks,
        packageManager,
        buildTool,
        testFramework,
        sourceDirs,
        testDirs,
        modules: Array.from(new Set(modules)).sort(),
    };
};
export const bootstrapSteering = async (cwd = process.cwd(), project, sddDir) => {
    const resolvedDir = sddDir ?? (await resolveSddDir(cwd));
    const steeringDir = path.join(cwd, resolvedDir, 'steering');
    await mkdir(steeringDir, { recursive: true });
    const proj = project ?? (await scanProject(cwd));
    const filesCreated = [];
    const checkAndWrite = async (file, content) => {
        const fullPath = path.join(steeringDir, file);
        try {
            await stat(fullPath);
            // exists: do not overwrite existing steering
        }
        catch {
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
export const bootstrapSpecSeeds = async (cwd = process.cwd(), focus, sddDir) => {
    const resolvedDir = sddDir ?? (await resolveSddDir(cwd));
    const proj = await scanProject(cwd);
    const targets = focus ? [focus] : proj.modules.slice(0, 5); // Limit initial batch to top 5 modules
    const seedsCreated = [];
    for (const target of targets) {
        const slug = target
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (!slug)
            continue;
        const res = await initSpec(cwd, slug, {
            title: `Reverse-engineered: ${target}`,
            sddDir: resolvedDir,
            createBranch: false,
        });
        seedsCreated.push(slug);
    }
    return { seedsCreated };
};
