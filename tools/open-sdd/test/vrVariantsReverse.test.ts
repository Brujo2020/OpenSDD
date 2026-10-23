/** variants-reverse: greenfield/brownfield variants, rigor ladder, reverse engineering stages (AC-01…AC-04). */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';
import { classifyLevel, effectiveRigor, playbookFor, variantOf, rigorFloor, normalizeRigor } from '../src/core/levels.js';
import { initInventory, parseRules, reverseStages } from '../src/core/reverse.js';
import { readState, report } from '../src/core/engine.js';
import { checkRecall, readPack, recordRecall, writePack } from '../src/core/handoff.js';
import type { ProjectProfile } from '../src/core/profile.js';

const runtime = { platform: 'linux', env: {} } as const;
let cwd = '';
const run = async (...argv: string[]) => {
  const logs: string[] = [];
  const io = { log: (m: string) => logs.push(m), error: (m: string) => logs.push(m), exit: () => {} };
  const code = await runCli([...argv, '--no-footer'], runtime, io, {}, { cwd });
  return { code, out: logs.join('\n') };
};
const w = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), text);
};
const prof = (terrain: 'greenfield' | 'brownfield', tests = true): ProjectProfile => ({ type: terrain === 'brownfield' ? 'brownfield-extension' : 'greenfield', typeReason: 't', signals: [{ id: 'terrain', value: terrain, source: 't' }, { id: 'tests', value: tests, source: 't' }] as never });

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'vr-'));
  writeFileSync(path.join(cwd, 'package.json'), '{"name":"x"}');
  spawnSync('git', ['init', '-q'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Ana'], { cwd });
  spawnSync('git', ['config', 'user.email', 'ana@x.test'], { cwd });
});

describe('AC-01 variants', () => {
  it.each([
    ['prototype voice search', 'greenfield', 'spike'],
    ['prototype voice search', 'brownfield', 'poc-brownfield'],
    ['add CSV export', 'greenfield', 'base/spec-first'],
    ['add CSV export', 'brownfield', 'brownfield-extension'],
    ['new service for document signing from scratch', 'greenfield', 'greenfield'],
    ['build an app for field technicians', 'brownfield', 'project-brownfield'],
    ['platform with onboarding, billing and notifications', 'greenfield', 'multi-feature'],
    ['platform with onboarding, billing and notifications', 'brownfield', 'multi-feature-brownfield'],
    ['split billing into 3 microservices', 'greenfield', 'multi-unit-greenfield'],
    ['split billing into 3 microservices', 'brownfield', 'multi-unit'],
    ['fix typo in README', 'brownfield', 'tiny'],
    ['modernize the core banking mainframe', 'greenfield', 'modernize'],
  ] as const)('«%s» on %s → %s', (intent, terrain, pb) => {
    const d = classifyLevel(intent, prof(terrain));
    expect(playbookFor(d.level, intent, prof(terrain), d.variant)).toBe(pb);
  });
  it('legacy without tests gets legacy-untested', () => expect(playbookFor('L2', 'add CSV export', prof('brownfield', false), 'brownfield')).toBe('legacy-untested'));
  it('intent words beat the workspace', () => {
    expect(variantOf('extend the existing reports', prof('greenfield')).variant).toBe('brownfield');
    expect(variantOf('a new app from scratch', prof('brownfield')).variant).toBe('greenfield');
  });
  it('--variant overrides the classifier', async () => {
    const r = JSON.parse((await run('start', 'add CSV export', '--variant', 'brownfield', '--dry-run', '--json')).out);
    expect(r.variant).toBe('brownfield');
    // Forced brownfield in a workspace without tests: freeze behaviour first.
    expect(r.playbook).toBe('legacy-untested');
    expect((await run('start', 'x', '--variant', 'purple')).code).toBe(2);
  });
  it('every variant playbook passes the checker', async () => {
    for (const p of ['poc-brownfield', 'project-brownfield', 'multi-feature-brownfield', 'multi-unit-greenfield', 'reverse-engineering']) expect((await run('playbook', 'check', p)).code, p).toBe(0);
  });
});

