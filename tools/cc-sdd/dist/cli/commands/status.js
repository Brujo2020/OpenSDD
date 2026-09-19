/**
 * `open-sdd status` — la superficie de consola del panel único.
 *
 * Dos decisiones que la forma del comando hace explícitas:
 *
 *  1. El panel se pinta TONO A TONO. `renderStatus` devuelve texto plano, una entrada por línea, y
 *     aquí se colorea con `report.lines[i].tone`. Nada de ANSI en el core: el JSON queda limpio y el
 *     renderizador es testeable sin despojar códigos de escape.
 *  2. `--check` es el GATE del pivote constitucional. El panel informa; `--check` valida la spec
 *     CONTRA la constitución y devuelve 1 ante cualquier hallazgo de error — incluido «no se pudo
 *     validar», porque no poder inspeccionar no es aprobar.
 *
 * ── Compatibilidad heredada (documentada, no silenciosa) ────────────────────────────────────────
 * `test/cliSubcommands.test.ts` fija dos contratos anteriores que este comando conserva:
 *   · `status --json` SIN feature sigue devolviendo la lista de estados por spec (un array con
 *     `name`), no el `StatusReport`. `status <feature> --json` sí devuelve el `StatusReport`, que es
 *     la forma máquina-legible del panel.
 *   · `status <feature>` conserva los tokens `Specification:` y `Phase:` en la línea de la spec.
 * Nota de idioma: el resto de los textos visibles son español; esos dos tokens se mantienen porque
 * un test ya instalado los exige.
 */
import { colors } from '../ui/colors.js';
import { getSpecStatus, listSpecs, resolveSddDir } from '../../core/specManager.js';
import { alignFeature, buildStatus, renderStatus, worstTone, } from '../../core/status.js';
const TONE_PAINT = {
    ok: colors.green,
    warn: colors.yellow,
    err: colors.red,
    dim: colors.dim,
};
/** Cabecera de sección: `value` vacío. El contenido se colorea por su tono. */
const paint = (text, line) => line.value ? TONE_PAINT[line.tone](text) : colors.bold(colors.cyan(text));
/** Ejecutar el pivote. No poder ejecutarlo es un fallo (1): no se declara aprobado lo no inspeccionado. */
const runPivot = async (cwd, feature, sddDir) => {
    const outcome = await alignFeature(cwd, {
        ...(feature ? { feature } : {}),
        ...(sddDir ? { sddDir } : {}),
    });
    if (!outcome.alignment) {
        return { alignment: null, error: outcome.error ?? 'el pivote no se pudo ejecutar', exitCode: 1 };
    }
    const errors = outcome.alignment.findings.filter((finding) => finding.severity === 'error').length;
    return { alignment: outcome.alignment, exitCode: errors > 0 ? 1 : 0 };
};
/**
 * Compatibilidad: la lista por spec que `status --json` (sin feature) devolvía antes del panel.
 * Se mantiene tal cual para no romper a quien la consume por máquina.
 */
const legacySpecList = async (cwd, sddDir) => {
    const dir = sddDir ?? (await resolveSddDir(cwd));
    const specs = await listSpecs(cwd, dir);
    return Promise.all(specs.map((feature) => getSpecStatus(cwd, feature, dir)));
};
export const handleStatusCommand = async (args, io, cwd = process.cwd()) => {
    const isJson = args.includes('--json');
    const isCheck = args.includes('--check');
    const isQuiet = args.includes('--quiet');
    const sddArg = args.find((arg) => arg.startsWith('--sdd-dir='));
    const sddDir = sddArg ? sddArg.slice('--sdd-dir='.length) : undefined;
    const feature = args.find((arg) => !arg.startsWith('-'));
    if (isJson && !feature && !isCheck) {
        io.log(JSON.stringify(await legacySpecList(cwd, sddDir), null, 2));
        return 0;
    }
    const report = await buildStatus(cwd, {
        ...(feature ? { feature } : {}),
        ...(sddDir ? { sddDir } : {}),
    });
    const rendered = renderStatus(report);
    const hasErrorLine = report.lines.some((line) => line.tone === 'err');
    // ── Guion: una sola línea, para scripts ─────────────────────────────────────────────────────
    if (isQuiet) {
        const worst = worstTone(report.lines.map((line) => line.tone)) ?? 'dim';
        io.log(`${report.level} · ${worst} · ${report.nextAction ?? 'sin acción determinada'}`);
        return hasErrorLine ? 1 : 0;
    }
    // ── JSON: el StatusReport (con el pivote añadido si se pidió --check) ───────────────────────
    if (isJson) {
        if (!isCheck) {
            io.log(JSON.stringify(report, null, 2));
            return hasErrorLine ? 1 : 0;
        }
        const pivot = await runPivot(cwd, feature, sddDir);
        io.log(JSON.stringify(pivot.alignment
            ? { ...report, alignment: pivot.alignment, checkExitCode: pivot.exitCode }
            : { ...report, alignmentError: pivot.error ?? 'el pivote no se pudo ejecutar', checkExitCode: pivot.exitCode }, null, 2));
        return hasErrorLine || pivot.exitCode !== 0 ? 1 : 0;
    }
    // ── Panel ───────────────────────────────────────────────────────────────────────────────────
    io.log('');
    rendered.forEach((text, index) => io.log(paint(text, report.lines[index])));
    let exitCode = hasErrorLine ? 1 : 0;
    if (isCheck) {
        const pivot = await runPivot(cwd, feature, sddDir);
        io.log('');
        io.log(colors.bold(colors.cyan('Validación constitucional (--check)')));
        if (!pivot.alignment) {
            io.log(`  ${colors.red('✗')} ${pivot.error ?? 'el pivote no se pudo ejecutar'}`);
            exitCode = 1;
        }
        else {
            const alignment = pivot.alignment;
            if (alignment.findings.length === 0) {
                io.log(`  ${colors.green('✓')} ${alignment.detail.split(';')[0]}: sin hallazgos.`);
            }
            for (const finding of alignment.findings) {
                const mark = finding.severity === 'error' ? colors.red('error') : finding.severity === 'warning' ? colors.yellow('aviso') : colors.dim('info');
                const where = [finding.principleId, finding.artifactId].filter(Boolean).join(' → ');
                io.log(`  ${mark.padEnd(18)} ${finding.code.padEnd(22)} ${where}`);
                io.log(`      ${colors.dim(finding.message)}`);
            }
            io.log(`  ${colors.dim(alignment.detail)}`);
            if (alignment.findings.some((finding) => finding.severity === 'error'))
                exitCode = 1;
        }
    }
    io.log('');
    return exitCode;
};
