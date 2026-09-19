import type { CliIO } from '../io.js';
import { colors, formatHeading } from '../ui/colors.js';
import { getSpecStatus, listSpecs, resolveSddDir } from '../../core/specManager.js';

export const handleStatusCommand = async (
  argv: string[],
  io: CliIO,
  cwd: string = process.cwd(),
): Promise<number> => {
  const isJson = argv.includes('--json');
  const sddDirArg = argv.find((a) => a.startsWith('--sdd-dir='));
  const sddDir = sddDirArg ? sddDirArg.split('=')[1] : await resolveSddDir(cwd);

  const featureArg = argv.find((a) => !a.startsWith('-'));

  if (featureArg) {
    const status = await getSpecStatus(cwd, featureArg, sddDir);
    if (!status.exists) {
      if (isJson) {
        io.log(JSON.stringify({ error: `Spec "${featureArg}" not found`, exists: false }, null, 2));
      } else {
        io.error(colors.red(`No spec found for "${featureArg}". Check available specs with: open-sdd status`));
      }
      return 1;
    }

    if (isJson) {
      io.log(JSON.stringify(status, null, 2));
      return 0;
    }

    io.log('');
    io.log(formatHeading(`Specification: ${colors.bold(status.name)}`));
    io.log(`  Phase:        ${colors.cyan(status.phase)}`);
    io.log(`  Approved:     ${status.isApproved ? colors.green('✓ YES') : colors.yellow('✗ NO')}`);
    io.log(`  Requirements: ${status.requirementsCount} defined`);
    
    // Task progress bar
    const { total, completed, inProgress, pending, percent } = status.tasks;
    const barLength = 20;
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;
    const bar = colors.green('█'.repeat(filled)) + colors.dim('░'.repeat(empty));
    io.log(`  Tasks:        [${bar}] ${percent}% (${completed}/${total} done, ${inProgress} active, ${pending} pending)`);

    io.log(`  Triad Files:  ` + [
      status.files.requirements ? colors.green('reqs: ✓') : colors.dim('reqs: ✗'),
      status.files.design ? colors.green('design: ✓') : colors.dim('design: ✗'),
      status.files.tasks ? colors.green('tasks: ✓') : colors.dim('tasks: ✗'),
      status.files.auditReport ? colors.green('audit: ✓') : colors.dim('audit: ✗'),
    ].join(' | '));

    if (status.boundaries.length > 0) {
      io.log(`  Boundaries:   ${status.boundaries.slice(0, 4).join(', ')}${status.boundaries.length > 4 ? ` (+${status.boundaries.length - 4} more)` : ''}`);
    }
    io.log('');
    return 0;
  }

  // List all specs
  const specs = await listSpecs(cwd, sddDir);
  if (specs.length === 0) {
    if (isJson) {
      io.log(JSON.stringify({ specs: [], count: 0 }, null, 2));
    } else {
      io.log('');
      io.log(colors.yellow(`No specifications found in ${sddDir}/specs/.`));
      io.log(`Start a new spec with: ${colors.bold('open-sdd init <feature-name>')}`);
      io.log(`Or bootstrap legacy code with: ${colors.bold('open-sdd getspecs')}`);
      io.log('');
    }
    return 0;
  }

  const statuses = await Promise.all(specs.map((s) => getSpecStatus(cwd, s, sddDir)));

  if (isJson) {
    io.log(JSON.stringify(statuses, null, 2));
    return 0;
  }

  io.log('');
  io.log(formatHeading(`Active Specifications (${specs.length}):`));
  io.log(`  ${'Feature'.padEnd(25)} ${'Phase'.padEnd(18)} ${'Progress'.padEnd(12)} ${'Approved'}`);
  io.log(`  ${'─'.repeat(25)} ${'─'.repeat(18)} ${'─'.repeat(12)} ${'─'.repeat(8)}`);

  for (const s of statuses) {
    const nameStr = s.name.length > 24 ? s.name.slice(0, 21) + '...' : s.name;
    const progressStr = `${s.tasks.percent}% (${s.tasks.completed}/${s.tasks.total})`;
    const approvedStr = s.isApproved ? colors.green('YES') : colors.yellow('NO');
    io.log(`  ${colors.bold(nameStr.padEnd(25))} ${colors.cyan(s.phase.padEnd(18))} ${progressStr.padEnd(12)} ${approvedStr}`);
  }
  io.log('');
  return 0;
};
