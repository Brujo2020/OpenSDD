/**
 * Sprint 1 of the expert review (spec `trust-floor`): the pieces `gates run` / `check` need to close
 * the chain of trust. Everything here reuses an existing mechanism: the engine audit log and its
 * escalation policy, review receipts, and HIL cards.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { appendAudit, escalationVerdict, readAudit, verifyAuditChain, type EscalationVerdict } from './engine.js';
import { listCards, prepareCard, type DecisionCard } from './hilCards.js';
import { allReceipts, receiptFreshness } from './reviewReceipts.js';

/** The audit log that `check` writes to: one per repository, like a run with a single step. */
export const CHECK_FEATURE = '_check';
export const CHECK_STEP = 'check';

/** Every engine audit log whose hash chain is broken (REQ-TF-002). */
export const auditChainIssues = async (cwd: string): Promise<string[]> => {
  const dir = path.join(cwd, '.sdd', 'engine');
  const out: string[] = [];
  for (const name of (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.audit.jsonl')).sort()) {
    const v = verifyAuditChain(await readFile(path.join(dir, name), 'utf8'));
    if (!v.ok) out.push(`AUDIT_CHAIN_BROKEN: .sdd/engine/${name} line ${v.brokenAt} was edited or removed`);
  }
  return out;
};

/** A review receipt for the feature that still matches its bytes (REQ-TF-004). */
export const freshReviewReceipt = async (cwd: string, feature: string): Promise<boolean> => {
  for (const r of await allReceipts(cwd)) {
    if (r.feature !== feature) continue;
    if ((await receiptFreshness(cwd, r)).fresh) return true;
  }
  return false;
};

/**
 * While a `_check` card is unanswered, or answered only with `park`, the loop stays stopped: an agent
 * may park itself but cannot retry past a person (REQ-TF-005).
 */
export const checkBlock = async (cwd: string): Promise<DecisionCard | null> => {
  const cards = await listCards(cwd, CHECK_FEATURE);
  const latest = cards[cards.length - 1];
  if (!latest) return null;
  if (!latest.answer) return latest.card;
  if (latest.answer.effect !== 'park') return null;
  // Parked (by anyone, possibly the agent stopping itself): still stopped, but never a dead end — a
  // fresh card lets a person retry or accept.
  const again = await prepareCard(cwd, { ...latest.card, question: latest.card.question, evidence: latest.card.evidence });
  return again.card ?? latest.card;
};

/** CI has nobody to answer a card: there `check` neither blocks nor escalates (REQ-TF-005). */
export const escalationApplies = (env: NodeJS.ProcessEnv = process.env): boolean => !env.CI;

/** Record the outcome of a `check` run and decide whether a person must step in. */
export const recordCheckOutcome = async (
  cwd: string,
  passed: boolean,
  problems: string[],
): Promise<{ verdict?: EscalationVerdict; card?: DecisionCard }> => {
  if (passed) {
    await appendAudit(cwd, CHECK_FEATURE, { event: 'CHECK_PASSED', step: CHECK_STEP });
    return {};
  }
  await appendAudit(cwd, CHECK_FEATURE, { event: 'CHECK_FAILED', step: CHECK_STEP, detail: problems.join(' | '), problems });
  const verdict = escalationVerdict(await readAudit(cwd, CHECK_FEATURE), CHECK_STEP);
  if (!verdict.escalate) return { verdict };
  await appendAudit(cwd, CHECK_FEATURE, { event: 'ESCALATED_TO_HIL', step: CHECK_STEP, detail: `${verdict.reason}: ${verdict.why}` });
  const prepared = await prepareCard(cwd, {
    feature: CHECK_FEATURE,
    step: CHECK_STEP,
    trigger: 'repeated-failure',
    question: `check is stuck — ${verdict.why.replace(/\?/g, '')}: how do we continue?`,
    options: [
      { key: 'A', label: 'Retry with new guidance', consequence: 'check runs again with a fresh budget', effect: 'reject' },
      { key: 'B', label: 'Keep it stopped', consequence: 'check stays blocked until a person decides', effect: 'park' },
      { key: 'C', label: 'Accept as an exception', consequence: 'check runs again; the exception is recorded', effect: 'override' },
    ],
    recommend: 'A',
    default: 'B',
    evidence: [`revised -> check escalated -> ${verdict.why.replace(/\?/g, '')}`],
    deadlineHours: 24,
  });
  return { verdict, card: prepared.card };
};
