/**
 * `steelforge assist [discover|brief|ears|steering|constitution]` — one front door to the assistants
 * (spec `variants-reverse`, REQ-VR-006…008). Without a subcommand it says which assistant helps now.
 * EARS conversion and the constitution delegate to the existing engines (`earsAssistant`, `brownfield
 * specify|requirements|constitution`); discovery and steering drafts live in `core/guidedAssistants.ts`.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CliIO } from '../io.js';
import { EXIT } from './help.js';
import { handleBrownfieldCommand } from './brownfield.js';
import { convertText, nextRequirementIds } from '../../core/earsConvert.js';
import { readFile as rf } from 'node:fs/promises';
import { composeBrief, draftSteering, planDiscovery, suggestAssistants, writeDiscovery } from '../../core/guidedAssistants.js';
import { slugFromIntent } from '../../core/levels.js';

import { isInteractive } from '../ui/prompt.js';
const BOOL = new Set(['--json', '--write', '--force', '--draft', '--interview', '--accept']);
const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const n = args[at + 1];
  return n === undefined || n.startsWith('--') ? '' : n;
};
const positionals = (args: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      if (!BOOL.has(args[i]) && !args[i].includes('=') && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
};

/** Sentences or bullet lines of a free-text description. */
export const splitStatements = (text: string): string[] =>
  text
    .split(/\r?\n|(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((s) => s.length > 3);

export const handleAssistCommand = async (args: string[], io: CliIO, cwd: string): Promise<number> => {
  const json = args.includes('--json');
  const [sub, ...rest] = positionals(args);
  const show = (data: unknown, text: string[]) => io.log(json ? JSON.stringify(data, null, 2) : text.join('\n'));

  if (!sub) {
    const s = await suggestAssistants(cwd);
    show(s, ['Assistants that help now:', ...s.map((x) => `  ${x.assistant.padEnd(13)} ${x.why}\n                ${x.command}`)]);
    return EXIT.PASSED;
  }

  if (sub === 'discover') {
    const idea = rest.join(' ').trim();
    if (!idea) return (io.error('error[usage]: assist discover "<idea>" [--feature f] [--force]'), EXIT.USAGE);
    const feature = flag(args, 'feature') || slugFromIntent(idea);
    const plan = await planDiscovery(cwd, feature, idea);
    if (plan.decision.level === 'L0') {
      show({ level: 'L0' }, ['L0 tiny: no discovery needed — write the three-line tiny spec (steelforge start "' + idea + '")']);
      return EXIT.PASSED;
    }
    const wrote = await writeDiscovery(plan, args.includes('--force'));
    show({ feature, file: path.relative(cwd, plan.file), roles: plan.roles, questions: plan.questions.map((q) => ({ id: q.id, role: q.role, title: q.title })), written: wrote }, [
      `Discovery for ${feature}: level ${plan.decision.level} · ${plan.decision.variant} · ${plan.questions.length} question(s) from ${plan.roles.join(', ')}`,
      ...plan.questions.map((q) => `  ${q.id} [${q.role}] ${q.title}`),
      wrote ? `  wrote ${path.relative(cwd, plan.file)} — answer it, then: steelforge assist brief ${feature} --write` : `  ${path.relative(cwd, plan.file)} exists (use --force to regenerate)`,
    ]);
    return EXIT.PASSED;
  }

  if (sub === 'brief') {
    const feature = rest[0];
    if (!feature) return (io.error('error[usage]: assist brief <feature> [--write]'), EXIT.USAGE);
    const r = await composeBrief(cwd, feature, { write: args.includes('--write') });
    show(r, r.brief ? [r.ok ? `brief ready${args.includes('--write') ? `: ${path.relative(cwd, r.file!)}` : ' (add --write)'}` : 'brief not ready:', ...r.issues.map((i) => `  - ${i}`), ...(args.includes('--write') ? [] : ['', r.brief])] : r.issues.map((i) => `  - ${i}`));
    return r.ok ? EXIT.PASSED : EXIT.GATE_FAILED;
  }

  if (sub === 'ears') {
    if (rest[0] === 'review') {
      if (!rest[1]) return (io.error('error[usage]: assist ears review <feature>'), EXIT.USAGE);
      return handleBrownfieldCommand(['requirements', rest[1], '--suggest', ...(json ? ['--json'] : [])], io, cwd);
    }
    const file = flag(args, 'file');
    const text = file ? await rf(path.resolve(cwd, file), 'utf8').catch(() => '') : rest.join(' ').trim();
    if (!text) return (io.error('error[usage]: assist ears "<free text>" | --file notes.md [--system "<name>"] [--feature f --area A --write [--accept]] | assist ears review <feature>'), EXIT.USAGE);
    const report = convertText(splitStatements(text), { system: flag(args, 'system') || undefined });
    const feature = flag(args, 'feature');
    const lines: string[] = [];
    for (const r of report.rows) {
      const tag = r.status === 'converted' ? '✓' : r.status === 'needs-confirmation' ? '~' : '?';
      lines.push(`${tag} ${r.input}`);
      for (const p of r.proposals) lines.push(`    → ${p}  [${r.pattern}, confidence ${r.confidence}]`);
      for (const q of r.questions) lines.push(`    ? ${q}`);
      for (const n of r.notes) lines.push(`    ~ ${n}`);
    }
    let written: string[] = [];
    if (feature && args.includes('--write')) {
      const area = (flag(args, 'area') || feature.split('-')[0]).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'REQ';
      const accepted = report.rows.filter((r) => r.status === 'converted' || (r.status === 'needs-confirmation' && args.includes('--accept')));
      const reqFile = path.join(cwd, '.sdd', 'specs', feature, 'requirements.md');
      const existing = (await rf(reqFile, 'utf8').catch(() => '')) as string;
      const sentences = accepted.flatMap((r) => r.proposals.map((p) => ({ p, src: r.input })));
      const ids = nextRequirementIds(existing, area, sentences.length);
      const today = new Date().toISOString().slice(0, 10);
      const block = sentences.map((x, i) => `### ${ids[i]} — ${(x.p.split(/\bshall (?:not )?/)[1] ?? x.p).split(/\s+/).slice(0, 7).join(' ').replace(/\.$/, '')}\n- Statement: ${x.p}\n- Source: "${x.src}" (steelforge assist ears, ${today})\n`).join('\n');
      if (sentences.length) {
        await mkdir(path.dirname(reqFile), { recursive: true });
        await writeFile(reqFile, `${existing ? `${existing.replace(/\s*$/, '')}\n\n` : `# Requirements — ${feature}\n\n`}${block}`, 'utf8');
      }
      written = ids;
    }
    lines.push(`  ${report.converted} converted · ${report.needsConfirmation} to confirm (~) · ${report.questions} question(s) (?) → ${report.requirements.length} EARS requirement(s)`);
    if (written.length) lines.push(`  appended ${written.join(', ')} to .sdd/specs/${feature}/requirements.md`);
    else if (feature && args.includes('--write')) lines.push('  nothing written: answer the questions (and use --accept for the ~ rows you confirm)');
    else if (report.requirements.length) lines.push('  write them: --feature <f> --write [--area A] [--accept]');
    show({ ...report, written }, lines);
    return report.questions === 0 ? EXIT.PASSED : EXIT.GATE_FAILED;
  }

  if (sub === 'steering') {
    const d = await draftSteering(cwd);
    const dir = path.join(cwd, '.sdd', 'steering');
    const written: string[] = [];
    if (args.includes('--write')) {
      await mkdir(dir, { recursive: true });
      for (const f of d.files) {
        if (existsSync(path.join(dir, f.name)) && !args.includes('--force')) continue;
        await writeFile(path.join(dir, f.name), f.content, 'utf8');
        written.push(f.name);
      }
    }
    show({ ...d, written }, [
      ...d.files.map((f) => `  ${f.name.padEnd(13)} ${f.inferred} inferred · ${f.questions} question(s)${written.includes(f.name) ? ' · written' : ''}`),
      args.includes('--write') ? '  confirm or correct each (inferred) and answer each [NEEDS CLARIFICATION]; then: steelforge steering check' : '  plan only: add --write (existing files are kept unless --force)',
    ]);
    return EXIT.PASSED;
  }

  if (sub === 'constitution') {
    // Sin bandera y en una terminal: la entrevista guiada (pregunta, guarda y ofrece ratificar).
    const guided = args.includes('--interview') || (!args.includes('--draft') && !args.includes('--json') && isInteractive());
    const answers = args.indexOf('--answers');
    const passthrough = [
      ...args.filter((a) => ['--write', '--json'].includes(a)),
      ...(answers >= 0 && args[answers + 1] ? ['--answers', args[answers + 1]] : []),
    ];
    return handleBrownfieldCommand(['constitution', '.', guided ? '--interview' : '--draft', ...passthrough], io, cwd);
  }

  io.error('error[usage]: assist [discover|brief|ears|steering|constitution]');
  return EXIT.USAGE;
};
