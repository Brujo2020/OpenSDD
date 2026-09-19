/**
 * Brownfield CLI surface: delta specs and the reverse-engineered constitution.
 *
 *   delta init|validate|status      the contract of change (ADSR, delta-scoped REQ-IDs)
 *   brownfield constitution|survey  the descriptive constitution and the repo facts behind it
 *
 * These commands exist because the brownfield unit is the DELTA, not the system: a command that
 * scaffolds and validates a delta makes the correct artifact the easy one.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { colors } from '../ui/colors.js';
import { scanProject } from '../../core/reverseEngineering.js';
import { buildDescriptiveConstitution, collectRepoFacts } from '../../core/reverseConstitution.js';
import { parseConstitution, renderConstitution, validateConstitution, principlesInForce, resolveAuthority } from '../../core/constitution.js';
import { deltaCounts, deltaSpecFileName, parseDeltaSpec, renderDeltaSpec, strangulationReport, traceDelta, validateDeltaSpec, } from '../../core/deltaSpec.js';
import { parseTasksMarkdown } from '../../core/specManager.js';
import { analyzeChangeImpact } from '../../core/changeImpact.js';
import { contractsFileName, extractContracts, testCommandFor, verifyContracts } from '../../core/executionContract.js';
import { REUSE_FIRST_RULE, findReuseCandidates } from '../../core/reuseFirst.js';
const heading = (t) => colors.bold(colors.cyan(t));
const dim = (t) => colors.dim(t);
const findRepoRoot = async (cwd) => {
    let dir = cwd;
    for (let i = 0; i < 6; i += 1) {
        if ((await stat(path.join(dir, '.sdd')).catch(() => null)) !== null)
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return cwd;
};
const readIfExists = async (p) => readFile(p, 'utf8').catch(() => null);
/**
 * The change under analysis, from either boundary.
 *
 * Locally that is the working tree plus the index; in CI the tree is clean and the change is the
 * pull request, so `--base <ref>` diffs against the base commit. Without this the CI step would
 * inspect nothing and pass — the exact "activation without measurement" this tool exists to catch.
 */