describe('rigor ladder (tiny-spec → spec-first → spec-anchored → spec-as-code)', () => {
  it('floors by level', () => expect(['L0', 'L1', 'L2', 'L4', 'L5', 'L6'].map((l) => rigorFloor(l as never))).toEqual(['tiny-spec', 'tiny-spec', 'spec-first', 'spec-first', 'spec-anchored', 'spec-anchored']));
  it('spec-as-source is the legacy synonym of spec-as-code', () => expect(normalizeRigor('spec-as-source')).toBe('spec-as-code'));
  it('a request below the floor is raised with a warning', () => {
    const r = effectiveRigor('L5', 'tiny-spec');
    expect(r.rigor).toBe('spec-anchored');
    expect(r.warnings[0]).toContain('below the floor');
  });
  it('a declared rigor.json raises the floor for L2+, not for tiny work', () => {
    expect(effectiveRigor('L2', null, 'spec-anchored').rigor).toBe('spec-anchored');
    expect(effectiveRigor('L0', null, 'spec-anchored').rigor).toBe('tiny-spec');
  });
  it('spec-anchored adds its steps to the variant playbook', async () => {
    const r = JSON.parse((await run('start', 'add CSV export', '--rigor', 'spec-anchored', '--feature', 'csv', '--json')).out);
    expect(r.rigor).toBe('spec-anchored');
    expect(r.overlay.added).toEqual(expect.arrayContaining(['gherkin', 'audit-bundle']));
    expect((await readState(cwd, 'csv'))?.playbook).toBe('csv-spec-anchored');
  });
  it('spec-as-code adds discovery and contracts (and the legacy name still works)', async () => {
    expect(JSON.parse((await run('start', 'add CSV export', '--rigor', 'spec-as-source', '--dry-run', '--json')).out).rigor).toBe('spec-as-code');
    const r = JSON.parse((await run('start', 'add CSV export', '--rigor', 'spec-as-code', '--feature', 'csv2', '--json')).out);
    expect(r.overlay.added).toEqual(expect.arrayContaining(['sdd-discovery', 'brownfield-contracts']));
  });
  it('an unknown rigor is a usage error', async () => expect((await run('start', 'x', '--rigor', 'extreme')).code).toBe(2));
});

