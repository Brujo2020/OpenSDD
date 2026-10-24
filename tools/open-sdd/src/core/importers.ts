/**
 * Absorb spec-kit: an import plan for `.specify/` and `specs/`.
 *
 * A conversion here is a MAPPING, never a promise of equivalence. spec-kit's `spec.md` is not our
 * EARS-checked `requirements.md`, so the banner says so. Every artifact we cannot map becomes an
 * explicit `skip` with its reason, and `applyImport` never overwrites an existing file.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { planAidlcImport } from './aidlc.js';
import { parseConstitution, validateConstitution } from './constitution.js';
import { TRIAD } from './triad.js';

export type ImportSource = 'spec-kit' | 'aidlc';

export interface ImportFound {
  kind: string;
  path: string;
}

export interface ImportConversion {
  from: string;
  to: string;
  action: 'copy' | 'convert' | 'skip';
  reason: string;
  /** Pre-rendered payload for conversions that are generated, not copied (AI-DLC). */
  content?: string;
}

export interface ImportPlan {
  source: ImportSource;
  found: ImportFound[];
  conversions: ImportConversion[];
  warnings: string[];
  complete: boolean;
  detail: string;
}

export interface ImportOutcome {
  written: string[];
  skipped: string[];
  detail: string;
}

/** Where an import lands. */
export const IMPORT_TARGET_SDD_DIR = '.sdd';

export const IMPORT_SOURCES: ImportSource[] = ['spec-kit', 'aidlc'];

const posix = (p: string): string => p.split(path.sep).join('/');

const exists = async (p: string): Promise<boolean> => (await stat(p).catch(() => null)) !== null;

const readIfExists = async (p: string): Promise<string | null> => readFile(p, 'utf8').catch(() => null);

