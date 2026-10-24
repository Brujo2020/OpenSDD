/**
 * Exigencia de validación por tarea, decidida por reglas (sin modelo).
 *
 * Cada tarea parte de `unit`. Una regla que encaja con la tarea (por el texto de los requisitos que
 * cita, por los ficheros de su `_Boundary:_` o por palabras de su título) AÑADE clases de prueba y,
 * opcionalmente, una cobertura mínima. Las reglas solo suben la exigencia: nunca la bajan, y el
 * resultado no depende del orden en que se escriben.
 *
 * Cada decisión guarda la regla, el texto que la disparó, el principio de la constitución que cita y
 * su motivo: es lo que un auditor pregunta («¿por qué esta tarea exigió pruebas de contrato?»).
 *
 * La tarea demuestra cada clase con una etiqueta en su evidencia: `_Evidence:_ [unit] [integration]
 * npm test → 48 passed · [review: Ana Pérez] · [coverage 92%]`. Una tarea marcada como hecha a la que le
 * falta una clase exigida es un hallazgo; bloquea según la severidad de la regla.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseTasksMarkdown } from './specManager.js';
import { loadFeatureTrace } from './trace.js';

export const VALIDATION_KINDS = [
  'unit',
  'integration',
  'contract',
  'e2e',
  'property',
  'mutation',
  'security-scan',
  'performance',
  'independent-review',
] as const;
export type ValidationKind = (typeof VALIDATION_KINDS)[number];

export interface ValidationRule {
  id: string;
  /** Al menos un criterio; varios criterios en la misma regla se combinan con O. */
  when: { requirementText?: string; paths?: string; taskText?: string };
  require: ValidationKind[];
  minCoverage?: number;
  /** Id del principio de la constitución en el que se apoya la regla (lo que cita la auditoría). */
  principle?: string;
  severity: 'block' | 'warn';
  rationale: string;
}

export interface ValidationRuleSet {
  schema: 'open-sdd.validation-rules/1';
  rules: ValidationRule[];
}

/**
 * Reglas de partida para los riesgos que más se repiten (dinero, datos personales, acceso…). No son una norma: cada
 * organización las sustituye o amplía en `.sdd/settings/validation-rules.json` (mismo id = reemplaza).
 */
export const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'VR-MONEY',
    // Verbos y objetos de MOVER dinero, no cualquier mención: «avisar de una transferencia» no mueve saldo.
    when: { requirementText: '\\b(debit\\w*|credit(?:s|ed|ing)? (?:the|an?|to)\\b|debita\\w*|acredita\\w*|cargo|abono|refund\\w*|reembols\\w*|ledger|libro mayor|balance|saldo|amount|monto|importe|charge[sd]? (?:the|a)|cobra\\w*|pay(?:s|ment)? (?:out|the)|transfer (?:funds|money|the amount)|transferir (?:fondos|dinero|el monto))\\b' },
    require: ['integration', 'contract', 'property', 'independent-review'],
    minCoverage: 0.9,
    severity: 'block',
    rationale: 'Mover dinero exige probar invariantes (no se crea ni se pierde saldo), el contrato con los sistemas vecinos y una revisión independiente.',
  },
  {
    id: 'VR-PII',
    when: { requirementText: '\\b(personal data|datos personales|pii|rut|dni|pasaporte|passport|card number|tarjeta|email|correo|tel[eé]fono|phone)\\b' },
    require: ['integration', 'security-scan'],
    severity: 'block',
    rationale: 'Datos personales: se prueba el flujo real y se escanea que no se filtren a logs, respuestas ni terceros.',
  },
  {
    id: 'VR-AUTH',
    when: {
      requirementText: '\\b(auth\\w*|login|password|contraseña|token|session|sesi[oó]n|permiso\\w*|permission\\w*|role|rol(?:es)?|mfa|2fa)\\b',
      paths: '(^|/)(auth|security|iam|login)(/|\\.)',
    },
    require: ['integration', 'security-scan', 'independent-review'],
    severity: 'block',
    rationale: 'Autenticación y autorización: un fallo es una brecha, no un bug; se prueba integrado, se escanea y lo revisa otra persona.',
  },
  {
    id: 'VR-PUBLIC-API',
    when: { paths: '(^|/)(api|routes?|controllers?|handlers?|openapi|graphql)(/|\\.)' },
    require: ['contract'],
    severity: 'warn',
    rationale: 'Una interfaz pública rompe a sus consumidores sin avisar: el contrato se prueba.',
  },
  {
    id: 'VR-LATENCY',
    when: { requirementText: '\\b(within|en menos de|in under|p9[59]|latency|latencia)\\b[^.]*\\d+\\s*(ms|s|seconds?|segundos?)\\b' },
    require: ['performance'],
    severity: 'warn',
    rationale: 'Un requisito con un límite de tiempo solo se cumple si se mide.',
  },
  {
    id: 'VR-MIGRATION',
    when: { taskText: '\\b(migra\\w*|cut-?over|backfill|data migration)\\b', paths: '(^|/)(migrations?|db/migrate)(/|\\.)' },
    require: ['integration', 'e2e'],
    severity: 'block',
    rationale: 'Una migración de datos se ensaya de punta a punta antes de tocar producción.',
  },
];