describe('AC-02…AC-04 reverse engineering mode', () => {
  const src = () => {
    w('src/payments/charge.ts', 'export const charge = 1;');
    w('src/accounts/open.ts', 'export const open = 1;');
    w('src/notify/send.py', 'x = 1');
  };
  it('the intent selects the mode at L3', () => {
    const d = classifyLevel('reverse engineer the billing system', prof('brownfield'));
    expect(d.level).toBe('L3');
    expect(d.playbook).toBe('reverse-engineering');
    expect(d.variant).toBe('brownfield');
  });
  it('init discovers modules and a scoped re-init only adds', async () => {
    src();
    const a = await initInventory(cwd, { scope: ['payments'], critical: ['payments'] });
    expect(a.inventory.modules.map((m) => m.id)).toEqual(['payments']);
    const b = await initInventory(cwd, { scope: ['accounts'] });
    expect(b.added).toEqual(['accounts']);
    expect(b.inventory.modules.find((m) => m.id === 'payments')?.critical).toBe(true);
    expect((await initInventory(cwd, { scope: ['ghost'] })).unknown).toEqual(['ghost']);
  });
  it('rules parser accepts inferred, confirmed and NONE, and flags malformed lines', () => {
    const r = parseRules('- RULE-PAY-001 [payments] refunds within 30 days — inferred\n- RULE-PAY-002 [payments] no refund over 1000 — confirmed by Ana (2026-10-23)\n- NONE [notify] no business rules — confirmed by Ana\n- RULE-BAD no module\n');
    expect(r.rules.map((x) => x.status)).toEqual(['inferred', 'confirmed', 'none']);
    expect(r.malformed).toEqual([4]);
  });
  it('each stage flips to done exactly when its criterion holds, in order', async () => {
    src();
    await initInventory(cwd, { critical: ['payments'] });
    const st = async () => Object.fromEntries((await reverseStages(cwd, 'base')).stages.map((s) => [s.id, s.done]));
    expect(await st()).toMatchObject({ 'RE-1': true, 'RE-2': false });
    w('.sdd/reverse/architecture.md', 'payments charges cards; accounts opens accounts');
    expect((await st())['RE-2']).toBe(false);
    w('.sdd/reverse/architecture.md', 'payments charges cards; accounts opens accounts; notify sends mail');
    expect((await st())['RE-2']).toBe(true);
    w('tests/payments.test.ts', 't');
    w('tests/accounts.test.ts', 't');
    w('.sdd/reverse/characterization.json', JSON.stringify({ accounts: ['tests/accounts.test.ts'], notify: ['tests/missing.test.ts'] }));
    expect((await reverseStages(cwd, 'base')).stages[2].unmet.join()).toContain('critical module payments');
    w('.sdd/reverse/characterization.json', JSON.stringify({ accounts: ['tests/accounts.test.ts'], payments: ['tests/payments.test.ts'] }));
    expect((await st())['RE-3']).toBe(true);
    w('.sdd/reverse/rules.md', '- RULE-PAY-001 [payments] refunds within 30 days — inferred\n- RULE-ACC-001 [accounts] one account per id — inferred\n');
    expect((await st())['RE-4']).toBe(false);
    w('.sdd/reverse/rules.md', '- RULE-PAY-001 [payments] refunds within 30 days — inferred\n- RULE-ACC-001 [accounts] one account per id — inferred\n- NONE [notify] no business rules — confirmed by Ana\n');
    expect(await st()).toMatchObject({ 'RE-4': true, 'RE-5': false });
    expect((await reverseStages(cwd, 'base')).stages[4].unmet.join()).toContain('RULE-PAY-001 on critical module payments');
  });
  it('a later stage is never done while an earlier one is open', async () => {
    src();
    await initInventory(cwd);
    w('.sdd/reverse/rules.md', '- NONE [payments] none — confirmed by Ana\n- NONE [accounts] none — confirmed by Ana\n- NONE [notify] none — confirmed by Ana\n');
    const r = await reverseStages(cwd);
    expect(r.stages[3].done).toBe(false);
    expect(r.stages[3].unmet[0]).toContain('RE-3');
  });
  it('confirm needs a listed person of this git identity and --confirm from an agent session', async () => {
    src();
    await initInventory(cwd);
    w('.sdd/reverse/rules.md', '- RULE-PAY-001 [payments] refunds within 30 days — inferred\n');
    w('.sdd/settings/approvers.json', JSON.stringify({ approvers: [{ name: 'Ana', email: 'ana@x.test' }] }));
    expect((await run('reverse', 'confirm', 'RULE-PAY-001', '--by', 'Bob')).out).toContain('APPROVER_NOT_LISTED');
    expect((await run('reverse', 'confirm', 'RULE-PAY-001', '--by', 'Ana')).out).toContain('AGENT_SESSION');
    expect((await run('reverse', 'confirm', 'RULE-PAY-001', '--by', 'Ana', '--confirm', 'RULE-PAY-001')).code).toBe(0);
    expect(readFileSync(path.join(cwd, '.sdd/reverse/rules.md'), 'utf8')).toMatch(/— confirmed by Ana \(\d{4}-\d{2}-\d{2}\)/);
    expect((await run('reverse', 'confirm', 'RULE-PAY-001', '--by', 'Ana', '--confirm', 'RULE-PAY-001')).code).toBe(1);
  });
  it('the engine refuses to complete a reverse step whose stage is open', async () => {
    src();
    await run('start', 'reverse engineer the billing system', '--feature', 'rev');
    const step = async (id: string) => {
      if (!(await readPack(cwd, 'rev', id))) await writePack(cwd, { feature: 'rev', step: id, use: 'x', consumes: [], goal: id, budget: 8000 });
      await recordRecall(cwd, 'rev', id, checkRecall((await readPack(cwd, 'rev', id))!, id));
      await report(cwd, 'rev', id, 'started');
      return report(cwd, 'rev', id, 'completed');
    };
    const early = await step('inventory');
    expect(early.ok).toBe(false);
    expect(early.message).toContain('REVERSE_STAGE_OPEN');
    await initInventory(cwd);
    expect((await report(cwd, 'rev', 'inventory', 'completed')).ok).toBe(true);
    expect((await step('architecture')).message).toContain('RE-2');
  });
  it('status, next and mermaid render the stages', async () => {
    src();
    await run('reverse', 'init');
    expect((await run('reverse', 'next')).out).toContain('RE-2 architecture');
    expect((await run('reverse', 'status', '--mermaid')).out.startsWith('flowchart LR')).toBe(true);
    expect(JSON.parse((await run('reverse', 'status', '--json')).out).stages).toHaveLength(6);
  });
});

describe('every flavour starts: level × variant × rigor', () => {
  const INTENTS: Record<string, string> = {
    L0: 'fix typo in README',
    L1: 'prototype voice search',
    L2: 'add CSV export to reports',
    L3: 'build an app for field technicians',
    L4: 'platform with onboarding, billing and notifications',
    L5: 'split billing into 3 microservices',
  };
  const combos = Object.keys(INTENTS).flatMap((l) => ['greenfield', 'brownfield'].flatMap((v) => ['tiny-spec', 'spec-first', 'spec-anchored', 'spec-as-code'].map((r) => [l, v, r])));
  it.each(combos)('%s · %s · %s starts a run whose playbook passes the checker', async (level, variant, rigor) => {
    const r = await run('start', INTENTS[level], '--variant', variant, '--rigor', rigor, '--feature', 'f', '--json');
    expect(r.code, r.out).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.level).toBe(level);
    const order = ['tiny-spec', 'spec-first', 'spec-anchored', 'spec-as-code'];
    expect(order.indexOf(j.rigor)).toBeGreaterThanOrEqual(order.indexOf(rigor === 'tiny-spec' ? j.rigor : rigor));
    expect((await readState(cwd, 'f'))?.steps.length).toBeGreaterThan(0);
  });
});
