/** Assistants (discovery by roles, brief, EARS conversion, steering drafts, menu) and `where` progress/checkpoint. */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { convertStatement } from '../src/core/earsConvert.js';
import { validateEarsRequirement } from '../src/core/ears.js';
import { planDiscovery, composeBrief, draftSteering } from '../src/core/guidedAssistants.js';
import { bar } from '../src/core/where.js';
import { splitStatements } from '../src/cli/commands/assist.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'vra-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"shop","dependencies":{"react":"18.3.1"},"devDependencies":{"vitest":"4"}}');
});

describe('EARS conversion', () => {
  it.each([
    ['When a payment fails the system must notify the customer by email.', 'event-driven', 'WHEN a payment fails, the system shall notify the customer by email.'],
    ['While the circuit is open, the gateway must return 503.', 'state-driven', 'WHILE the circuit is open, the gateway shall return 503.'],
    ['If the card is expired the payment service shall reject the charge with code 402.', 'unwanted', 'IF the card is expired, THEN the payment service shall reject the charge with code 402.'],
    ['Where the client supplies a request ID, the gateway should propagate it downstream.', 'optional', 'WHERE the client supplies a request ID, the gateway shall propagate it downstream.'],
    ['The API must expose a health endpoint returning HTTP 200.', 'ubiquitous', 'The API shall expose a health endpoint returning HTTP 200.'],
    ['Cuando el usuario confirma el pedido, el sistema debe enviar un correo de confirmación.', 'event-driven', 'WHEN el usuario confirma el pedido, el sistema shall enviar un correo de confirmación.'],
    ['Mientras la cuenta esté bloqueada, el servicio de pagos debe rechazar los cargos.', 'state-driven', 'WHILE la cuenta esté bloqueada, el servicio de pagos shall rechazar los cargos.'],
  ])('«%s» → %s', (input, pattern, proposal) => {
    const c = convertStatement(input);
    expect(c.pattern).toBe(pattern);
    expect(c.proposal).toBe(proposal);
    expect(validateEarsRequirement(c.proposal!).conforms).toBe(true);
  });
  it.each([
    ['The export should be fast.', 'not testable'],
    ['El reporte debe ser rápido.', 'no es comprobable'],
    ['invoices downloaded monthly', 'What shall the system do'],
  ])('«%s» is a question, not a sentence', (input, msg) => {
    const c = convertStatement(input);
    expect(c.proposal).toBeNull();
    expect(c.questions.join(' ')).toContain(msg);
  });
  it('never emits a proposal that fails the EARS validator', () => {
    for (const t of ['When x the y must z', 'If a, then b must c', 'The thing shall be', 'While, the gateway must return 503']) {
      const c = convertStatement(t);
      if (c.proposal) expect(validateEarsRequirement(c.proposal).conforms).toBe(true);
    }
  });
  it('splits bullets and sentences', () => expect(splitStatements('- The API must expose /health.\n- When a job fails the scheduler must retry it. The UI must show it.')).toHaveLength(3));
  it('CLI converts and exits 1 while questions remain', async () => {
    const r = await run('assist', 'ears', 'When a payment fails the system must notify the customer. The export should be fast.');
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 converted · 0 to confirm (~) · 1 question(s)');
  });
});

describe('BMAD-style discovery', () => {
  it('questions scale with the level and add roles by risk and UI', async () => {
    const poc = await planDiscovery(cwd, 'p', 'prototype voice search');
    const big = await planDiscovery(cwd, 'b', 'new customer portal app from scratch with payments');
    expect(poc.questions.length).toBeLessThan(big.questions.length);
    expect(big.roles).toEqual(expect.arrayContaining(['analyst', 'pm', 'architect', 'ux', 'qa', 'security']));
    expect(poc.roles).not.toContain('security');
  });
  it('tiny work needs no discovery', async () => expect((await run('assist', 'discover', 'fix typo in README')).out).toContain('no discovery needed'));
  it('the brief is composed from answers and linted; an agent assumption blocks it', async () => {
    await run('assist', 'discover', 'prototype voice search', '--feature', 'vs');
    const file = path.join(cwd, '.sdd/questions/vs/discovery.md');
    let md = readFileSync(file, 'utf8');
    const answers = ['C: users cannot search hands-free', 'D: a half-built keyword search exists', 'C: 30 % of searches by voice within 2 weeks', 'A: no mobile apps in the PoC', 'B: a browser speech API behind a flag', 'B: searching while cooking'];
    let i = 0;
    md = md.replace(/\[Answer\]:/g, () => `[Answer]: ${answers[i++]}`);
    writeFileSync(file, md);
    const ok = await composeBrief(cwd, 'vs', { write: true });
    expect(ok.ok).toBe(true);
    expect(readFileSync(path.join(cwd, '.sdd/specs/vs/brief.md'), 'utf8')).toContain('**Out**: Mobile apps: no mobile apps in the PoC');
    writeFileSync(file, md.replace('C: 30 % of searches by voice within 2 weeks', 'C: ASSUMPTION: 30 % of searches by voice'));
    const blocked = await composeBrief(cwd, 'vs');
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.join()).toContain('A1');
  });
  it('an unanswered discovery cannot become a brief', async () => {
    await run('assist', 'discover', 'add CSV export to reports', '--feature', 'csv');
    const r = await run('assist', 'brief', 'csv');
    expect(r.code).toBe(1);
    expect(r.out).toContain('Answer');
  });
});

