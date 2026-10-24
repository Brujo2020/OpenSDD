/**
 * Calibration (sprint 3, point 8 of docs/REVISION-EXPERTO.md): a labelled corpus of seeded defects,
 * the detector's verdict on each case, and Cohen's κ against the labels (♻️ `metaEval.cohensKappa`).
 * A detector earns "blocking" only at κ ≥ SUBSTANTIAL_KAPPA on enough cases (♻️ PREREGISTERED_N).
 *
 * Honest limits: the corpus is synthetic and written by the same project that writes the detectors.
 * It measures agreement with OUR labels on THESE cases — a floor for real-world data, not a
 * substitute. Every case states what it seeds, so a reviewer can dispute a label.
 */
import { analyseEars } from './earsAssistant.js';
import { escalationVerdict, verifyAuditChain } from './engine.js';
import { cohensKappa, PREREGISTERED_N, SUBSTANTIAL_KAPPA } from './metaEval.js';
import { sha256 } from './questions.js';
// ── audit chain ────────────────────────────────────────────────────────────────────────────────
const chain = (events) => {
    const lines = [];
    for (const e of events)
        lines.push(JSON.stringify({ ...e, prev: sha256(lines.length ? lines[lines.length - 1] : '') }));
    return lines;
};
const baseLog = (n) => chain(Array.from({ length: n }, (_, i) => ({ at: `t${i}`, event: i % 2 ? 'GATE_REFUSED' : 'RUN_STARTED', step: 's', by: 'Ana' })));
const auditCases = () => {
    const out = [];
    for (const n of [3, 5, 8, 12]) {
        const log = baseLog(n);
        const ok = (lines) => !verifyAuditChain(lines.join('\n')).ok;
        out.push({ id: `AC-clean-${n}`, detector: 'audit-chain', defect: false, seeds: `${n} untouched chained lines`, detect: () => ok(log) });
        out.push({ id: `AC-legacy-${n}`, detector: 'audit-chain', defect: false, seeds: `${n} legacy lines without prev`, detect: () => ok(log.map((l) => { const o = JSON.parse(l); delete o.prev; return JSON.stringify(o); })) });
        out.push({ id: `AC-edit-${n}`, detector: 'audit-chain', defect: true, seeds: 'one field edited mid-log', detect: () => ok(log.map((l, i) => (i === 1 ? l.replace('"Ana"', '"Mallory"') : l))) });
        out.push({ id: `AC-delete-${n}`, detector: 'audit-chain', defect: true, seeds: 'a middle line deleted', detect: () => ok(log.filter((_, i) => i !== 1)) });
        out.push({ id: `AC-swap-${n}`, detector: 'audit-chain', defect: true, seeds: 'two lines swapped', detect: () => ok([log[0], log[2], log[1], ...log.slice(3)]) });
        out.push({ id: `AC-strip-${n}`, detector: 'audit-chain', defect: true, seeds: 'prev stripped from a later line', detect: () => ok(log.map((l, i) => { if (i !== n - 1)
                return l; const o = JSON.parse(l); delete o.prev; return JSON.stringify(o); })) });
        // Known gap (declared): truncating the tail is undetectable without an external anchor.
        out.push({ id: `AC-truncate-${n}`, detector: 'audit-chain', defect: true, seeds: 'last line removed (declared gap)', detect: () => ok(log.slice(0, -1)) });
    }
    return out;
};
// ── escalation ─────────────────────────────────────────────────────────────────────────────────
const refused = (problems) => ({ at: '', event: 'GATE_REFUSED', step: 's', detail: problems.join(' | '), problems });
const esc = (seq) => () => escalationVerdict(seq.map(refused), 's').escalate;
const escalationCases = () => {
    const A = ['ARTIFACT_MISSING: a'];
    const B = ['RECALL_MISSING: r'];
    const C = ['QUESTIONS_UNCONFIRMED: q'];
    const AB = [...A, ...B];
    const cases = [
        ['ES-single', false, 'one failure', [A]],
        ['ES-fixing', false, 'two failures, the first problem fixed', [AB, B]],
        ['ES-new', false, 'a different failure each time (2)', [A, B]],
        ['ES-three-different', false, 'three different failures', [A, B, C]],
        ['ES-shrinking', false, 'problems shrink 3 → 2 → 1', [[...AB, ...C], AB, A]],
        ['ES-same', true, 'the same failure twice', [A, A]],
        ['ES-same-pair', true, 'the same two problems twice', [AB, AB]],
        ['ES-cycle', true, 'A, B, A', [A, B, A]],
        ['ES-cycle-late', true, 'A, B, C, B', [A, B, C, B]],
        ['ES-worse', true, 'nothing fixed, one more problem', [A, AB]],
        ['ES-critical', true, 'tampered receipt at the first attempt', [['RECEIPT_TAMPERED: x']]],
        ['ES-critical-audit', true, 'broken audit chain at the first attempt', [['AUDIT_CHAIN_BROKEN: y']]],
        ['ES-budget', true, 'four different failures (more than 3)', [A, B, C, ['STALE: s']]],
        // Declared gap: an agent that fixes one artificial problem per attempt looks like progress.
        ['ES-fake-progress', true, 'padding removed one by one (declared gap)', [[...A, 'ARTIFACT_MISSING: p1', 'ARTIFACT_MISSING: p2'], [...A, 'ARTIFACT_MISSING: p1'], A]],
    ];
    return cases.map(([id, defect, seeds, seq]) => ({ id, detector: 'escalation', defect, seeds, detect: esc(seq) }));
};
// ── EARS ───────────────────────────────────────────────────────────────────────────────────────
const GOOD = [
    'WHEN a user submits the form, the system shall store the record within 2 seconds.',
    'The system shall encrypt every stored card number with AES-256.',
    'WHILE the account is locked, the system shall refuse every login attempt.',
    'IF the payment gateway times out, THEN the system shall retry once after 5 seconds.',
    'WHEN a transfer exceeds 10000 USD, the system shall require a second approver.',
    'The system shall keep audit events for 7 years.',
    'WHILE a batch is running, the system shall reject a second batch for the same account.',
    'WHEN a session is idle for 15 minutes, the system shall end it.',
];
const BAD = [
    'The system should be fast.',
    'The app must be user-friendly and intuitive.',
    'Users can export data etc.',
    'The system shall be robust and scalable as needed.',
    'The system shall handle errors appropriately.',
    'WHEN possible, the system shall try to be quick.',
    'The platform will probably support many users.',
    'It should work well on most devices.',
];
const earsCases = () => [
    ...GOOD.map((t, i) => ({ id: `EA-good-${i + 1}`, detector: 'ears', defect: false, seeds: t, detect: () => earsFires(t) })),
    ...BAD.map((t, i) => ({ id: `EA-vague-${i + 1}`, detector: 'ears', defect: true, seeds: t, detect: () => earsFires(t) })),
];
const earsFires = (statement) => {
    const r = analyseEars(`### REQ-X-001 — R\n- Statement: ${statement}\n`);
    return r.conforming < r.total || r.suggestions.length > 0;
};
export const calibrationCorpus = () => [...auditCases(), ...escalationCases(), ...earsCases()];
export const runCalibration = (cases = calibrationCorpus()) => {
    const detectors = [...new Set(cases.map((c) => c.detector))];
    return detectors.map((detector) => {
        const mine = cases.filter((c) => c.detector === detector);
        let tp = 0, tn = 0, fp = 0, fn = 0;
        const misses = [];
        const falseAlarms = [];
        for (const c of mine) {
            const fired = c.detect();
            if (c.defect && fired)
                tp += 1;
            else if (!c.defect && !fired)
                tn += 1;
            else if (fired) {
                fp += 1;
                falseAlarms.push(c.id);
            }
            else {
                fn += 1;
                misses.push(c.id);
            }
        }
        const kappa = cohensKappa({ truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn });
        const round = (x) => Math.round(x * 100) / 100;
        return {
            detector,
            n: mine.length,
            kappa,
            precision: tp + fp === 0 ? Number.NaN : round(tp / (tp + fp)),
            recall: tp + fn === 0 ? Number.NaN : round(tp / (tp + fn)),
            misses,
            falseAlarms,
            mayBlock: !Number.isNaN(kappa.kappa) && kappa.kappa >= SUBSTANTIAL_KAPPA && mine.length >= PREREGISTERED_N,
        };
    });
};
export const renderCalibration = (rows) => [
    'Calibración (corpus sintético de defectos sembrados; no sustituye datos reales):',
    ...rows.map((r) => `  ${r.detector.padEnd(12)} n=${String(r.n).padEnd(3)} κ=${Number.isNaN(r.kappa.kappa) ? 'n/a' : r.kappa.kappa.toFixed(2)} (${r.kappa.band}) · precisión ${r.precision} · recall ${r.recall} · ${r.mayBlock ? 'puede bloquear' : `consultivo (κ ≥ ${SUBSTANTIAL_KAPPA} y n ≥ ${PREREGISTERED_N} para bloquear)`}` +
        `${r.misses.length ? `\n      no detecta: ${r.misses.join(', ')}` : ''}${r.falseAlarms.length ? `\n      falsas alarmas: ${r.falseAlarms.join(', ')}` : ''}`),
];