export const validationRulesFile = (cwd: string, sddDir = '.sdd'): string => path.join(cwd, sddDir, 'settings', 'validation-rules.json');

/** Reglas efectivas: las de partida y, encima, las del proyecto (mismo id reemplaza). */
export const loadValidationRules = async (
  cwd: string,
  sddDir = '.sdd',
): Promise<{ rules: ValidationRule[]; source: 'default' | 'project'; errors: string[] }> => {
  const raw = await readFile(validationRulesFile(cwd, sddDir), 'utf8').catch(() => null);
  if (raw === null) return { rules: DEFAULT_VALIDATION_RULES, source: 'default', errors: [] };
  const errors: string[] = [];
  let parsed: Partial<ValidationRuleSet>;
  try {
    parsed = JSON.parse(raw) as Partial<ValidationRuleSet>;
  } catch (error) {
    return { rules: DEFAULT_VALIDATION_RULES, source: 'default', errors: [`validation-rules.json no es JSON válido: ${(error as Error).message}`] };
  }
  if (parsed.schema !== 'open-sdd.validation-rules/1') errors.push('schema debe ser "open-sdd.validation-rules/1"');
  const project = Array.isArray(parsed.rules) ? parsed.rules : [];
  for (const rule of project) {
    if (!rule.id) errors.push('una regla no tiene id');
    if (!rule.rationale) errors.push(`${rule.id}: falta rationale (una exigencia sin motivo no es auditable)`);
    for (const kind of rule.require ?? []) if (!(VALIDATION_KINDS as readonly string[]).includes(kind)) errors.push(`${rule.id}: clase de prueba desconocida «${kind}»`);
    for (const re of Object.values(rule.when ?? {})) {
      try {
        new RegExp(re as string, 'i');
      } catch {
        errors.push(`${rule.id}: expresión inválida «${re}»`);
      }
    }
  }
  const byId = new Map(DEFAULT_VALIDATION_RULES.map((rule) => [rule.id, rule]));
  for (const rule of project) if (rule.id) byId.set(rule.id, { ...rule, severity: rule.severity ?? 'warn' } as ValidationRule);
  return { rules: [...byId.values()], source: 'project', errors };
};

export interface RuleMatch {
  rule: string;
  /** Qué disparó la regla: el trozo literal y dónde estaba. */
  matched: string;
  require: ValidationKind[];
  minCoverage?: number;
  principle?: string;
  severity: 'block' | 'warn';
  rationale: string;
}

export interface TaskValidation {
  task: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  requirements: string[];
  required: ValidationKind[];
  minCoverage: number | null;
  matches: RuleMatch[];
  /** Clases demostradas en `_Evidence:_` con `[clase]`. */
  shown: ValidationKind[];
  coverage: number | null;
  reviewer: string | null;
  missing: ValidationKind[];
  coverageShort: boolean;
  /** Bloquea: tarea hecha a la que le falta algo exigido por una regla `block`. */
  blocking: boolean;
}

const firstMatch = (pattern: string | undefined, text: string): string | null => {
  if (!pattern) return null;
  const m = text.match(new RegExp(pattern, 'i'));
  return m ? m[0] : null;
};

