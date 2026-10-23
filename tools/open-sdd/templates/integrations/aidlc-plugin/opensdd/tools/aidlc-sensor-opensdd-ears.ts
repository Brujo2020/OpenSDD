// aidlc-sensor-opensdd-ears.ts — opensdd plugin sensor (advisory). Self-contained: imports only node built-ins.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const out = (pass: boolean, findings: string[]): never => {
  process.stdout.write(`${JSON.stringify({ pass, findings_count: findings.length, findings })}\n`);
  process.exit(0);
};

const outputPath = (argv: string[]): string => {
  const i = argv.indexOf("--output-path");
  return i >= 0 ? (argv[i + 1] ?? "") : "";
};

const cli = (): string[] | null => {
  const env = process.env.OPEN_SDD_CLI;
  if (env && existsSync(env)) return ["node", env];
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["open-sdd"], { encoding: "utf8" });
  return which.status === 0 ? ["open-sdd"] : null;
};

try {
  const p = outputPath(process.argv.slice(2));
  if (!(/requirements[^/]*\.md$/i.test(p) && existsSync(p))) out(true, []);
  const c = cli();
  if (!c) out(false, ["open-sdd CLI not found: set OPEN_SDD_CLI or install @brujo2020/open-sdd (fail closed)"]);
  const [bin, ...pre] = c as string[];
  const r = spawnSync(bin, [...pre, "assist", "ears", "--file", p, "--no-footer"], { encoding: "utf8", timeout: 25_000 });
  const lines = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").map((l) => l.trim()).filter(Boolean);
  if (r.status === 0) out(true, []);
  const findings = lines.filter((l) => /^[?!~-]|error|FAIL|bloque|por confirmar|falta/i.test(l)).slice(0, 20);
  out(false, findings.length ? findings : [`open-sdd exited ${r.status}`]);
} catch (e) {
  out(false, [`aidlc-sensor-opensdd-ears: ${errorMessage(e)}`]);
}
