/**
 * Agent proposals (REQ-MK-005): the non-deterministic part. An agent (a model) may read an advisory and
 * claim more: "it is exploited", "the CVSS is higher", "these other components are affected too". A
 * proposal is evidence-bearing input, never a verdict: it can only raise risk, it cannot name a
 * component the portfolio does not have, and it cannot clear anything — "not affected" is a person's
 * call. An admitted proposal is merged into the event and the rules run again.
 */
import { applyEvent, readEventRecord, severityOf, SEVERITIES, writeEventRecord } from '../dynamicRules.js';
import { readPortfolio } from './portfolio.js';
export const validateProposal = (p, known, current) => {
    const codes = [];
    if (!p || typeof p !== 'object' || !p.claims || typeof p.claims !== 'object' || !p.author)
        return ['BAD_SHAPE'];
    const allowed = ['exploited', 'cvss', 'severity', 'components', 'notAffected'];
    if (Object.keys(p.claims).some((k) => !allowed.includes(k)))
        codes.push('BAD_SHAPE');
    if (!Array.isArray(p.evidence) || !p.evidence.some((e) => typeof e === 'string' && e.trim().length >= 8))
        codes.push('NO_EVIDENCE');
    const c = p.claims;
    if ((c.components ?? []).some((id) => !known.has(id)))
        codes.push('UNKNOWN_COMPONENT');
    if ((c.notAffected ?? []).length)
        codes.push('NOT_A_PERSON_DECISION');
    if (c.exploited === false && current.exploited)
        codes.push('CANNOT_LOWER_RISK');
    if (c.cvss !== undefined && (typeof c.cvss !== 'number' || c.cvss < 0 || c.cvss > 10))
        codes.push('BAD_SHAPE');
    else if (c.cvss !== undefined && current.cvss !== undefined && c.cvss < current.cvss)
        codes.push('CANNOT_LOWER_RISK');
    if (c.severity !== undefined && !SEVERITIES.includes(c.severity))
        codes.push('BAD_SHAPE');
    else if (c.severity !== undefined && SEVERITIES.indexOf(c.severity) < SEVERITIES.indexOf(current.severity))
        codes.push('CANNOT_LOWER_RISK');
    const raises = (c.exploited === true && !current.exploited) ||
        (c.cvss !== undefined && (current.cvss === undefined || c.cvss > current.cvss)) ||
        (c.severity !== undefined && SEVERITIES.indexOf(c.severity) > SEVERITIES.indexOf(current.severity)) ||
        (c.components ?? []).some((id) => !current.components.includes(id));
    if (!codes.length && !raises)
        codes.push('NOTHING_NEW');
    return codes.length ? [...new Set(codes)] : ['ADMITTED'];
};
export const submitProposal = async (cwd, feature, p) => {
    const rec = await readEventRecord(cwd, feature, p?.event);
    if (!rec)
        return { codes: ['NO_EVENT'] };
    if (rec.resolvedAt)
        return { codes: ['EVENT_RESOLVED'] };
    const portfolio = await readPortfolio(cwd);
    const known = new Set(portfolio.portfolio?.components.map((c) => c.id) ?? rec.decision.event.components);
    const e = rec.decision.event;
    const codes = validateProposal(p, known, { cvss: e.cvss, severity: severityOf(e), exploited: e.exploited, components: e.components });
    const entry = { at: new Date().toISOString(), author: p?.author ?? '?', status: codes[0] === 'ADMITTED' ? 'admitted' : 'rejected', codes, claims: (p?.claims ?? {}) };
    rec.proposals.push(entry);
    await writeEventRecord(cwd, feature, rec);
    if (codes[0] !== 'ADMITTED')
        return { codes };
    const merged = {
        ...e,
        ...(p.claims.exploited ? { exploited: true } : {}),
        ...(p.claims.cvss !== undefined && (e.cvss === undefined || p.claims.cvss > e.cvss) ? { cvss: p.claims.cvss } : {}),
        ...(p.claims.severity && SEVERITIES.indexOf(p.claims.severity) > SEVERITIES.indexOf(e.severity ?? 'low') ? { severity: p.claims.severity } : {}),
        components: [...new Set([...e.components, ...(p.claims.components ?? [])])].sort(),
        evidence: [...e.evidence, ...p.evidence.map((x) => `agent ${p.author}: ${x}`)],
    };
    const apply = await applyEvent(cwd, feature, merged, { reason: `proposal by ${p.author} admitted` });
    return { codes, apply };
};
