/**
 * Regresiones de fix/clarify-ambiguity:
 *  - clarify detecta términos vagos en inglés (antes solo los marcaba `requirements review`);
 *  - clarify NO declara limpia una spec sin requisitos reconocibles;
 *  - `_Depends:_ 1, 3 — _Boundary:_` no produce la tarea fantasma «3 —»;
 *  - el aviso de ambigüedad ofrece clarify (sin TTY: imprime el comando, no pregunta ni escribe).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planClarify } from '../src/core/clarify.js';
import { parseTasksMarkdown } from '../src/core/specManager.js';
import { offerClarify } from '../src/cli/ui/clarifyOffer.js';

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const project = async (requirements: string): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdd-amb-'));
  temps.push(root);
  const file = path.join(root, '.sdd/specs/demo/requirements.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, requirements, 'utf8');
  return root;
};

const VAGUE_EN =
  '# Requirements: demo\n\n## Requirements\n\n- When a customer requests an invoice, the [invoice service] shall return it quickly.\n- When an admin resends it, the [mailer] shall send it to the appropriate address.\n';

describe('clarify — ambigüedad en inglés', () => {
  it('pregunta por quickly y appropriate', async () => {
    const session = await planClarify({ cwd: await project(VAGUE_EN), feature: 'demo' });
    const slots = session.questions.filter((q) => q.code === 'VAGUE_TERM').map((q) => q.slot);
    expect(slots).toEqual(expect.arrayContaining(['quickly', 'appropriate']));
  });

  it('no declara limpia una spec sin requisitos', async () => {
    const session = await planClarify({ cwd: await project('# nada\n'), feature: 'demo' });
    expect(session.questions).toHaveLength(0);
    expect(session.detail).not.toContain('está limpia');
    expect(session.detail).toContain('NO se declara limpia');
  });
});

describe('tasks.md — _Depends:_ seguido de separador', () => {
  it('lee solo los ids', () => {
    const [task] = parseTasksMarkdown('- [ ] 4. Endpoint — _Depends:_ 1, 3 — _Boundary:_ `src/api.js`_\n');
    expect(task.depends).toEqual(['1', '3']);
  });
});

describe('offerClarify', () => {
  const capture = () => {
    const out: string[] = [];
    return { out, io: { log: (m: string) => out.push(m), error: (m: string) => out.push(m), warn: (m: string) => out.push(m) } as never };
  };

  it('avisa y da el comando cuando hay ambigüedad (sin TTY no pregunta)', async () => {
    const root = await project(VAGUE_EN);
    const { out, io } = capture();
    const n = await offerClarify(io, root, 'demo', ['--no-input']);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(out.join('\n')).toContain('requisito(s) ambiguo(s)');
    expect(out.join('\n')).toContain('open-sdd brownfield clarify demo');
  });

  it('calla cuando no hay ambigüedad y con --json', async () => {
    const clean = await project('# Requirements: demo\n\n## Requirements\n\n- If the invoice does not exist, then the [invoice service] shall respond with HTTP 404.\n');
    const a = capture();
    expect(await offerClarify(a.io, clean, 'demo', [])).toBe(0);
    expect(a.out).toHaveLength(0);
    const b = capture();
    expect(await offerClarify(b.io, await project(VAGUE_EN), 'demo', ['--json'])).toBe(0);
    expect(b.out).toHaveLength(0);
  });
});
