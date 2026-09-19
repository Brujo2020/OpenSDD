import type { CliIO } from '../io.js';
import { colors, formatHeading, formatSuccess } from '../ui/colors.js';
import { initSpec, resolveSddDir } from '../../core/specManager.js';

export const handleInitCommand = async (
  argv: string[],
  io: CliIO,
  cwd: string = process.cwd(),
): Promise<number> => {
  const featureArg = argv.find((a) => !a.startsWith('-'));

  if (!featureArg) {
    io.error(colors.red('Usage: open-sdd init <feature-slug> [--title="..."] [--lang=en] [--git]'));
    return 1;
  }

  const titleArg = argv.find((a) => a.startsWith('--title='));
  const title = titleArg ? titleArg.split('=')[1].replace(/^["']|["']$/g, '') : undefined;

  const langArg = argv.find((a) => a.startsWith('--lang='));
  const language = langArg ? langArg.split('=')[1] : 'en';

  const createBranch = argv.includes('--git');

  try {
    const sddDir = await resolveSddDir(cwd);
    const result = await initSpec(cwd, featureArg, {
      title,
      language,
      sddDir,
      createBranch,
    });

    io.log('');
    io.log(formatSuccess(`Initialized specification for "${colors.bold(featureArg)}"`));
    io.log(`  Directory: ${colors.cyan(result.specDir)}`);
    if (result.branchCreated && result.branchName) {
      io.log(`  Git Branch: ${colors.green(`Switched to ${result.branchName}`)}`);
    }

    io.log('');
    io.log(formatHeading('Next Actions:'));
    io.log(`  1. Edit requirements in: ${colors.dim(`${result.specDir}/requirements.md`)}`);
    io.log(`  2. In your agent chat, run: ${colors.bold(`/sdd-spec-requirements ${featureArg}`)}`);
    io.log(`  3. Check status anytime with: ${colors.bold(`open-sdd status ${featureArg}`)}`);
    io.log('');
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    io.error(colors.red(`Error: ${msg}`));
    return 1;
  }
};