/** Lee las etiquetas de evidencia: `[unit]`, `[review: Ana]`, `[coverage 92%]`. */
export const parseEvidenceTags = (evidence: string): { shown: ValidationKind[]; coverage: number | null; reviewer: string | null } => {
  const shown = new Set<ValidationKind>();
  let coverage: number | null = null;
  let reviewer: string | null = null;
  for (const m of evidence.matchAll(/\[([^\]]+)\]/g)) {
    const tag = m[1].trim();
    const review = tag.match(/^(?:review|revisi[oó]n|independent-review)\s*:\s*(.+)$/i);
    if (review) {
      shown.add('independent-review');
      reviewer = review[1].trim();
      continue;
    }
    const cov = tag.match(/^(?:coverage|cobertura)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%$/i);
    if (cov) {
      coverage = Number(cov[1]) / 100;
      continue;
    }
    const kind = tag.toLowerCase();
    if ((VALIDATION_KINDS as readonly string[]).includes(kind)) shown.add(kind as ValidationKind);
  }
  return { shown: [...shown], coverage, reviewer };
};

/** Pura: mismas reglas, requisitos y tareas → mismo plan. */
export const planValidation = (input: {
  rules: ValidationRule[];
  requirements: { id: string; title: string; statements: string[] }[];
  tasks: { id: string; title: string; status: TaskValidation['status']; requirements: string[]; boundary: string[]; evidence: string[] }[];
}): TaskValidation[] =>
  input.tasks.map((task) => {
    const reqText = input.requirements
      .filter((req) => task.requirements.includes(req.id))
      .map((req) => `${req.id} ${req.title}. ${req.statements.join(' ')}`)
      .join('\n');
    const matches: RuleMatch[] = [];
    for (const rule of [...input.rules].sort((a, b) => a.id.localeCompare(b.id))) {
      const hit =
        (() => {
          const m = firstMatch(rule.when.requirementText, reqText);
          return m ? `requisito: «${m}»` : null;
        })() ??
        (() => {
          for (const file of task.boundary) {
            const m = firstMatch(rule.when.paths, file);
            if (m) return `ruta: ${file}`;
          }
          return null;
        })() ??
        (() => {
          const m = firstMatch(rule.when.taskText, task.title);
          return m ? `tarea: «${m}»` : null;
        })();
      if (hit) {
        matches.push({
          rule: rule.id,
          matched: hit,
          require: rule.require,
          ...(rule.minCoverage !== undefined ? { minCoverage: rule.minCoverage } : {}),
          ...(rule.principle ? { principle: rule.principle } : {}),
          severity: rule.severity,
          rationale: rule.rationale,
        });
      }
    }
    const required = VALIDATION_KINDS.filter((kind) => kind === 'unit' || matches.some((m) => m.require.includes(kind)));
    const coverages = matches.map((m) => m.minCoverage).filter((c): c is number => typeof c === 'number');
    const minCoverage = coverages.length ? Math.max(...coverages) : null;
    const tags = parseEvidenceTags(task.evidence.join(' '));
    const missing = required.filter((kind) => !tags.shown.includes(kind));
    const coverageShort = minCoverage !== null && (tags.coverage === null || tags.coverage < minCoverage);
    const blockingKinds = new Set(matches.filter((m) => m.severity === 'block').flatMap((m) => m.require));
    const blockingCoverage = matches.some((m) => m.severity === 'block' && m.minCoverage !== undefined);
    const blocking =
      task.status === 'completed' && (missing.some((kind) => kind === 'unit' || blockingKinds.has(kind)) || (coverageShort && blockingCoverage));
    return {
      task: task.id,
      title: task.title,
      status: task.status,
      requirements: task.requirements,
      required,
      minCoverage,
      matches,
      shown: tags.shown,
      coverage: tags.coverage,
      reviewer: tags.reviewer,
      missing,
      coverageShort,
      blocking,
    };
  });

/** Plan de validación de una feature leyendo la spec. */
export const featureValidation = async (
  cwd: string,
  sddDir: string,
  feature: string,
): Promise<{ plan: TaskValidation[]; source: 'default' | 'project'; errors: string[] } | null> => {
  const trace = await loadFeatureTrace(cwd, sddDir, feature);
  if (!trace) return null;
  const tasksText = await readFile(path.join(cwd, sddDir, 'specs', feature, 'tasks.md'), 'utf8').catch(() => '');
  const parsed = parseTasksMarkdown(tasksText);
  const { rules, source, errors } = await loadValidationRules(cwd, sddDir);
  const plan = planValidation({
    rules,
    requirements: trace.requirements,
    tasks: trace.tasks.map((task, index) => ({
      ...task,
      boundary: parsed[index]?.boundary ?? [],
      evidence: [...task.evidence, parsed[index]?.raw ?? ''],
    })),
  });
  return { plan, source, errors };
};