describe('steering drafts', () => {
  it('drafts what the workspace shows, marked inferred, and asks the rest', async () => {
    mkdirSync(path.join(cwd, 'src/cart'), { recursive: true });
    writeFileSync(path.join(cwd, 'src/cart/a.ts'), 'x');
    writeFileSync(path.join(cwd, 'README.md'), '# Shop\n\nOnline shop for craft goods.\n');
    const d = await draftSteering(cwd);
    const tech = d.files.find((f) => f.name === 'tech.md')!.content;
    expect(tech).toContain('Uses react 18.3.1 (inferred)');
    expect(d.files.find((f) => f.name === 'product.md')!.content).toContain('Online shop for craft goods. (inferred)');
    expect(d.files.find((f) => f.name === 'structure.md')!.content).toContain('src/cart');
    expect(d.files.every((f) => f.questions > 0)).toBe(true);
  });
  it('--write never overwrites without --force, and steering check reports the draft', async () => {
    mkdirSync(path.join(cwd, '.sdd/steering'), { recursive: true });
    writeFileSync(path.join(cwd, '.sdd/steering/product.md'), '---\ninclusion: always\n---\n# mine\n');
    await run('steering', 'draft', '--write');
    expect(readFileSync(path.join(cwd, '.sdd/steering/product.md'), 'utf8')).toContain('# mine');
    expect(existsSync(path.join(cwd, '.sdd/steering/tech.md'))).toBe(true);
    const c = await run('steering', 'check');
    expect(c.code).toBe(1);
    expect(c.out).toContain('por confirmar');
  });
  it('the assistant menu recommends by repository state', async () => {
    const r = await run('assist', '--json');
    expect(JSON.parse(r.out).map((s: { assistant: string }) => s.assistant)).toEqual(expect.arrayContaining(['steering', 'constitution', 'start']));
  });
});

describe('where: phase, % done, pending, checkpoint', () => {
  it('progress bar is bounded', () => {
    expect(bar(0)).toContain('  0%');
    expect(bar(150)).toContain('100%');
  });
  it('shows phase, percent and pending; --line for a prompt; --save writes a resumable checkpoint', async () => {
    await run('start', 'fix typo in README', '--feature', 't');
    await run('report', 't', '--step', 'sdd-tiny', '--result', 'started');
    await run('report', 't', '--step', 'sdd-tiny', '--result', 'completed');
    const j = JSON.parse((await run('where', 't', '--json')).out);
    expect(j.runs[0]).toMatchObject({ done: 1, total: 2, percent: 50, currentPhase: 'do' });
    expect(j.runs[0].pending).toEqual(['sdd-verify-completion (pending)']);
    expect((await run('where', '--line')).out).toBe('t 50% sdd-verify-completion');
    await run('where', '--save', '--note', 'end of day');
    const md = readFileSync(path.join(cwd, '.sdd/state/checkpoint.md'), 'utf8');
    expect(md).toContain('end of day');
    expect(md).toContain('steelfoundry next t');
    expect(JSON.parse(readFileSync(path.join(cwd, '.sdd/state/checkpoint.json'), 'utf8')).runs).toHaveLength(1);
  });
  it('an unknown run is refused; no runs says how to start', async () => {
    expect((await run('where', 'ghost')).code).toBe(1);
    expect((await run('where')).out).toContain('steelfoundry start');
  });
});
