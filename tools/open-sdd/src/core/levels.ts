/**
 * The level ladder (REQ-MK-001, REQ-MK-002): how much ceremony a piece of work deserves, decided
 * deterministically from the intent and the workspace, each decision with the words that caused it.
 *
 *   L0 tiny          a typo, a rename, a version bump            → playbook `tiny`, minimal ceremony
 *   L1 PoC           spike, prototype, demo, experiment          → `spike` / `poc-to-feature`, minimal
 *   L2 feature       one change to a product (bug, refactor too) → `bug` | `refactor` | `brownfield-extension` | `base/spec-first`
 *   L3 small project a new app or service from scratch           → `greenfield`
 *   L4 medium        several features                            → `multi-feature`
 *   L5 large         several services, repositories or units     → `multi-unit`, strict ceremony
 *   L6 modernization a legacy portfolio moving to a new platform → `modernize`, strict ceremony
 *
 * Risk only ever raises the level: a "tiny" change to authentication is a feature, and a PoC that
 * touches personal data is governed like one. Adding a risk or scale word never lowers the result.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Ceremony } from './engine.js';
import { intentSignals } from './playbookPlanner.js';
import type { ProjectProfile } from './profile.js';
import { profileValues } from './profile.js';

export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = {
  L0: 'tiny',
  L1: 'PoC',
  L2: 'feature',
  L3: 'small project',
  L4: 'medium',
  L5: 'large / multi-unit',
  L6: 'modernization',
};
export const rank = (l: string): number => Math.max(0, LEVELS.indexOf(l as Level));
export const ceremonyFor = (l: Level): Ceremony => (rank(l) <= 1 ? 'minimal' : rank(l) <= 4 ? 'standard' : 'strict');

const RULES: { level: Level; id: string; re: RegExp }[] = [
  { level: 'L6', id: 'modernize-words', re: /\b(moderni[sz]\w*|mainframe|cobol|legacy (?:system|platform|portfolio)|portfolio migration|migrate (?:the )?(?:portfolio|estate|data ?center)|monolith to microservices|7 ?rs|strangler)\b/i },
  { level: 'L1', id: 'poc-words', re: /\b(poc|proof of concept|prototype|spike|experiment|demo|hackathon|mvp|try out|playground)\b/i },
  { level: 'L0', id: 'tiny-words', re: /\b(typo|rename|bump|readme|changelog|comment|docstring|lint|format(?:ting)?|copy ?change|one[- ]line|tiny|spelling|version number|update (?:the )?docs?)\b/i },
  { level: 'L3', id: 'new-project-words', re: /\b(from scratch|new (?:app|application|service|project|product|api)|greenfield|build an? (?:app|service|tool|api)|bootstrap a)\b/i },
  { level: 'L4', id: 'several-features-words', re: /\b(platform|several features|multiple features|roadmap|release with|epic)\b/i },
];

export type Variant = 'greenfield' | 'brownfield';
export const RIGORS = ['tiny-spec', 'spec-first', 'spec-anchored', 'spec-as-source'] as const;
export type Rigor = (typeof RIGORS)[number];
/** `spec-as-code` is accepted as a synonym of `spec-as-source`. */
export const normalizeRigor = (r: string): Rigor | null => (r === 'spec-as-code' ? 'spec-as-source' : (RIGORS as readonly string[]).includes(r) ? (r as Rigor) : null);
/** The least rigor a level accepts (REQ-VR-005): risk and scale only raise it. */
export const rigorFloor = (l: Level): Rigor => (rank(l) <= 1 ? 'tiny-spec' : rank(l) <= 4 ? 'spec-first' : 'spec-anchored');

const BROWN_WORDS = /\b(existing|legacy|current (?:system|code|app)|in production|brownfield|our (?:app|system|codebase))\b/i;
const GREEN_WORDS = /\b(from scratch|greenfield|brand[- ]new|new (?:app|application|service|project|product))\b/i;
export const REVERSE_WORDS = /\b(reverse[- ]engineer\w*|recover (?:the )?(?:architecture|specs?|rules)|document (?:the )?(?:legacy|existing)|understand (?:the )?(?:legacy|existing) (?:system|code))\b/i;

/** Intent words first, then the workspace (REQ-VR-001). */
export const variantOf = (intent: string, profile?: ProjectProfile): { variant: Variant; reason: string } => {
  const b = intent.match(BROWN_WORDS);
  if (b) return { variant: 'brownfield', reason: `intent «${b[0]}»` };
  const g = intent.match(GREEN_WORDS);
  if (g) return { variant: 'greenfield', reason: `intent «${g[0]}»` };
  const v = profile ? profileValues(profile) : {};
  return v.terrain === 'brownfield' ? { variant: 'brownfield', reason: 'workspace has source code' } : { variant: 'greenfield', reason: profile ? 'workspace has no source yet' : 'no workspace signal' };
};

export interface LevelDecision {
  level: Level;
  label: string;
  ceremony: Ceremony;
  variant: Variant;
  variantReason: string;
  rigor: Rigor;
  playbook: string;
  evidence: string[];
  raisedBy: string[];
  warnings: string[];
}

const BUG = /\b(fix|bug|broken|regression|defect|crash)\b/i;
const REFACTOR = /\b(refactor|clean ?up|simplify|restructure)\b/i;
const THEN_FEATURE = /\b(then|if it works|graduate|promote|turn into)\b/i;

