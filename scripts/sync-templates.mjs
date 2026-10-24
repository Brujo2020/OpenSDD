#!/usr/bin/env node
/**
 * One source for what is identical everywhere (sprint 3, point 10 of docs/REVISION-EXPERTO.md).
 *
 *   - Skills listed in templates/agents/_shared/shared-skills.json: edited ONLY in _shared/skills,
 *     copied to every agent tree.
 *   - The always-on rules: edited ONLY in templates/shared/always-on-rules.md, written between the
 *     `open-sdd:rules` markers of every quickstart (CLAUDE.md, AGENTS.md, GEMINI.md, QWEN.md).
 *     Installed commands read the same file (core/commandTemplates.ts).
 *
 * Usage: node scripts/sync-templates.mjs [--check] [--root <repo>]
 *   --check  write nothing; exit 1 and list every file that drifted from its source.
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const check = args.includes('--check');
const rootArg = args.indexOf('--root');
const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = path.join(root, 'tools', 'open-sdd', 'templates');
const agentsDir = path.join(T, 'agents');
const drift = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// 1 · shared skills
const { skills } = JSON.parse(readFileSync(path.join(agentsDir, '_shared', 'shared-skills.json'), 'utf8'));
const trees = readdirSync(agentsDir).filter((a) => a !== '_shared' && existsSync(path.join(agentsDir, a, 'skills')));
for (const skill of skills) {
  const src = path.join(agentsDir, '_shared', 'skills', skill);
  for (const agent of trees) {
    const dst = path.join(agentsDir, agent, 'skills', skill);
    for (const file of walk(src)) {
      const target = path.join(dst, path.relative(src, file));
      const same = existsSync(target) && readFileSync(target).equals(readFileSync(file));
      if (same) continue;
      drift.push(path.relative(root, target));
      if (!check) cpSync(file, target, { recursive: true });
    }
    // A file removed from the source must disappear from every copy, or the copies keep it forever.
    if (existsSync(dst)) {
      const expected = new Set(walk(src).map((f) => path.relative(src, f)));
      for (const extra of walk(dst).filter((f) => !expected.has(path.relative(dst, f)))) {
        drift.push(`${path.relative(root, extra)} (not in the source)`);
        if (!check) rmSync(extra);
      }
    }
  }
}

// 2 · always-on rules in the quickstarts
const START = /<!-- open-sdd:rules:start[^\n]*-->\r?\n/;
const END = '<!-- open-sdd:rules:end -->';
const lf = (t) => t.replace(/\r\n/g, '\n');
const rules = lf(readFileSync(path.join(T, 'shared', 'always-on-rules.md'), 'utf8'));
for (const agent of readdirSync(agentsDir)) {
  const docs = path.join(agentsDir, agent, 'docs');
  if (!existsSync(docs)) continue;
  for (const name of readdirSync(docs)) {
    const file = path.join(docs, name);
    const raw = readFileSync(file, 'utf8');
    // A CRLF checkout is the same text: compare in LF and write back with the file's own endings.
    const crlf = raw.includes('\r\n');
    const text = lf(raw);
    const m = text.match(START);
    const endAt = text.indexOf(END);
    if (!m || endAt < 0) {
      drift.push(`${path.relative(root, file)} (no rules markers)`);
      continue;
    }
    const from = m.index + m[0].length;
    if (text.slice(from, endAt) === rules) continue;
    drift.push(path.relative(root, file));
    const next = text.slice(0, from) + rules + text.slice(endAt);
    if (!check) writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next);
  }
}

if (drift.length === 0) {
  console.log('sync-templates: every copy matches its source.');
  process.exit(0);
}
console.log(`sync-templates: ${drift.length} file(s) ${check ? 'drifted from their source' : 'synced'}:`);
for (const d of drift) console.log(`  ${d}`);
process.exit(check ? 1 : 0);
