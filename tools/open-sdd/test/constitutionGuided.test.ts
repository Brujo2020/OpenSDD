/**
 * Constitución amigable desde el inicio:
 *  - un proyecto nuevo (sin código que dé evidencia) puede tener constitución ratificada: las decisiones
 *    NORMATIVAS de la entrevista se ratifican con persona nombrada; las DESCRIPTIVAS siguen exigiendo evidencia;
 *  - la decisión de fronteras aterriza como principio aunque el código aún no muestre fronteras.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyConstitutionAnswers, planConstitutionInterview } from '../src/core/interview.js';
import { ratifyDraft } from '../src/core/constitutionDraft.js';
import { parseConstitution } from '../src/core/constitution.js';

const greenfield = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdd-guided-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"shop"}');
  return root;
};

describe('constitución guiada en un proyecto nuevo', () => {
  it('la decisión de fronteras aterriza como principio y se puede ratificar', async () => {
    const root = await greenfield();
    const interview = await planConstitutionInterview(root, { sddDir: '.sdd' });
    const q = interview.questions.find((x) => x.id === 'Q-NORM-BOUNDARY-CROSSING');
    expect(q).toBeDefined();
    const applied = await applyConstitutionAnswers({ answers: { 'Q-NORM-BOUNDARY-CROSSING': 'cruce prohibido sin enmienda' }, interview, cwd: root });
    const draft = parseConstitution(applied.text);
    const boundaries = draft.principles.find((p) => p.id === 'C-BOUNDARIES');
    expect(boundaries?.pattern).toContain('cruce prohibido sin enmienda');
    const result = ratifyDraft(draft, { by: 'Mario', rationale: 'kickoff', ids: ['C-BOUNDARIES'] });
    expect(result.ratified).toEqual(['C-BOUNDARIES']);
  });

  it('un principio descriptivo sin evidencia sigue rechazándose', () => {
    const doc = parseConstitution(
      '# Constitution — x\n\nProvenance: descriptive\n\n## Principles\n\n### C-X — algo\n- Level: MUST\n- Threat: t\n- Restriction: r\n- Pattern: p\n- Justification: j\n- Provenance: descriptive\n- Draft: true\n',
    );
    const result = ratifyDraft(doc, { by: 'Mario', rationale: 'r' });
    expect(result.ratified).toEqual([]);
    expect(result.refused[0]?.why).toMatch(/evidencia/i);
  });
});