export const playbookFor = (level: Level, intent: string, profile?: ProjectProfile, variant: Variant = variantOf(intent, profile).variant): string => {
  const v = profile ? profileValues(profile) : {};
  const brown = variant === 'brownfield';
  if (REVERSE_WORDS.test(intent) && rank(level) >= 2 && level !== 'L6') return 'reverse-engineering';
  switch (level) {
    case 'L0':
      return 'tiny';
    case 'L1':
      return THEN_FEATURE.test(intent) ? 'poc-to-feature' : brown ? 'poc-brownfield' : 'spike';
    case 'L2':
      if (BUG.test(intent)) return 'bug';
      if (REFACTOR.test(intent)) return 'refactor';
      if (brown) return v.tests === false ? 'legacy-untested' : 'brownfield-extension';
      return 'base/spec-first';
    case 'L3':
      return brown ? 'project-brownfield' : 'greenfield';
    case 'L4':
      return brown ? 'multi-feature-brownfield' : 'multi-feature';
    case 'L5':
      return brown ? 'multi-unit' : 'multi-unit-greenfield';
    default:
      return 'modernize';
  }
};

/** Deterministic: same intent and profile → same decision. */
export const classifyLevel = (intent: string, profile?: ProjectProfile, cwd?: string): LevelDecision => {
  const evidence: string[] = [];
  const raisedBy: string[] = [];
  const warnings: string[] = [];
  const signals = intentSignals(intent);
  const v = profile ? profileValues(profile) : {};

  // Highest base level among keyword families; scale and workspace signals can only raise it.
  let level: Level = 'L2';
  let matched = false;
  for (const r of RULES) {
    const m = intent.match(r.re);
    if (!m) continue;
    evidence.push(`${r.id}: «${m[0]}»`);
    if (!matched || rank(r.level) > rank(level)) level = r.level;
    matched = true;
  }
  if (!matched) evidence.push('default: one change to a product');
  // An explicit PoC stays a PoC even when it explores a big subject ("PoC of mainframe modernization"):
  // scale and project words become warnings; only personal data raises it.
  const isPoc = RULES.find((r) => r.id === 'poc-words')!.re.test(intent);
  if (isPoc) level = 'L1';

  const raise = (to: Level, why: string) => {
    if (isPoc && to !== 'L2') {
      warnings.push(`PoC scope: ${why} — promote it (poc-to-feature / start again) when it survives`);
      return;
    }
    if (rank(to) > rank(level)) {
      level = to;
      raisedBy.push(why);
    }
  };
  if (signals.features >= 3) raise('L4', `${signals.features} features listed`);
  if (signals.units >= 2) raise('L5', `${signals.units} units named: ${signals.evidence.join(', ')}`);
  if (profile && (Number(v.repos) >= 2 || (typeof v.units === 'number' && v.units >= 2)) && rank(level) >= 2) raise('L5', `workspace: ${v.repos} repositories, units ${String(v.units)}`);
  if (cwd && existsSync(path.join(cwd, '.sdd', 'modernize', 'portfolio.json')) && /\b(migrat\w*|moderni[sz]\w*|wave|cut ?over)\b/i.test(intent)) raise('L6', 'a modernization portfolio exists in .sdd/modernize/');

  for (const r of signals.risks) {
    if (level === 'L0') raise('L2', `risk ${r.tag} («${r.evidence}»): a tiny change here is a feature`);
    else if (level === 'L1' && r.tag === 'pii') {
      level = 'L2';
      raisedBy.push(`risk pii («${r.evidence}»): a PoC with personal data is governed`);
    }
    else if (level === 'L1') warnings.push(`PoC touches ${r.tag} («${r.evidence}»): use synthetic data and keep it out of production`);
  }
  if (REVERSE_WORDS.test(intent) && rank(level) < 3 && !isPoc) {
    raisedBy.push(`reverse engineering («${intent.match(REVERSE_WORDS)![0]}») is a multi-stage project`);
    level = 'L3';
  }
  const vr = variantOf(intent, profile);
  const variant: Variant = REVERSE_WORDS.test(intent) ? 'brownfield' : vr.variant;
  return { level, label: LEVEL_LABEL[level], ceremony: ceremonyFor(level), variant, variantReason: REVERSE_WORDS.test(intent) ? 'reverse engineering is brownfield by definition' : vr.reason, rigor: rigorFloor(level), playbook: playbookFor(level, intent, profile, variant), evidence, raisedBy, warnings };
};

/** Feature id from an intent: lowercase words, at most 5, hyphenated. */
export const slugFromIntent = (intent: string): string =>
  intent
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => !['the', 'a', 'an', 'to', 'of', 'in', 'for', 'and', 'el', 'la', 'de', 'en', 'y', 'un', 'una'].includes(w))
    .slice(0, 5)
    .join('-') || 'work';

/** Requested rigor against the level floor and a declared `.sdd/settings/rigor.json` (never lowers). */
export const effectiveRigor = (level: Level, requested?: string | null, declared?: string | null): { rigor: Rigor; warnings: string[] } => {
  const order = (r: Rigor) => RIGORS.indexOf(r);
  const warnings: string[] = [];
  let rigor = rigorFloor(level);
  const d = declared ? normalizeRigor(declared) : null;
  if (d && rank(level) >= 2 && order(d) > order(rigor)) rigor = d;
  if (requested) {
    const r = normalizeRigor(requested);
    if (!r) warnings.push(`unknown rigor «${requested}»: ${RIGORS.join(', ')} (or spec-as-code)`);
    else if (order(r) < order(rigor)) warnings.push(`rigor ${r} is below the floor for ${level}${d ? ` and the declared ${d}` : ''}: using ${rigor}`);
    else rigor = r;
  }
  return { rigor, warnings };
};
