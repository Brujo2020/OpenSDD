/**
 * Modernization status (REQ-MK-010): one model, four projections — text, JSON, Mermaid and one
 * self-contained HTML page (no script, no network) that a steering committee can open.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { listEventRecords, type EventRecord } from '../dynamicRules.js';
import { listCards } from '../hilCards.js';
import { dispositions, readOverrides, type Disposition } from './disposition.js';
import { componentState, hasSbom, readModState } from './lifecycle.js';
import { modernizeDir, readPortfolio, riskScore } from './portfolio.js';
import type { WavePlan } from './wavePlan.js';

export interface StatusRow {
  id: string;
  r: string;
  rule: string;
  risk: number;
  criticality: number;
  sensitivity: string;
  stage: string;
  frozen: string[];
  sbom: boolean;
  wave: number | null;
}

export interface ModernizeStatus {
  portfolio: string;
  feature: string | null;
  rows: StatusRow[];
  waves: WavePlan | null;
  events: { id: string; type: string; severity: string; status: 'open' | 'resolved'; steps: number; deadlineHours: number | null; proposals: string }[];
  openCards: number;
  errors: string[];
}

export const buildStatus = async (cwd: string): Promise<ModernizeStatus> => {
  const p = await readPortfolio(cwd);
  if (!p.ok || !p.portfolio) return { portfolio: '', feature: null, rows: [], waves: null, events: [], openCards: 0, errors: p.errors };
  const ds: Disposition[] = dispositions(p.portfolio, await readOverrides(cwd));
  const ms = await readModState(cwd);
  const waves = JSON.parse((await readFile(modernizeDir(cwd, 'waves.json'), 'utf8').catch(() => 'null')) as string) as WavePlan | null;
  const waveOf = (id: string) => waves?.waves.find((w) => w.components.includes(id))?.n ?? null;
  const rows = p.portfolio.components.map((c) => {
    const d = ds.find((x) => x.id === c.id)!;
    const cs = componentState(ms, c.id, d.r);
    return { id: c.id, r: d.r, rule: d.rule, risk: riskScore(c, p.portfolio!.components).score, criticality: c.criticality, sensitivity: c.sensitivity, stage: cs.stage, frozen: cs.frozen.map((f) => f.event), sbom: hasSbom(cwd, c.id), wave: waveOf(c.id) };
  });
  // Events of every run in the repository (the modernization run and any other run that received one).
  const features = [...new Set([...(ms.feature ? [ms.feature] : []), ...(await readdir(path.join(cwd, '.sdd', 'events')).catch(() => []))])].sort();
  const feature = ms.feature ?? features[0] ?? null;
  const recs: EventRecord[] = (await Promise.all(features.map((f) => listEventRecords(cwd, f)))).flat();
  const events = recs.map((r) => ({
    id: r.decision.event.id,
    type: r.decision.event.type,
    severity: r.decision.severity,
    status: r.resolvedAt ? ('resolved' as const) : ('open' as const),
    steps: r.decision.steps.length,
    deadlineHours: r.decision.deadlineHours,
    proposals: `${r.proposals.filter((x) => x.status === 'admitted').length} admitted / ${r.proposals.filter((x) => x.status === 'rejected').length} rejected`,
  }));
  const openCards = (await Promise.all(features.map(async (f) => (await listCards(cwd, f)).filter((c) => !c.answer).length))).reduce((x, y) => x + y, 0);
  return { portfolio: p.portfolio.name, feature, rows, waves, events, openCards, errors: [] };
};

export const statusText = (s: ModernizeStatus): string[] => [
  `Portfolio ${s.portfolio}${s.feature ? ` · run ${s.feature}` : ''} · ${s.openCards} open card(s)`,
  '  component              R           risk  stage            wave  flags',
  ...s.rows.map((r) => `  ${r.id.padEnd(22)} ${r.r.padEnd(11)} ${String(r.risk).padStart(4)}  ${r.stage.padEnd(16)} ${String(r.wave ?? '—').padStart(4)}  ${[r.frozen.length ? `FROZEN(${r.frozen.join(',')})` : '', r.sbom ? 'sbom' : ''].filter(Boolean).join(' ')}`),
  ...(s.events.some((e) => e.type === 'wave-start') ? [`  waves started: ${s.events.filter((e) => e.type === 'wave-start').map((e) => e.id.replace(/^wave-(\d+)-start$/, '$1')).join(', ')}`] : []),
  ...(s.events.some((e) => e.type !== 'wave-start') ? ['  events:', ...s.events.filter((e) => e.type !== 'wave-start').map((e) => `    ${e.status === 'open' ? 'OPEN    ' : 'resolved'} ${e.id} ${e.type} ${e.severity} · ${e.steps} step(s)${e.deadlineHours !== null ? ` · ${e.deadlineHours} h` : ''} · proposals ${e.proposals}`)] : []),
];

const cls: Record<string, string> = { retire: 'retire', retain: 'retain', rehost: 'move', relocate: 'move', repurchase: 'buy', replatform: 'move', refactor: 'rebuild' };

export const statusMermaid = (s: ModernizeStatus): string => {
  const id = (x: string) => x.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = [
    'flowchart LR',
    '  classDef retire fill:#f1f5f9,stroke:#64748b,color:#334155',
    '  classDef retain fill:#ede9fe,stroke:#6d28d9,color:#2e1065',
    '  classDef move fill:#dbeafe,stroke:#1d4ed8,color:#0b2559',
    '  classDef buy fill:#cffafe,stroke:#0e7490,color:#083344',
    '  classDef rebuild fill:#dcfce7,stroke:#15803d,color:#0b3a1c',
    '  classDef frozen fill:#fee2e2,stroke:#b91c1c,color:#450a0a,stroke-width:3px',
  ];
  for (const w of s.waves?.waves ?? []) {
    lines.push(`  subgraph ${id(`wave_${w.n}`)}["wave ${w.n} · ${w.kind}"]`);
    for (const c of w.components) {
      const r = s.rows.find((x) => x.id === c);
      if (r) lines.push(`    ${id(c)}["${c}<br/>${r.r} · ${r.stage}"]:::${r.frozen.length ? 'frozen' : cls[r.r]}`);
    }
    lines.push('  end');
  }
  const ws = s.waves?.waves ?? [];
  for (let i = 1; i < ws.length; i += 1) lines.push(`  ${id(`wave_${ws[i - 1].n}`)} --> ${id(`wave_${ws[i].n}`)}`);
  const retained = s.rows.filter((r) => r.r === 'retain');
  if (retained.length) {
    lines.push('  subgraph retained["retained"]');
    for (const r of retained) lines.push(`    ${id(r.id)}["${r.id}"]:::retain`);
    lines.push('  end');
  }
  return lines.join('\n');
};

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const statusHtml = (s: ModernizeStatus): string => {
  const riskColor = (n: number) => (n >= 70 ? 'hi' : n >= 40 ? 'mid' : 'lo');
  const rows = s.rows
    .map((r) => `<tr><td><b>${esc(r.id)}</b></td><td><span class="r ${cls[r.r]}">${r.r}</span><br><small>${r.rule}</small></td><td><span class="risk ${riskColor(r.risk)}">${r.risk}</span></td><td>${r.criticality}</td><td>${r.sensitivity}</td><td>${esc(r.stage)}</td><td>${r.wave ?? '—'}</td><td>${r.frozen.length ? `<span class="frz">frozen: ${esc(r.frozen.join(', '))}</span>` : ''}${r.sbom ? ' <span class="ok">SBOM</span>' : ''}</td></tr>`)
    .join('');
  const waves = (s.waves?.waves ?? []).map((w) => `<li><b>Wave ${w.n}</b> · ${w.kind}: ${w.components.map(esc).join(', ')}<br><small>${w.reasons.map(esc).join(' · ')}</small></li>`).join('');
  const events = s.events.filter((e) => e.type !== 'wave-start').map((e) => `<tr><td>${esc(e.id)}</td><td>${e.type}</td><td><span class="sev ${e.severity}">${e.severity}</span></td><td>${e.status}</td><td>${e.steps}</td><td>${e.deadlineHours ?? '—'}</td><td>${esc(e.proposals)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migration · ${esc(s.portfolio)}</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#0f172a;--mut:#64748b;--line:#e2e8f0}@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e2e8f0;--mut:#94a3b8;--line:#1e293b}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px}h1{margin:0 0 4px}.sub{color:var(--mut)}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;margin:8px 0 20px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.r,.risk,.sev,.frz,.ok{padding:1px 6px;border-radius:6px;font-weight:600}.retire{background:#e2e8f0;color:#334155}.retain{background:#ede9fe;color:#4c1d95}.move{background:#dbeafe;color:#1e3a8a}.buy{background:#cffafe;color:#155e75}.rebuild{background:#dcfce7;color:#14532d}
.risk.hi,.sev.critical,.frz{background:#fee2e2;color:#991b1b}.risk.mid,.sev.high{background:#fef3c7;color:#92400e}.risk.lo,.sev.low,.sev.medium,.ok{background:#dcfce7;color:#166534}small{color:var(--mut)}ul{padding-left:18px}</style></head>
<body><h1>Migration · ${esc(s.portfolio)}</h1><p class="sub">${s.feature ? `Run ${esc(s.feature)} · ` : ''}${s.rows.length} components · ${s.events.filter((e) => e.status === 'open' && e.type !== 'wave-start').length} open event(s) · ${s.openCards} decision(s) waiting for a person</p>
<h2>Portfolio</h2><table><thead><tr><th>Component</th><th>Disposition (7 Rs)</th><th>Risk</th><th>Crit.</th><th>Data</th><th>Stage</th><th>Wave</th><th>Flags</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Waves</h2><ul>${waves || '<li>No wave plan yet: <code>open-sdd migrate waves</code></li>'}</ul>
<h2>Events</h2>${events ? `<table><thead><tr><th>Event</th><th>Type</th><th>Severity</th><th>Status</th><th>Steps</th><th>Deadline h</th><th>Agent proposals</th></tr></thead><tbody>${events}</tbody></table>` : '<p>No events.</p>'}
<p class="sub">Generated by open-sdd. Decisions: deterministic rules (dispositions, waves, event lanes) · agent proposals only raise risk · approvals by named people.</p></body></html>
`;
};
