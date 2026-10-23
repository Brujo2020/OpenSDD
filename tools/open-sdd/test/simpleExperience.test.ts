import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { prepareCard, readAnswer } from '../src/core/hilCards.js';
import { report, startRun } from '../src/core/engine.js';
import { detectProfile, profileValues } from '../src/core/profile.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'sx-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
});

describe('simple-experience — one door, five verbs', () => {
  it('AC-01 --help is the five verbs in ≤ 40 lines; help --all keeps the full catalogue', async () => {
    for (const argv of [['--help'], ['help']]) {
      const { code, out } = await run(...argv);
      expect(code).toBe(0);
      expect(out.split('\n').length).toBeLessThanOrEqual(40);
      for (const verb of ['setup', 'start', 'check', 'decide', 'help --all']) expect(out).toContain(verb);
      expect(out).not.toContain('brownfield survey');
    }
    for (const argv of [['help', '--all'], ['--help', '--all']]) {
      const { out } = await run(...argv);
      expect(out).toContain('brownfield survey');
      expect(out).toContain('The five verbs');
    }
    expect((await run('decide', '--help')).out).toContain('open-sdd decide');
  });

  it('AC-02 setup behaves exactly as init', async () => {
    const a = await run('setup', '--json');
    const b = await run('init', '--json');
    expect(a.code).toBe(b.code);
    expect(a.out).toBe(b.out);
  });

  it('AC-03 check returns the verdict and exit code of gates run', async () => {
    const raw = async (...argv: string[]) => {
      const logs: string[] = [];
      const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
      return { code: await runCli(argv, runtime, io, {}, { cwd }), out: logs.join('\n') };
    };
    const gates = await raw('gates', 'run');
    const check = await raw('check');
    expect(check.code).toBe(gates.code);
    expect(check.out).not.toMatch(/Opción desconocida/);
    expect(check.out).toMatch(/La cadena (pasa|NO pasa)/);
    // The global footer flag is not a gate option: check accepts it.
    expect((await run('check')).out).not.toMatch(/Opción desconocida/);
    // Like `gates run`, the score footer of `check` declares the gate component unmeasured.
    expect(gates.out).toMatch(/gates \(no medidos/);
    expect(check.out).toMatch(/gates \(no medidos/);
  });

  it('AC-04 decide surfaces the waiting decisions with the exact command', async () => {
    const none = await run('decide');
    expect(none.code).toBe(0);
    expect(none.out).toContain('Nada que decidir.');

    const prepared = await prepareCard(cwd, {
      feature: 'pay', step: 's', trigger: 'phase-gate', question: 'Accept?',
      options: [
        { key: 'A', label: 'Approve', consequence: 'done', effect: 'approve' },
        { key: 'B', label: 'Park', consequence: 'stops', effect: 'park' },
      ],
      recommend: 'A', default: 'B', evidence: ['kept -> change -> 2 of 2 runs'], deadlineHours: 24,
    });
    expect(prepared.ok).toBe(true);
    const one = await run('decide');
    expect(one.out).toContain(`pay · ${prepared.card!.id} — Accept?`);
    expect(one.out).toContain(`open-sdd decide pay ${prepared.card!.id} <A|B> --by "<name>"`);
    expect((await run('decide', 'pay')).out).toContain('OPEN');
    expect((await run('decide', 'pay', prepared.card!.id)).code).toBe(2);

    // The answer route: `decide <feature> <card> <option> --by "<name with spaces>"` → hil answer.
    await run('decide', 'pay', prepared.card!.id, 'B', '--by', 'Ana María');
    expect((await readAnswer(cwd, 'pay', prepared.card!.id))?.by).toBe('Ana María');
    expect((await run('decide')).out).toContain('Nada que decidir.');
  });

  it('AC-04b decide surfaces a step escalated to a human gate that has no card yet', async () => {
    writeFileSync(path.join(cwd, 'pb.playbook.json'), JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'f', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const step = s.state!.steps[0].id;
    await report(cwd, 'f', step, 'started');
    for (let i = 0; i < 4; i += 1) await report(cwd, 'f', step, 'completed');
    const out = (await run('decide')).out;
    expect(out).toContain(`f · ${step} — escalated to HIL after 4 failed iterations`);
    expect(out).toContain('open-sdd next f');
    expect(JSON.parse((await run('decide', '--json')).out)).toEqual([expect.objectContaining({ feature: 'f', kind: 'gate', id: step })]);
  });

  it('AC-05 the docs open with the five verbs, diagrams and the colour legend', () => {
    const root = path.resolve(__dirname, '..', '..', '..');
    for (const doc of ['README.md', 'README.es.md', 'docs/MANUAL.md']) {
      const text = readFileSync(path.join(root, doc), 'utf8');
      for (const verb of ['open-sdd setup', 'open-sdd start', 'open-sdd check', 'open-sdd decide']) expect(text, doc).toContain(verb);
      expect((text.match(/```mermaid/g) ?? []).length, doc).toBeGreaterThanOrEqual(2);
      expect(text, doc).toMatch(/🟢/);
      expect(text, doc).toMatch(/🔵/);
    }
  });
});
