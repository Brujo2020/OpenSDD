/** EARS converter v2: patterns, repairs that keep meaning, refusals that would need invention, writing. */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { convertStatement, convertText, baseVerb, nextRequirementIds } from '../src/core/earsConvert.js';
import { validateEarsRequirement } from '../src/core/ears.js';
import { runCli } from '../src/index.js';

const ok = (input: string, expected: string[], status: 'converted' | 'needs-confirmation' = 'converted', system?: string) => {
  const c = convertStatement(input, { system });
  expect(c.status, JSON.stringify(c)).toBe(status);
  expect(c.proposals).toEqual(expected);
  for (const p of c.proposals) expect(validateEarsRequirement(p).conforms).toBe(true);
};

describe('converts as-is', () => {
  it.each([
    ['When a payment fails the system must notify the customer by email.', 'WHEN a payment fails, the system shall notify the customer by email.'],
    ['Whenever a file is uploaded, the scanner shall check it for malware.', 'WHEN a file is uploaded, the scanner shall check it for malware.'],
    ['While the circuit is open, the gateway must return 503.', 'WHILE the circuit is open, the gateway shall return 503.'],
    ['While maintenance mode is on the gateway shall return 503 with a Retry-After header.', 'WHILE maintenance mode is on, the gateway shall return 503 with a Retry-After header.'],
    ['During business hours the chat service must route requests to a human agent.', 'WHILE business hours, the chat service shall route requests to a human agent.'],
    ['Where the client supplies a request ID, the gateway should propagate it downstream.', 'WHERE the client supplies a request ID, the gateway shall propagate it downstream.'],
    ['If the card is expired the payment service shall reject the charge with code 402.', 'IF the card is expired, THEN the payment service shall reject the charge with code 402.'],
    ['In case the token is expired the gateway must return 401.', 'IF the token is expired, THEN the gateway shall return 401.'],
    ['The API must expose a health endpoint returning HTTP 200.', 'The API shall expose a health endpoint returning HTTP 200.'],
    ['The system must notify the customer by email and SMS.', 'The system shall notify the customer by email and SMS.'],
    ['Cuando el usuario confirma el pedido, el sistema debe enviar un correo de confirmación.', 'WHEN el usuario confirma el pedido, el sistema shall enviar un correo de confirmación.'],
    ['Si el pago es rechazado, el servicio de pagos debe notificar al cliente.', 'IF el pago es rechazado, THEN el servicio de pagos shall notificar al cliente.'],
    ['Mientras la cuenta esté bloqueada, el servicio de pagos debe rechazar los cargos.', 'WHILE la cuenta esté bloqueada, el servicio de pagos shall rechazar los cargos.'],
  ])('%s', (input, expected) => {
    const c = convertStatement(input);
    expect(c.proposals).toEqual([expected]);
    expect(validateEarsRequirement(expected).conforms).toBe(true);
  });
});

describe('negative requirements', () => {
  it.each([
    ['The API must not return card numbers in responses.', 'The API shall not return card numbers in responses.'],
    ['The logger cannot write passwords to disk.', 'The logger shall not write passwords to disk.'],
    ['El sistema no debe almacenar el CVV.', 'El sistema shall not almacenar el CVV.'],
  ])('%s', (input, expected) => ok(input, [expected]));
});

describe('repairs that keep the meaning', () => {
  it('passive with an agent becomes active', () => ok('The card number must be encrypted with AES-256 by the vault service.', ['The vault service shall encrypt the card number with AES-256.']));
  it('a trailing condition moves to the front', () => ok('The billing service must email the invoice when the order ships.', ['WHEN the order ships, the billing service shall email the invoice.'], 'converted'));
  it('passive + trailing condition together', () => ok('The customer must be notified by the billing service when an invoice is overdue.', ['WHEN an invoice is overdue, the billing service shall notify the customer.'], 'needs-confirmation'));
  it('passive without an agent uses --system', () => ok('The report should be generated within 5 minutes after month end.', ['The reporting service shall generate the report within 5 minutes after month end.'], 'needs-confirmation', 'reporting service'));
  it('"be able to" becomes the system allowing it', () => ok('The user must be able to download invoices as PDF.', ['The system shall allow the user to download invoices as PDF.'], 'needs-confirmation'));
  it('"can" becomes an obligation to allow, marked for confirmation', () => ok('Users can download invoices.', ['The system shall allow users to download invoices.'], 'needs-confirmation'));
  it('Spanish capability', () => ok('El usuario debe poder descargar sus facturas.', ['El sistema shall permitir al usuario descargar sus facturas.'], 'needs-confirmation'));
  it('several actions split into several requirements', () => ok('The system must validate the input, log the request and notify ops.', ['The system shall validate the input.', 'The system shall log the request.', 'The system shall notify ops.']));
  it('Spanish split keeps the trigger on each', () => ok('Cuando el usuario confirma el pedido, el sistema debe enviar un correo y registrar la venta.', ['WHEN el usuario confirma el pedido, el sistema shall enviar un correo.', 'WHEN el usuario confirma el pedido, el sistema shall registrar la venta.']));
  it('"should" is read as shall with a note', () => {
    const c = convertStatement('The gateway should log every request.');
    expect(c.proposals).toEqual(['The gateway shall log every request.']);
    expect(c.notes.join()).toContain('read as mandatory');
  });
  it('"after" keeps the trigger and flags it', () => {
    const c = convertStatement('After 3 failed logins the auth service must lock the account for 15 minutes.');
    expect(c.proposals[0]).toMatch(/^WHEN 3 failed logins, the auth service shall lock/);
    expect(c.notes.join()).toContain('check the trigger');
  });
});

