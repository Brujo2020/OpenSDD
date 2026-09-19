/**
 * Reverse-engineered constitution (brownfield objective, §12 of the reference architecture).
 *
 * The first brownfield constitution must be DESCRIPTIVE: the principles the code already obeys, with
 * the current stack declared an established fact. The purpose is narrow and concrete — stop an agent
 * from silently "modernizing" code nobody asked it to modernize. A routinely ignored aspirational
 * governance document is worse than none, because it teaches the team that the file does not matter.
 *
 * So this generator makes one distinction the whole design rests on:
 *
 *   PRESENT AND OBEYED  -> a descriptive principle, which must cite the evidence in the code.
 *   DESIRED BUT ABSENT  -> a proposed amendment, explicitly not in force, with a migration plan to
 *                          be written. Aspiration enters later as an explicit governed amendment.
 *
 * Nothing aspirational is ever emitted as a fact. That is not a stylistic preference: a descriptive
 * principle without evidence is a wish recorded as a fact, and `validateConstitution` rejects it.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const exists = async (p) => (await stat(p).catch(() => null)) !== null;
const firstExisting = async (cwd, candidates) => {
    for (const candidate of candidates) {
        if (await exists(path.join(cwd, candidate)))
            return candidate;
    }
    return undefined;
};
const listDirs = async (cwd, candidates) => {
    const found = [];
    for (const candidate of candidates) {
        if (await exists(path.join(cwd, candidate)))
            found.push(candidate);
    }
    return found;
};
const listFiles = async (cwd, dir, limit = 200) => {
    const out = [];
    const walk = async (current, depth) => {
        if (depth > 4 || out.length >= limit)
            return;
        const entries = await readdir(path.join(cwd, current), { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (out.length >= limit)
                return;
            if (entry.name === 'node_modules' || entry.name === '.git')
                continue;
            const rel = path.join(current, entry.name);
            if (entry.isDirectory())
                await walk(rel, depth + 1);
            else
                out.push(rel);
        }
    };
    if (await exists(path.join(cwd, dir)))
        await walk(dir, 0);
    return out;
};
/** Gather the facts a descriptive constitution needs to cite as evidence. */
export const collectRepoFacts = async (cwd, project) => {
    const lockfile = await firstExisting(cwd, [
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'poetry.lock',
        'requirements.txt.lock',
        'Gemfile.lock',
        'go.sum',
        'Cargo.lock',
        'tools/cc-sdd/package-lock.json',
    ]);
    const migrationDirs = await listDirs(cwd, [
        'migrations',
        'db/migrate',
        'database/migrations',
        'src/migrations',
        'prisma/migrations',
        'alembic/versions',
        'flyway',
        'liquibase',
    ]);
    const rollbackMigrations = [];
    for (const dir of migrationDirs) {
        const files = await listFiles(cwd, dir);
        for (const file of files) {
            // The token is a word inside the file name, not a prefix followed by a dot: matching only
            // `down.` missed `20240101_add_orders_down.sql` and `down_20240101.sql`, which under-reported
            // rollback coverage and made the C-DB-ROLLBACK principle wrong.
            const base = path.basename(file).toLowerCase();
            if (/(^|[._-])(down|rollback|revert)([._-]|$)/.test(base))
                rollbackMigrations.push(file);
        }
    }
    const ciWorkflows = (await listFiles(cwd, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f));
    // Walk the source directories the project scan actually found, not a hardcoded `src`: in a
    // workspace layout the API entry points live in a nested package, and assuming otherwise silently
    // drops the API-compatibility principle from the constitution.
    const apiDirs = project.sourceDirs.length > 0 ? project.sourceDirs : ['src'];
    const publicApiFiles = [];
    for (const dir of apiDirs) {
        const files = await listFiles(cwd, dir, 600);
        for (const file of files) {
            if (/(^|\/)(index|main|mod|api|routes?)\.(ts|js|mjs|py|go|rb|java|rs)$/.test(file))
                publicApiFiles.push(file);
        }
    }
    const configFiles = (await listFiles(cwd, '.', 400)).filter((f) => {
        const looksLikeConfig = /(^|\/)(\.env\.[a-z]+|config\.(ts|js|json|ya?ml)|settings\.(ts|py|json|ya?ml)|application\.(properties|ya?ml))$/.test(f);
        // `.env.example`, `.env.sample` and `.env.template` are documentation, not configuration in
        // force. Counting them as integration points inflates the evidence.
        const isExample = /\.(example|sample|template|dist)$/i.test(f);
        return looksLikeConfig && !isExample;
    });
    return {
        project,
        ...(lockfile ? { lockfile } : {}),
        migrationDirs,
        rollbackMigrations,
        ciWorkflows,
        publicApiFiles,
        configFiles,
    };
};
const amendment = (id, title, proposedBy) => ({
    id,
    title,
    proposedBy,
    status: 'proposed',
});
/**
 * Build the descriptive constitution.
 *
 * `proposedBy` is recorded on every amendment: governance that cannot name who proposes it is not
 * governance, it is text.
 */