const listEntries = async (dir: string): Promise<{ name: string; dir: boolean }[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, dir: entry.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const copy = (from: string, to: string, reason: string): ImportConversion => ({
  from,
  to,
  action: 'copy',
  reason,
});

const convert = (from: string, to: string, reason: string): ImportConversion => ({
  from,
  to,
  action: 'convert',
  reason,
});

const skip = (from: string, reason: string): ImportConversion => ({
  from,
  to: '',
  action: 'skip',
  reason,
});

/** The triad's declared alias for `plan.md`, read from the single source of truth instead of prose. */
const planAliases = (): string[] => TRIAD.find((file) => file.canonical === 'plan.md')?.aliases ?? [];

const DESIGN_ALIAS_NOTE = (): string => {
  const aliases = planAliases();
  return aliases.length > 0
    ? `\`design.md\` es alias declarado de \`plan.md\` en \`triad.ts\` (${aliases.join(', ')}); se normaliza al nombre canónico y el contenido se copia tal cual.`
    : 'Se normaliza al nombre canónico `plan.md`; el contenido se copia tal cual.';
};

/** The banner a semantically-mapped document carries: a mapping, not a conversion. */
const provenanceBanner = (from: string, extra: string): string =>
  [
    `<!-- Importado por steelforge desde ${from}.`,
    `     Es un MAPEO de formato, no una conversión semántica: el contenido NO está en EARS ni`,
    `     validado como requisitos. ${extra}`,
    `     Revísalo y ejecútalo por la validación correspondiente antes de aprobarlo. -->`,
    '',
    '',
  ].join('\n');

// ---------------------------------------------------------------------------------------------
// spec-kit
// ---------------------------------------------------------------------------------------------

const SPECKIT_AUX = ['plan.md', 'tasks.md', 'research.md', 'data-model.md', 'quickstart.md'];

const planSpecKitSpec = async (
  cwd: string,
  specsRoot: string,
  feature: string,
  conversions: ImportConversion[],
): Promise<void> => {
  const featureRoot = posix(path.join(specsRoot, feature));
  const files = await listEntries(path.join(cwd, featureRoot));
  const names = new Set(files.filter((entry) => !entry.dir).map((entry) => entry.name));

  if (names.has('spec.md')) {
    conversions.push(
      convert(
        posix(path.join(featureRoot, 'spec.md')),
        posix(path.join(IMPORT_TARGET_SDD_DIR, 'specs', feature, 'requirements.md')),
        '`spec.md` de spec-kit ocupa el rol de requisitos; se importa como `requirements.md` con una banda de procedencia porque NO es EARS y nadie lo ha validado como tal.',
      ),
    );
  }
  for (const name of SPECKIT_AUX) {
    if (!names.has(name)) continue;
    conversions.push(
      copy(
        posix(path.join(featureRoot, name)),
        posix(path.join(IMPORT_TARGET_SDD_DIR, 'specs', feature, name)),
        'Documento auxiliar del mismo rol; se copia tal cual.',
      ),
    );
  }
  if (files.some((entry) => entry.dir && entry.name === 'contracts')) {
    const contractsRoot = posix(path.join(featureRoot, 'contracts'));
    for (const entry of await listEntries(path.join(cwd, contractsRoot))) {
      conversions.push(
        copy(
          posix(path.join(contractsRoot, entry.name)),
          posix(path.join(IMPORT_TARGET_SDD_DIR, 'specs', feature, 'contracts', entry.name)),
          'Contrato de spec-kit: mismo rol (interfaz ejecutable de la spec).',
        ),
      );
    }
  }
  for (const entry of files) {
    if (entry.dir) {
      if (entry.name !== 'contracts') {
        conversions.push(
          skip(posix(path.join(featureRoot, entry.name)), 'Directorio no reconocido por open-sdd: no se importa a ciegas.'),
        );
      }
      continue;
    }
    if (entry.name === 'spec.md' || SPECKIT_AUX.includes(entry.name)) continue;
    conversions.push(
      skip(posix(path.join(featureRoot, entry.name)), 'Documento de spec-kit sin equivalente declarado en la tríada ni en los auxiliares conocidos.'),
    );
  }
};

const planSpecKit = async (cwd: string): Promise<ImportPlan> => {
  const found: ImportFound[] = [];
  const conversions: ImportConversion[] = [];
  const warnings: string[] = [];

  // Constitution: imported verbatim, with the validator's findings reported and never "fixed".
  const constitutionFrom = '.specify/memory/constitution.md';
  if (await exists(path.join(cwd, constitutionFrom))) {
    found.push({ kind: 'constitution', path: constitutionFrom });
    const content = (await readIfExists(path.join(cwd, constitutionFrom))) ?? '';
    const parsed = parseConstitution(content);
    const issues = validateConstitution(parsed);
    conversions.push(
      convert(
        constitutionFrom,
        posix(path.join(IMPORT_TARGET_SDD_DIR, 'steering', 'constitution.md')),
        'Misma autoridad (constitución del proyecto). Se copia VERBATIM: steelforge no «arregla» una constitución ajena, solo reporta lo que su validador encuentra.',
      ),
    );
    if (parsed.principles.length === 0) {
      warnings.push(
        'La constitución de spec-kit no expone ningún principio con la anatomía de steelforge (id citable, nivel, restricción, patrón, justificación): se importa verbatim y debe reescribirse a mano antes de que un veredicto bloqueante pueda citarla.',
      );
    }
    for (const issue of issues) {
      warnings.push(
        `validateConstitution [${issue.severity}${issue.code ? ` ${issue.code}` : ''}] ${issue.id}: ${issue.message}`,
      );
    }
    if (issues.length === 0 && parsed.principles.length > 0) {
      warnings.push(
        `validateConstitution no encontró problemas en ${parsed.principles.length} principio(s), pero la importación sigue siendo un MAPEO: el contenido no se ha revisado por una persona.`,
      );
    }
  }

  // Specs: `.specify/specs/**` and, when present, a root `specs/**`.
  const specsRoots = ['.specify/specs', 'specs'];
  const seenFeatures = new Set<string>();
  for (const specsRoot of specsRoots) {
    if (!(await exists(path.join(cwd, specsRoot)))) continue;
    found.push({ kind: 'specs', path: specsRoot });
    const features = (await listEntries(path.join(cwd, specsRoot))).filter((entry) => entry.dir);
    for (const feature of features) {
      if (seenFeatures.has(feature.name)) {
        warnings.push(
          `La feature "${feature.name}" aparece en más de una raíz de specs: solo se planifica una vez; revisa cuál es la vigente.`,
        );
        continue;
      }
      seenFeatures.add(feature.name);
      found.push({ kind: 'spec', path: posix(path.join(specsRoot, feature.name)) });
      await planSpecKitSpec(cwd, specsRoot, feature.name, conversions);
    }
  }
  if (specsRoots.every((root) => !found.some((item) => item.path === root))) {
    warnings.push('No se observó ningún directorio de specs de spec-kit (`.specify/specs/` ni `specs/`).');
  }

  // Templates and scripts: ours are different by design.
  for (const dir of ['.specify/templates', '.specify/scripts']) {
    if (!(await exists(path.join(cwd, dir)))) continue;
    found.push({ kind: dir.includes('templates') ? 'templates' : 'scripts', path: dir });
    conversions.push(
      skip(
        dir,
        dir.includes('templates')
          ? 'Las plantillas de steelforge son distintas por diseño (tríada, delta, constitución): importar las de spec-kit produciría documentos que nuestros gates no reconocen.'
          : 'Los scripts de spec-kit ejecutan su flujo, no el nuestro; no hay equivalencia.',
      ),
    );
  }

  // Other memory documents have no declared role in our steering set.
  if (await exists(path.join(cwd, '.specify/memory'))) {
    for (const entry of await listEntries(path.join(cwd, '.specify/memory'))) {
      if (entry.name === 'constitution.md' || entry.dir) continue;
      conversions.push(
        skip(
          posix(path.join('.specify/memory', entry.name)),
          'Documento de memoria de spec-kit sin rol declarado en el steering de open-sdd.',
        ),
      );
    }
  }

  const skipped = conversions.filter((item) => item.action === 'skip');
  const complete = found.length > 0 && skipped.length === 0 && warnings.length === 0;
  const detail =
    found.length === 0
      ? 'No se observó ningún artefacto de spec-kit (ni `.specify/`, ni `specs/`).'
      : [
          `${found.length} artefacto(s) de spec-kit reconocidos, ${conversions.length - skipped.length} conversión(es) y ${skipped.length} omisión(es).`,
          'La conversión de `spec.md` a `requirements.md` es un MAPEO de formato: el contenido no está en EARS ni validado.',
          skipped.length > 0
            ? `NO se convierte: ${skipped.map((item) => item.from).join(', ')}. Plantillas y scripts se omiten a propósito.`
            : 'Todo lo reconocido tiene una conversión.',
          warnings.length > 0 ? `${warnings.length} advertencia(s), incluida la validación de la constitución.` : '',
        ]
          .filter((part) => part.length > 0)
          .join(' ');

  return { source: 'spec-kit', found, conversions, warnings, complete, detail };
};

// ---------------------------------------------------------------------------------------------
// Detection and planning entry points
// ---------------------------------------------------------------------------------------------

const hasSpecKitEvidence = async (cwd: string): Promise<boolean> => {
  if (await exists(path.join(cwd, '.specify'))) return true;
  const rootSpecs = path.join(cwd, 'specs');
  if (!(await exists(rootSpecs))) return false;
  const features = (await listEntries(rootSpecs)).filter((entry) => entry.dir);
  for (const feature of features) {
    if (await exists(path.join(rootSpecs, feature.name, 'spec.md'))) return true;
  }
  return false;
};


/**
 * Build the import plan(s). With an explicit `source`, exactly one plan comes back even when
 * nothing was found — the CLI has to be able to say "nothing to import". Without it, only sources
 * with evidence produce a plan; an empty array means no incumbent was observed.
 */
const planAidlc = async (cwd: string): Promise<ImportPlan> => {
  const { found, conversions, warnings } = await planAidlcImport(cwd);
  return {
    source: 'aidlc',
    found: found ? [{ kind: 'aidlc-intent', path: found }] : [],
    conversions,
    warnings,
    complete: found !== null,
    detail: found ? `${conversions.filter((c) => c.action !== 'skip').length} conversion(s) from ${found}` : 'no AI-DLC intent record under aidlc/spaces/*/intents/',
  };
};

export const planImport = async (cwd: string, source?: ImportSource): Promise<ImportPlan[]> => {
  if (source === 'aidlc') return [await planAidlc(cwd)];
  if (source !== undefined) return [await planSpecKit(cwd)];
  const plans: ImportPlan[] = [];
  if (await hasSpecKitEvidence(cwd)) plans.push(await planSpecKit(cwd));
  const aidlc = await planAidlc(cwd);
  if (aidlc.found.length) plans.push(aidlc);
  return plans;
};

/**
 * Apply a plan. Without `write` nothing happens at all; with it, every existing target is refused
 * and reported, so a second run is a no-op instead of a destructive one.
 */
export const applyImport = async (
  cwd: string,
  plan: ImportPlan,
  opts: { write?: boolean },
): Promise<ImportOutcome> => {
  if (opts.write !== true) {
    return {
      written: [],
      skipped: [],
      detail: 'Sin --write no se escribió nada: el plan enumera las conversiones y sus motivos.',
    };
  }

  const written: string[] = [];
  const skipped: string[] = [];

  for (const conversion of plan.conversions) {
    if (conversion.action === 'skip') {
      skipped.push(`${conversion.from} — ${conversion.reason}`);
      continue;
    }

    const source = path.join(cwd, conversion.from);
    const target = path.join(cwd, conversion.to);

    if (await exists(target)) {
      skipped.push(`${conversion.to} — ya existe: steelforge NUNCA sobrescribe en una importación.`);
      continue;
    }

    const content = conversion.content ?? (await readIfExists(source));
    if (content === null) {
      skipped.push(`${conversion.from} — no se pudo leer el origen; no se escribe nada.`);
      continue;
    }

    const payload = conversion.content !== undefined
      ? conversion.content
      : conversion.from.endsWith('spec.md') && conversion.to.endsWith('requirements.md')
        ? provenanceBanner(
            conversion.from,
            'spec-kit escribe escenarios de usuario y requisitos funcionales, no la sintaxis EARS.',
          ) + content
        : content;

    try {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, payload, 'utf8');
      written.push(conversion.to);
    } catch (error) {
      skipped.push(`${conversion.to} — no se pudo escribir (${(error as Error).message}).`);
    }
  }

  const notConverted = plan.conversions.filter((conversion) => conversion.action === 'skip');
  const detail = [
    `${written.length} fichero(s) escrito(s), ${skipped.length} omitido(s) de ${plan.conversions.length} conversión(es) planificada(s).`,
    'Ningún fichero existente se ha sobrescrito.',
    notConverted.length > 0
      ? `NO convertido: ${notConverted.map((conversion) => conversion.from).join(', ')}.`
      : 'Todo lo planificado se escribió; el mapeo no garantiza equivalencia semántica.',
    plan.warnings.length > 0 ? `${plan.warnings.length} advertencia(s) siguen pendientes de revisión humana.` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ');

  return { written, skipped, detail };
};
