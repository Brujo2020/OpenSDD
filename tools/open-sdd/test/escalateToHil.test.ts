import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_FAILED_ITERATIONS, failedIterations, nextDirective, readAudit, readState, report, startRun } from '../src/core/engine.js';
import { detectProfile, profileValues } from '../src/core/profile.js';

let cwd = '';
const w = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), text);
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'hil3-'));
  w('package.json', '{"name":"x"}');
});

describe('a step that fails more than 3 iterations goes to HIL', () => {
  it('the 4th refused iteration escalates the step to a human gate', async () => {
    w('pb.playbook.json', JSON.stringify({ name: 'req', phases: [{ id: 'spec', steps: [{ use: 'opensdd:skill/sdd-spec-requirements', review: 'auto' }] }] }));
    const s = await startRun(cwd, 'f', path.join(cwd, 'pb.playbook.json'), profileValues(await detectProfile(cwd)));
    const step = s.state!.steps[0].id;
    await report(cwd, 'f', step, 'started');

    for (let i = 1; i <= MAX_FAILED_ITERATIONS; i += 1) {
      const r = await report(cwd, 'f', step, 'completed');
      expect(r.ok).toBe(false);
      expect(r.message).toContain(`failed iteration ${i}/${MAX_FAILED_ITERATIONS}`);
      expect((await readState(cwd, 'f'))!.steps[0].status).toBe('in-progress');
    }

    const last = await report(cwd, 'f', step, 'completed');
    expect(last.ok).toBe(false);
    expect(last.message).toContain('escalated to HIL');
    const after = (await readState(cwd, 'f'))!.steps[0];
    expect(after).toMatchObject({ status: 'awaiting', review: 'human' });
    expect((await nextDirective(cwd, 'f')).kind).toBe('present-gate');
    const audit = await readAudit(cwd, 'f');
    expect(audit.some((e) => e.event === 'ESCALATED_TO_HIL' && e.step === step)).toBe(true);
    // The budget restarts after the escalation: a human decides what happens next.
    expect(failedIterations(audit, step)).toBe(0);
  });
});