export const buildDescriptiveConstitution = (facts, options = {}) => {
    const proposedBy = options.proposedBy ?? 'sdd-getspecs';
    const now = options.generatedAt ?? new Date().toISOString();
    const project = facts.project;
    const principles = [];
    const amendments = [];
    const detected = [];
    const deferred = [];
    // --- what the code already is: facts, with evidence ------------------------------------------
    /** Sentinel values that mean "not observed" — never evidence of anything. */
    const UNKNOWN = new Set(['unknown', '', 'n/a', 'undefined']);
    const observed = (value) => Boolean(value) && !UNKNOWN.has(String(value).toLowerCase());
    const stackParts = [
        ...(observed(project.language) ? [project.language] : []),
        ...project.frameworks,
        ...(observed(project.packageManager) ? [project.packageManager] : []),
        ...(observed(project.buildTool) ? [project.buildTool] : []),
    ].filter(Boolean);
    const stackEvidence = [
        observed(project.packageManager) ? `package manager: ${project.packageManager}` : undefined,
        facts.lockfile ? `lockfile: ${facts.lockfile}` : undefined,
        observed(project.buildTool) ? `build tool: ${project.buildTool}` : undefined,
    ].filter((v) => Boolean(v));
    if (stackParts.length > 0) {
        detected.push(`stack: ${stackParts.join(', ')}`);
        principles.push({
            id: 'C-STACK-FACT',
            title: 'El stack actual es un hecho establecido',
            threatReference: 'modernización silenciosa',
            level: 'MUST',
            restriction: 'No sustituir ni actualizar lenguaje, framework, gestor de paquetes o herramienta de build sin una enmienda gobernada.',
            pattern: 'Construir sobre el stack declarado; toda dependencia nueva se declara en el manifiesto y se justifica en la delta.',
            justification: 'Impide que el agente modernice por su cuenta código que nadie pidió modernizar, que es el modo de fallo dominante al adoptar SDD sobre un sistema en producción.',
            provenance: 'descriptive',
            evidence: stackEvidence.length > 0 ? stackEvidence : [`stack detectado: ${stackParts.join(', ')}`],
        });
    }
    if (facts.publicApiFiles.length > 0) {
        detected.push(`API pública: ${facts.publicApiFiles.length} punto(s) de entrada`);
        principles.push({
            id: 'C-API-COMPAT',
            title: 'Preservar la compatibilidad de la API pública',
            threatReference: 'cambio incompatible',
            level: 'MUST',
            restriction: 'Ninguna exportación, ruta o esquema público se altera de forma incompatible sin una entrada REMOVED o MODIFIED en la delta que declare su migración.',
            pattern: 'Preferir cambios aditivos; marcar como obsoleto antes de retirar; toda retirada viaja con su ruta de migración y sus contratos.',
            justification: 'Los consumidores externos e internos del sistema no están en este repositorio y no se pueden actualizar en el mismo cambio.',
            provenance: 'descriptive',
            evidence: facts.publicApiFiles.slice(0, 8),
        });
    }
    if (project.modules.length > 0 || project.sourceDirs.length > 0) {
        const boundaries = project.modules.length > 0 ? project.modules : project.sourceDirs;
        detected.push(`fronteras: ${boundaries.length} módulo(s)/directorio(s)`);
        principles.push({
            id: 'C-BOUNDARIES',
            title: 'Seguir los límites de servicio existentes',
            // SHOULD, not MUST: crossing a boundary is a legitimate engineering decision as long as the
            // delta declares it. A constitution where every line is MUST stops distinguishing between a
            // rule nobody may break and a rule that may be broken with justification — and stops meaning
            // anything, which the module's own validator warns about.
            level: 'SHOULD',
            restriction: 'Un cambio no cruza una frontera de módulo salvo que la delta declare explícitamente el cruce.',
            pattern: 'Mantener el cambio dentro de los límites declarados por el nodo del DAG de tareas; el cruce se justifica en el análisis de impacto.',
            justification: 'Las fronteras actuales codifican decisiones de arquitectura que siguen vigentes; ignorarlas convierte un cambio acotado en una refactorización involuntaria.',
            provenance: 'descriptive',
            evidence: boundaries.slice(0, 8),
        });
    }
    if (project.testFramework && project.testDirs.length > 0) {
        detected.push(`oráculo de regresión: ${project.testFramework} en ${project.testDirs.join(', ')}`);
        principles.push({
            id: 'C-REGRESSION-ORACLE',
            title: 'Los tests existentes son el oráculo de regresión',
            // A MUST must name the threat it prevents, or it is an arbitrary rule (CSDD §3.2). Here the
            // threat is a silent behaviour change that no test would catch.
            threatReference: 'cambio de comportamiento silencioso',
            level: 'MUST',
            restriction: 'Un comportamiento con cobertura no puede cambiar sin que sus contratos sigan pasando o se actualicen de forma explícita.',
            pattern: 'Toda entrada MODIFIED o REMOVED declara los contratos que cubren el comportamiento afectado; el pipeline los ejecuta.',
            justification: 'En brownfield el primer uso de la especificación extraída no es documentar sino proteger lo que no debe cambiar.',
            provenance: 'descriptive',
            evidence: [`${project.testFramework}`, ...project.testDirs.slice(0, 4)],
        });
    }
    else {
        deferred.push('oráculo de regresión (no se detectaron tests)');
        amendments.push(amendment('AMD-REGRESSION-ORACLE', 'Establecer un oráculo de regresión ejecutable', proposedBy));
    }
    if (facts.migrationDirs.length > 0 && facts.rollbackMigrations.length > 0) {
        detected.push(`migraciones con rollback: ${facts.rollbackMigrations.length}`);
        principles.push({
            id: 'C-DB-ROLLBACK',
            title: 'Toda migración de base de datos incluye plan de rollback',
            level: 'MUST',
            restriction: 'Ninguna migración se admite sin su contraparte de reversión.',
            pattern: 'Añadir el fichero down/rollback junto a la migración y verificar que se aplica.',
            justification: 'Una migración sin reversión convierte un fallo de despliegue en una pérdida de datos.',
            provenance: 'descriptive',
            evidence: [...facts.migrationDirs, ...facts.rollbackMigrations.slice(0, 4)],
        });
    }
    else if (facts.migrationDirs.length > 0) {
        deferred.push('rollback en migraciones (hay migraciones, no se detectó contraparte down/rollback)');
        amendments.push(amendment('AMD-DB-ROLLBACK', 'Exigir plan de rollback en toda migración', proposedBy));
    }
    if (facts.ciWorkflows.length > 0) {
        detected.push(`CI: ${facts.ciWorkflows.length} workflow(s)`);
    }
    // --- what is desired but not observed: amendments, never facts --------------------------------
    deferred.push('política de reutilización primero (práctica, no un hecho del código)');
    amendments.push(amendment('AMD-REUSE-FIRST', 'Política de reutilización primero al crear símbolos nuevos', proposedBy));
    deferred.push('documentación incremental: la cobertura crece donde se toca el código');
    amendments.push(amendment('AMD-INCREMENTAL-DOCS', 'Cobertura de especificación creciente en el punto de cambio', proposedBy));
    const constitution = {
        project: project.name,
        provenance: 'descriptive',
        generatedAt: now,
        establishedFacts: [
            ...(observed(project.language) ? [`Lenguaje: ${project.language}`] : []),
            ...(project.frameworks.length > 0 ? [`Frameworks: ${project.frameworks.join(', ')}`] : []),
            ...(project.packageManager ? [`Gestor de paquetes: ${project.packageManager}`] : []),
            ...(project.buildTool ? [`Build: ${project.buildTool}`] : []),
            ...(project.testFramework ? [`Tests: ${project.testFramework}`] : []),
            ...(facts.lockfile ? [`Dependencias fijadas por ${facts.lockfile}`] : []),
        ],
        principles,
        amendments,
    };
    return { constitution, detected, deferred };
};