const changedFilesFor = (root, base) => {
    if (base) {
        const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], {
            cwd: root,
            encoding: 'utf8',
        });
        if (result.status !== 0)
            return { files: [], source: `diff contra ${base} (falló)` };
        return {
            files: result.stdout.split('\n').map((l) => l.trim()).filter(Boolean),
            source: `diff contra ${base}`,
        };
    }
    // `--untracked-files=all`: without it git reports an untracked DIRECTORY as a single entry, and a
    // directory path reaches the file readers downstream (EISDIR) and is counted as a changed file.
    const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: root,
        encoding: 'utf8',
    });
    if (result.status !== 0)
        return { files: [], source: 'árbol de trabajo (git no disponible)' };
    const files = result.stdout
        .split('\n')
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.length > 3)
        .map((line) => line.slice(3).trim())
        .map((line) => (line.includes(' -> ') ? line.split(' -> ').pop().trim() : line))
        .filter((line) => line.length > 0 && !line.endsWith('/'))
        .filter((file) => {
        try {
            return statSync(path.join(root, file)).isFile();
        }
        catch {
            return false;
        }
    });
    return { files, source: 'árbol de trabajo e índice' };
};
const deltaPath = (root, feature) => path.join(root, '.sdd', 'specs', feature, deltaSpecFileName());
const firstSpec = async (root) => {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(path.join(root, '.sdd', 'specs')).catch(() => []);
    return entries.find((e) => !e.startsWith('.')) ?? null;
};
// ---------------------------------------------------------------------------------------------
// delta
// ---------------------------------------------------------------------------------------------
const deltaTemplate = (feature, title, base) => `# Delta: ${feature} — ${title}

Status: proposed
${base ? `Base: ${base}\n` : ''}
<!--
Una delta describe SOLO lo que cambia (ADSR): ADDED, MODIFIED, REMOVED, RENAMED.
Cada entrada lleva un identificador propio del cambio: REQ-<AREA>-<NNN> (p. ej. REQ-AUTH-001),
nunca un identificador del sistema completo: eso es lo que mantiene finita la obligación.

Plantilla de entrada (descomenta y rellena):

### REQ-AUTH-001 — Título corto del cambio
- Statement: WHEN <disparo>, the <sistema> shall <respuesta>.
- Previous: comportamiento actual que se sustituye (obligatorio en MODIFIED, REMOVED, RENAMED).
- Targets: src/auth/session.ts, POST /sessions
- Contracts: test/auth.test.ts::issues a session   (obligatorio en REMOVED; recomendado en MODIFIED)
- Rationale: por qué se retira y cómo migran sus consumidores (obligatorio en REMOVED).
- Strangler: legacy | both | new

Principio rector: no "mejores" la arquitectura existente durante el descubrimiento. Refleja lo que
hay; las mejoras vienen después, como cambios explícitos y gobernados.
-->

## ADDED

## MODIFIED

## REMOVED

## RENAMED
`;
export const handleDeltaCommand = async (args, io, cwd) => {
    const sub = args[0] ?? 'status';
    const root = await findRepoRoot(cwd);
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    const feature = positional[0] ?? (await firstSpec(root));
    if (!feature) {
        io.error(colors.red('No hay especificación. Pasa un nombre de feature o crea una spec primero.'));
        return 1;
    }
    if (sub === 'init') {
        const title = positional.slice(1).join(' ') || feature;
        const baseIdx = args.findIndex((a) => a === '--base');
        const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
        const target = deltaPath(root, feature);
        if ((await stat(target).catch(() => null)) !== null && !args.includes('--force')) {
            io.error(colors.red(`Ya existe ${path.relative(root, target)}. Usa --force para sobrescribirlo.`));
            return 1;
        }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, deltaTemplate(feature, title, base), 'utf8');
        io.log('');
        io.log(`  ${colors.green('✓')} delta creada: ${path.relative(root, target)}`);
        io.log(dim('    Rellena las secciones ADSR. El identificador de cada entrada es REQ-<AREA>-<NNN>.'));
        io.log('');
        return 0;
    }
    const raw = await readIfExists(deltaPath(root, feature));
    if (raw === null) {
        io.error(colors.red(`No hay delta para "${feature}". Créala con: open-sdd delta init ${feature} "<título del cambio>"`));
        return 1;
    }
    const delta = parseDeltaSpec(raw);
    const counts = deltaCounts(delta);
    const strangler = strangulationReport(delta);
    const tasksRaw = await readIfExists(path.join(root, '.sdd', 'specs', feature, 'tasks.md'));
    const trace = tasksRaw === null ? null : traceDelta(delta, parseTasksMarkdown(tasksRaw));
    if (sub === 'status') {
        io.log('');
        io.log(heading(`Delta: ${delta.feature} — ${delta.title}`));
        io.log(`  estado: ${delta.status}${delta.base ? ` · base: ${delta.base}` : ''}`);
        io.log('');
        io.log(`  ADDED ${counts.ADDED} · MODIFIED ${counts.MODIFIED} · REMOVED ${counts.REMOVED} · RENAMED ${counts.RENAMED}  (total ${delta.entries.length})`);
        io.log(`  ${dim(strangler.detail)}`);
        if (trace)
            io.log(`  Trazabilidad: ${trace.detail}`);
        io.log('');
        return 0;
    }
    if (sub === 'validate') {
        const issues = validateDeltaSpec(delta);
        const errors = issues.filter((i) => i.severity === 'error');
        const warnings = issues.filter((i) => i.severity === 'warning');
        io.log('');
        io.log(heading(`Validación de la delta — ${delta.feature}`));
        io.log('');
        if (delta.entries.length === 0) {
            io.log(`  ${colors.yellow('!')} La delta no tiene entradas todavía: rellena las secciones ADSR.`);
        }
        for (const issue of [...errors, ...warnings]) {
            const mark = issue.severity === 'error' ? colors.red('error') : colors.yellow('aviso');
            io.log(`  ${mark.padEnd(18)} ${issue.id.padEnd(16)} ${issue.code}`);
            io.log(`      ${dim(issue.message)}`);
        }
        if (issues.length === 0) {
            io.log(`  ${colors.green('La delta es válida')}: identificadores, EARS, objetivos y contratos en orden.`);
        }
        io.log('');
        io.log(`  ${errors.length} error(es), ${warnings.length} aviso(s).`);
        if (trace) {
            io.log(`  Trazabilidad: ${trace.detail}`);
            if (trace.unmapped.length > 0) {
                io.log(`  ${colors.yellow('!')} Requisitos de la delta sin tarea: ${trace.unmapped.join(', ')}`);
            }
            if (trace.phantomTasks.length > 0) {
                io.log(`  ${colors.yellow('!')} Tareas que citan ids inexistentes: ${trace.phantomTasks.map((p) => `${p.taskId}→${p.cited}`).join(', ')}`);
            }
        }
        io.log('');
        return errors.length > 0 ? 1 : 0;
    }
    if (sub === 'render') {
        io.log(renderDeltaSpec(delta));
        return 0;
    }
    io.log(`Subcomando desconocido: ${sub}. Usa: init | validate | status | render`);
    return 1;
};
// ---------------------------------------------------------------------------------------------
// brownfield
// ---------------------------------------------------------------------------------------------
export const handleBrownfieldCommand = async (args, io, cwd) => {
    const sub = args[0] ?? 'survey';
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    const target = positional[0] ? path.resolve(cwd, positional[0]) : await findRepoRoot(cwd);
    if (sub === 'survey' || sub === 'constitution') {
        const project = await scanProject(target);
        const facts = await collectRepoFacts(target, project);
        const { constitution, detected, deferred } = buildDescriptiveConstitution(facts);
        const issues = validateConstitution(constitution);
        if (sub === 'survey') {
            io.log('');
            io.log(heading(`Reconocimiento — ${project.name}`));
            io.log('');
            io.log(`  lenguaje: ${project.language}`);
            if (project.frameworks.length > 0)
                io.log(`  frameworks: ${project.frameworks.join(', ')}`);
            if (project.packageManager)
                io.log(`  gestor de paquetes: ${project.packageManager}`);
            if (project.buildTool)
                io.log(`  build: ${project.buildTool}`);
            if (project.testFramework)
                io.log(`  tests: ${project.testFramework}`);
            if (project.modules.length > 0)
                io.log(`  módulos (${project.modules.length}): ${project.modules.slice(0, 10).join(', ')}`);
            io.log('');
            io.log(`  ${colors.bold('Evidencia recogida')} (${detected.length}):`);
            for (const item of detected)
                io.log(`    · ${item}`);
            if (deferred.length > 0) {
                io.log('');
                io.log(`  ${colors.bold('Deseado pero no observado')} → va como enmienda propuesta, nunca como hecho:`);
                for (const item of deferred)
                    io.log(`    · ${item}`);
            }
            io.log('');
            io.log(dim('  Principio rector: no mejores la arquitectura durante el descubrimiento. Refleja lo que hay; las mejoras vienen después como cambios gobernados.'));
            io.log('');
            return 0;
        }
        const rendered = renderConstitution(constitution);
        const write = args.includes('--write');
        io.log('');
        io.log(heading(`Constitución reversa — ${project.name}`));
        io.log('');
        io.log(`  principios en vigor: ${principlesInForce(constitution).length} · enmiendas propuestas: ${constitution.amendments.length}`);
        for (const issue of issues) {
            const mark = issue.severity === 'error' ? colors.red('error') : colors.yellow('aviso');
            io.log(`  ${mark} ${issue.id}: ${dim(issue.message)}`);
        }
        io.log('');
        for (const p of constitution.principles) {
            io.log(`  ${colors.bold(p.id)} (${p.level}) — ${p.title}`);
            io.log(`      ${dim(`evidencia: ${(p.evidence ?? []).join('; ')}`)}`);
        }
        if (constitution.amendments.length > 0) {
            io.log('');
            io.log(`  ${colors.bold('Enmiendas propuestas')} (no en vigor):`);
            for (const a of constitution.amendments)
                io.log(`    ${a.id} — ${a.title}`);
        }
        if (write) {
            const steeringDir = path.join(target, '.sdd', 'steering');
            await mkdir(steeringDir, { recursive: true });
            const file = path.join(steeringDir, 'constitution.md');
            await writeFile(file, rendered, 'utf8');
            io.log('');
            io.log(`  ${colors.green('✓')} escrita en ${path.relative(target, file)}`);
            // Round-trip check: the artifact must be readable by the same model that wrote it.
            const roundTrip = parseConstitution(rendered);
            const same = roundTrip.principles.length === constitution.principles.length;
            io.log(`  ${same ? colors.green('✓') : colors.red('✗')} ida y vuelta: ${roundTrip.principles.length}/${constitution.principles.length} principios legibles`);
            const authority = resolveAuthority(constitution, constitution.principles[0]?.id ?? '');
            io.log(`  ${dim(`autoridad citable: ${authority.detail}`)}`);
        }
        else {
            io.log('');
            io.log(dim('  Añade --write para escribirla en .sdd/steering/constitution.md'));
        }
        io.log('');
        return issues.some((i) => i.severity === 'error') ? 1 : 0;
    }
    if (sub === 'impact' || sub === 'contracts' || sub === 'reuse') {
        // These three operate on THIS repository and take the feature name as their positional
        // argument, so the base directory is the repository root — not `target`, which resolves the
        // positional as a path for `survey`/`constitution`.
        const root = await findRepoRoot(cwd);
        const feature = positional[0] ?? (await firstSpec(root));
        if (!feature) {
            io.error(colors.red('No hay especificación sobre la que analizar el cambio.'));
            return 1;
        }
        const specDir = path.join(root, '.sdd', 'specs', feature);
        const deltaRaw = await readIfExists(path.join(specDir, deltaSpecFileName()));
        const delta = deltaRaw === null ? undefined : parseDeltaSpec(deltaRaw);
        if (deltaRaw === null) {
            io.log(dim('  Sin delta.md: el análisis se hace sin el contrato de cambio declarado.'));
        }
        const baseIdx = args.findIndex((a) => a === '--base');
        const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
        const { files: changedFiles, source } = changedFilesFor(root, base);
        io.log('');
        io.log(dim(`  origen del cambio: ${source}`));
        if (changedFiles.length === 0) {
            io.log('');
            io.log(colors.green('Sin cambios que analizar en este origen.'));
            io.log('');
            return 0;
        }
        if (sub === 'impact') {
            const report = await analyzeChangeImpact({
                cwd: root,
                changedFiles,
                ...(delta ? { delta } : {}),
            });
            io.log('');
            io.log(heading(`Impacto del cambio — ${feature} (${changedFiles.length} fichero(s))`));
            io.log('');
            io.log(`  radio de impacto: ${report.blastRadius} fichero(s) alcanzable(s) desde el cambio`);
            if (report.dependents.length > 0) {
                io.log(`  dependientes directos (${report.dependents.length}): ${report.dependents.slice(0, 6).map((d) => d.file).join(', ')}`);
            }
            if (report.apiSurface.length > 0) {
                io.log(`  superficie de API tocada: ${report.apiSurface.map((a) => a.file).join(', ')}`);
            }
            if (report.integrationPoints.length > 0) {
                io.log(`  puntos de integración: ${report.integrationPoints.join(', ')}`);
            }
            io.log('');
            for (const finding of report.findings) {
                const mark = finding.severity === 'error'
                    ? colors.red('error')
                    : finding.severity === 'warning'
                        ? colors.yellow('aviso')
                        : colors.dim('info');
                io.log(`  ${mark.padEnd(18)} ${finding.area.padEnd(14)} ${finding.message}`);
            }
            io.log('');
            io.log(`  ${report.complete ? colors.green(report.detail) : colors.yellow(report.detail)}`);
            io.log('');
            return report.findings.some((f) => f.severity === 'error') ? 1 : 0;
        }
        if (sub === 'contracts') {
            const project = await scanProject(root);
            const set = await extractContracts({
                cwd: root,
                feature,
                changedFiles,
                ...(delta ? { delta } : {}),
                testDirs: project.testDirs,
                ...(project.testFramework ? { testFramework: project.testFramework } : {}),
            });
            const derived = testCommandFor(project.testFramework);
            io.log('');
            io.log(heading(`Contratos de ejecución — ${feature}`));
            io.log('');
            io.log(`  oráculo: ${set.contracts.length} contrato(s) · comando ${derived.command}${derived.derived ? ' (derivado, no verificado)' : ''}`);
            for (const contract of set.contracts.slice(0, 12)) {
                io.log(`    ${contract.source.padEnd(10)} ${contract.test}`);
            }
            if (set.uncoveredChanges.length > 0) {
                io.log('');
                io.log(`  ${colors.yellow('!')} cambios sin cobertura (${set.uncoveredChanges.length}): ${set.uncoveredChanges.slice(0, 8).join(', ')}`);
                io.log(dim('    Un cambio sin contrato no lo protege nadie: es el hueco que este informe hace visible.'));
            }
            io.log('');
            io.log(`  ${set.complete ? colors.green(set.detail) : colors.yellow(set.detail)}`);
            if (args.includes('--write')) {
                const file = path.join(specDir, contractsFileName());
                await writeFile(file, JSON.stringify(set, null, 2) + '\n', 'utf8');
                io.log(`  ${colors.green('✓')} escrito en ${path.relative(root, file)}`);
            }
            if (args.includes('--verify')) {
                io.log('');
                io.log(dim(`  ejecutando ${derived.command}...`));
                const run = spawnSync('bash', ['-c', derived.command], { cwd: root, encoding: 'utf8' });
                const verification = verifyContracts(set, {
                    exitCode: run.status ?? 1,
                    stdout: `${run.stdout ?? ''}\n${run.stderr ?? ''}`,
                });
                io.log(`  ${verification.satisfied ? colors.green(verification.detail) : colors.red(verification.detail)}`);
                if (verification.missing.length > 0) {
                    io.log(`  ${colors.red('!')} contratos declarados que no existen: ${verification.missing.join(', ')}`);
                }
                io.log('');
                return verification.satisfied ? 0 : 1;
            }
            // Two different things live behind `complete: false`: a contract the delta DECLARED that does
            // not exist (fatal — the oracle is missing a protection someone promised) and a changed file no
            // test covers (a hole to report, not a reason to block a legitimate change). Separating them is
            // what makes the CI step meaningful instead of either decorative or unusable.
            const declaredTests = new Set(set.contracts.map((c) => c.test));
            const missingDeclared = (delta?.entries ?? []).flatMap((entry) => (entry.contracts ?? []).filter((declared) => !declaredTests.has(declared)));
            if (missingDeclared.length > 0) {
                io.log('');
                io.log(`  ${colors.red('!')} contratos declarados en la delta que no existen: ${missingDeclared.join(', ')}`);
            }
            io.log('');
            return missingDeclared.length > 0 ? 1 : 0;
        }
        // reuse
        const fromIdx = args.findIndex((a) => a === '--symbols');
        const declared = fromIdx >= 0 ? (args[fromIdx + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : [];
        const derivedFromDelta = delta
            ? delta.entries
                .filter((e) => e.kind === 'ADDED')
                .map((e) => ({ symbol: (e.title.match(/[A-Za-z][A-Za-z0-9_]+/g) ?? []).join(''), reason: e.title }))
                .filter((r) => r.symbol.length > 2)
            : [];
        const requests = declared.length > 0 ? declared.map((symbol) => ({ symbol, reason: 'declarado en la línea de órdenes' })) : derivedFromDelta;
        if (requests.length === 0) {
            io.log('');
            io.log(`  ${colors.yellow('Sin símbolos que comprobar')}: no hay entradas ADDED en la delta ni se pasó --symbols A,B, así que la búsqueda de reutilización NO se ha ejecutado.`);
            io.log('');
            return 0;
        }
        const project = await scanProject(root);
        const report = await findReuseCandidates({
            cwd: root,
            requests,
            sourceDirs: project.sourceDirs,
        });
        io.log('');
        io.log(heading(`Reutilización primero — ${feature}`));
        io.log('');
        io.log(dim(`  ${REUSE_FIRST_RULE.slice(0, 160)}`));
        io.log('');
        if (declared.length === 0) {
            io.log(dim('  símbolos derivados de los títulos de las entradas ADDED (derivación declarada, no verificada)'));
            io.log('');
        }
        for (const candidate of report.candidates) {
            io.log(`    ${candidate.similarity.toFixed(2)} ${candidate.kind.padEnd(12)} ${candidate.symbol}  ${colors.dim(`${candidate.file}:${candidate.line}`)}`);
        }
        if (report.violations.length > 0) {
            io.log('');
            io.log(`  ${colors.red('!')} ya existe algo reutilizable para: ${report.violations.join(', ')}`);
            io.log(dim('    Crear un símbolo nuevo aquí duplicaría lo que ya hay: es el riesgo dominante en brownfield.'));
        }
        io.log('');
        io.log(`  ${report.complete ? colors.green(report.detail) : colors.yellow(report.detail)}`);
        io.log('');
        return report.violations.length > 0 ? 1 : 0;
    }
    io.log(`Subcomando desconocido: ${sub}. Usa: survey | constitution [target] [--write] | impact <feature> [--base <ref>] | contracts <feature> [--write] [--verify] [--base <ref>] | reuse <feature> [--symbols A,B] [--base <ref>]`);
    return 1;
};
