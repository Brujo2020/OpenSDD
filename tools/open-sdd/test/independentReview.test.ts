import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { independentReviewViolation, receiptFreshness, recordReview } from '../src/core/reviewReceipts.js';
import {
  INDEPENDENT_REVIEW_ID,
  independentReviewPrinciple,
  INDEPENDENT_REVIEW_AMENDMENT,
  parseConstitution,
  principlesInForce,
  renderConstitution,
  validateConstitution,
  type Constitution,
} from '../src/core/constitution.js';

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const repo = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'open-sdd-indep-'));
  temps.push(dir);
  await writeFile(path.join(dir, 'tasks.md'), '- [x] 1. done\n', 'utf8');
  return dir;
};

describe('C-INDEPENDENT-REVIEW — recibos de revisión', () => {
  it('rechaza que el modelo autor se revise a sí mismo, también con sufijo de fecha o mayúsculas', () => {
    expect(independentReviewViolation('claude-opus-5-5', 'claude-opus-5-5')).toMatch(/cannot review it/);
    expect(independentReviewViolation('Claude-Opus-5-5-20261001', 'claude-opus-5-5')).toMatch(/cannot review it/);
  });

  it('exige el modelo autor y un id de revisor no vacío cuando la revisión es de un modelo', () => {
    expect(independentReviewViolation('gpt-x', undefined)).toMatch(/--author-model/);
    expect(independentReviewViolation('', 'claude-opus-5-5')).toMatch(/needs the reviewer model id/);
  });

  it('acepta una persona o un modelo distinto', () => {
    expect(independentReviewViolation(undefined, 'claude-opus-5-5')).toBeNull();
    expect(independentReviewViolation('gemini-3-pro', 'claude-opus-5-5')).toBeNull();
  });

  it('recordReview no escribe recibo si la revisión no es independiente, y registra ambos modelos si lo es', async () => {
    const cwd = await repo();
    const refused = await recordReview(cwd, {
      feature: 'f', step: 's', reviewer: 'bot', reviewerModel: 'm-1', authorModel: 'm-1', artifacts: ['tasks.md'], roots: [],
    });
    expect(refused.ok).toBe(false);
    const ok = await recordReview(cwd, {
      feature: 'f', step: 's', reviewer: 'bot', reviewerModel: 'm-2', authorModel: 'm-1', artifacts: ['tasks.md'], roots: [],
    });
    expect(ok.ok).toBe(true);
    const saved = JSON.parse(await readFile(path.join(cwd, '.sdd', 'reviews', 'f', 's.json'), 'utf8'));
    expect(saved).toMatchObject({ reviewerModel: 'm-2', authorModel: 'm-1' });
    // The new fields are part of the digest: the receipt verifies as fresh, not tampered.
    expect(await receiptFreshness(cwd, saved)).toMatchObject({ fresh: true, tampered: false });
    // An old-shape receipt (no model fields) still verifies.
    const human = await recordReview(cwd, { feature: 'f', step: 'h', reviewer: 'Ana', artifacts: ['tasks.md'], roots: [] });
    expect(human.receipt).not.toHaveProperty('reviewerModel');
    expect(await receiptFreshness(cwd, human.receipt!)).toMatchObject({ fresh: true, tampered: false });
  });
});

describe('C-INDEPENDENT-REVIEW — la constitución', () => {
  const base = (withInvariant: boolean): Constitution => ({
    project: 'p',
    provenance: 'descriptive',
    establishedFacts: [],
    principles: [
      {
        id: 'C-X', title: 'x', level: 'SHOULD', restriction: 'r', pattern: 'p', justification: 'j',
        provenance: 'descriptive', evidence: ['src'],
      },
      ...(withInvariant ? [independentReviewPrinciple()] : []),
    ],
    amendments: withInvariant ? [{ ...INDEPENDENT_REVIEW_AMENDMENT }] : [],
  });

  it('el invariante es válido, está en vigor y sobrevive a render → parse', () => {
    const doc = parseConstitution(renderConstitution(base(true)));
    expect(validateConstitution(doc).filter((i) => i.severity === 'error')).toEqual([]);
    expect(principlesInForce(doc).map((p) => p.id)).toContain(INDEPENDENT_REVIEW_ID);
  });

  it('una constitución sin el invariante recibe un aviso', () => {
    const codes = validateConstitution(base(false)).map((i) => i.code);
    expect(codes).toContain('INDEPENDENT-REVIEW-MISSING');
  });
});
