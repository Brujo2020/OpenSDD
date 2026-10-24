/**
 * Atestación de entrega de una feature (in-toto Statement v1): QUÉ especificación se entregó (sha256 de
 * cada artefacto y de la constitución), en qué commit, en qué estado, con qué validación y con qué
 * cabeza de la cadena de auditoría. Es el formato que entienden SLSA, Sigstore y los verificadores de
 * cadena de suministro; firmarlo (p. ej. `cosign sign-blob`) es un paso aparte y fuera de esta herramienta.
 *
 * `verifyAttestation` recalcula los digests y la cabeza de la cadena: cualquier cambio posterior en la
 * spec, la constitución o el registro de auditoría se reporta.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildFlow } from './flow.js';
import { featureValidation } from './validationRules.js';
import { verifyAuditChain } from './engine.js';

export const PREDICATE_TYPE = 'https://github.com/Brujo2020/OpenSDD/attestation/spec-delivery/v1';

const sha256 = (b: string): string => createHash('sha256').update(b).digest('hex');

export interface Attestation {
  _type: 'https://in-toto.io/Statement/v1';
  subject: { name: string; digest: { sha256: string } }[];
  predicateType: typeof PREDICATE_TYPE;
  predicate: {
    feature: string;
    generatedAt: string;
    commit: string | null;
    status: { state: string; headline: string };
    validation: { task: string; required: string[]; missing: string[]; blocking: boolean }[];
    audit: { log: string; lines: number; head: string | null; intact: boolean }[];
  };
}

const subjects = (sddDir: string, feature: string): string[] => {
  const spec = path.posix.join(sddDir, 'specs', feature);
  return [
    path.posix.join(sddDir, 'steering', 'constitution.md'),
    ...['brief.md', 'requirements.md', 'delta.md', 'plan.md', 'design.md', 'tasks.md'].map((f) => path.posix.join(spec, f)),
  ];
};

const auditState = async (cwd: string, feature: string): Promise<Attestation['predicate']['audit']> => {
  const out: Attestation['predicate']['audit'] = [];
  for (const name of [feature, '_governance']) {
    const rel = path.posix.join('.sdd', 'engine', `${name}.audit.jsonl`);
    const text = await readFile(path.join(cwd, rel), 'utf8').catch(() => null);
    if (text === null) continue;
    const lines = text.split('\n').filter(Boolean);
    out.push({ log: rel, lines: lines.length, head: lines.length ? sha256(lines[lines.length - 1]) : null, intact: verifyAuditChain(text).ok });
  }
  return out;
};

export const buildAttestation = async (cwd: string, sddDir: string, feature: string): Promise<Attestation> => {
  const subject: Attestation['subject'] = [];
  for (const rel of subjects(sddDir, feature)) {
    const file = path.join(cwd, rel);
    if (!existsSync(file)) continue;
    subject.push({ name: rel, digest: { sha256: sha256(await readFile(file, 'utf8')) } });
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  const flow = await buildFlow(cwd, feature, sddDir);
  const validation = (await featureValidation(cwd, sddDir, feature))?.plan ?? [];
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject,
    predicateType: PREDICATE_TYPE,
    predicate: {
      feature,
      generatedAt: new Date().toISOString(),
      commit: head.status === 0 ? head.stdout.trim() : null,
      status: { state: flow.status.state, headline: flow.status.headline },
      validation: validation.map((t) => ({ task: t.task, required: t.required, missing: t.missing, blocking: t.blocking })),
      audit: await auditState(cwd, feature),
    },
  };
};

/** Recalcula y compara. Devuelve cada diferencia como una línea legible. */
export const verifyAttestation = async (cwd: string, attestation: Attestation): Promise<string[]> => {
  const problems: string[] = [];
  if (attestation._type !== 'https://in-toto.io/Statement/v1') problems.push('no es un in-toto Statement v1');
  for (const s of attestation.subject) {
    const file = path.join(cwd, s.name);
    if (!existsSync(file)) {
      problems.push(`${s.name}: ya no existe`);
      continue;
    }
    if (sha256(await readFile(file, 'utf8')) !== s.digest.sha256) problems.push(`${s.name}: cambió después de la atestación`);
  }
  const now = await auditState(cwd, attestation.predicate.feature);
  for (const a of attestation.predicate.audit) {
    const current = now.find((n) => n.log === a.log);
    if (!current) problems.push(`${a.log}: el registro desapareció`);
    else if (!current.intact) problems.push(`${a.log}: la cadena de hashes está rota`);
    else if (current.lines < a.lines) problems.push(`${a.log}: tiene menos líneas que al atestar (${current.lines} < ${a.lines})`);
    else if (a.head) {
      // La línea que era la cabeza al atestar debe seguir siendo la misma (historia reescrita y re-encadenada).
      const lines = (await readFile(path.join(cwd, a.log), 'utf8')).split('\n').filter(Boolean);
      if (sha256(lines[a.lines - 1] ?? '') !== a.head) problems.push(`${a.log}: la historia anterior a la atestación se reescribió`);
    }
  }
  return problems;
};