describe('refuses what would need invention', () => {
  it.each([
    ['The export should be fast.', 'latency at a percentile'],
    ['El reporte debe ser rápido.', 'p95'],
    ['The portal must be secure.', 'the control'],
    ['The platform must be scalable.', 'requests/s'],
    ['The service must be highly available.', 'availability'],
    ['The UI must be intuitive.', 'task measure'],
    ['The job must run as soon as possible.', 'deadline'],
    ['The order must be stored.', 'who does it'],
    ['It should retry three times.', 'does not name an actor'],
    ['The customer must receive a receipt.', 'which system makes it happen'],
    ['invoices downloaded monthly', 'What shall the system do'],
    ['When , the gateway must return 503.', 'trigger'],
  ])('%s', (input, msg) => {
    const c = convertStatement(input);
    expect(c.status).toBe('question');
    expect(c.proposals).toEqual([]);
    expect(c.questions.join(' ')).toContain(msg);
  });
  it('a person as actor works with --system', () => ok('The customer must receive a receipt.', ['The checkout service shall allow the customer to receive a receipt.'], 'needs-confirmation', 'checkout service'));
});

describe('invariants', () => {
  const inputs = ['When x happens the y must z', 'If a fails the b must c', 'The thing shall be', 'While, the gateway must return 503', 'The api must', 'must do things', 'The cache must expire entries after 60 s and refresh them', 'Si x, el y debe z'];
  it('never emits a proposal the EARS validator rejects', () => {
    for (const t of inputs) for (const p of convertStatement(t).proposals) expect(validateEarsRequirement(p).conforms).toBe(true);
  });
  it('is deterministic', () => {
    for (const t of inputs) expect(convertStatement(t)).toEqual(convertStatement(t));
  });
  it('confidence is 0 for questions and ≤ 100 otherwise', () => {
    for (const t of [...inputs, 'The API must expose /health.']) {
      const c = convertStatement(t);
      expect(c.confidence).toBeLessThanOrEqual(100);
      if (c.status === 'question') expect(c.confidence).toBe(0);
    }
  });
  it.each([['notified', 'notify'], ['logged', 'log'], ['stored', 'store'], ['rejected', 'reject'], ['sent', 'send'], ['validated', 'validate'], ['deleted', 'delete'], ['archived', 'archive'], ['encrypted', 'encrypt'], ['processed', 'process'], ['saved', 'save'], ['displayed', 'display']])('base verb of %s is %s', (p, b) => expect(baseVerb(p)).toBe(b));
  it('next ids continue the area numbering', () => expect(nextRequirementIds('### REQ-INV-002\n### REQ-INV-007', 'INV', 2)).toEqual(['REQ-INV-008', 'REQ-INV-009']));
  it('report totals', () => {
    const r = convertText(['The API must expose /health.', 'Users can export data.', 'The export should be fast.']);
    expect([r.converted, r.needsConfirmation, r.questions, r.requirements.length]).toEqual([1, 1, 1, 2]);
  });
});

describe('writing requirements', () => {
  const runtime = { platform: 'linux', env: {} } as const;
  it('appends converted rows with ids and sources; confirmed rows only with --accept', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'ears2-'));
    const run = async (...argv: string[]) => {
      const logs: string[] = [];
      const code = await runCli([...argv, '--no-footer'], runtime, { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} }, {}, { cwd });
      return { code, out: logs.join('\n') };
    };
    mkdirSync(path.join(cwd, '.sdd/specs/inv'), { recursive: true });
    writeFileSync(path.join(cwd, '.sdd/specs/inv/requirements.md'), '# Requirements — inv\n\n### REQ-INV-001 — existing\n- Statement: The API shall expose /health.\n');
    await run('assist', 'ears', 'The system must validate the input. Users can download invoices.', '--feature', 'inv', '--area', 'INV', '--write');
    let md = readFileSync(path.join(cwd, '.sdd/specs/inv/requirements.md'), 'utf8');
    expect(md).toContain('### REQ-INV-002 — validate the input');
    expect(md).not.toContain('allow users');
    await run('assist', 'ears', 'Users can download invoices.', '--feature', 'inv', '--area', 'INV', '--write', '--accept');
    md = readFileSync(path.join(cwd, '.sdd/specs/inv/requirements.md'), 'utf8');
    expect(md).toContain('### REQ-INV-003');
    expect(md).toContain('Source: "Users can download invoices"');
    writeFileSync(path.join(cwd, 'notes.md'), '- When a refund is approved the ledger must record it.\n- The ledger must not delete entries.\n');
    const r = await run('assist', 'ears', '--file', path.join(cwd, 'notes.md'), '--json');
    expect(JSON.parse(r.out).requirements).toEqual(['WHEN a refund is approved, the ledger shall record it.', 'The ledger shall not delete entries.']);
  });
});
