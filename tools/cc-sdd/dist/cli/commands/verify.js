import { colors, formatHeading, formatSuccess } from '../ui/colors.js';
import { getSpecStatus, resolveSddDir } from '../../core/specManager.js';
export const handleVerifyCommand = async (argv, io, cwd = process.cwd()) => {
    const isJson = argv.includes('--json');
    const sddDirArg = argv.find((a) => a.startsWith('--sdd-dir='));
    const sddDir = sddDirArg ? sddDirArg.split('=')[1] : await resolveSddDir(cwd);
    const featureArg = argv.find((a) => !a.startsWith('-'));
    if (!featureArg) {
        io.error(colors.red('Usage: open-sdd verify <feature-slug> [--json]'));
        return 1;
    }
    const status = await getSpecStatus(cwd, featureArg, sddDir);
    if (!status.exists) {
        io.error(colors.red(`Spec "${featureArg}" not found.`));
        return 1;
    }
    const allTasksDone = status.tasks.total > 0 && status.tasks.completed === status.tasks.total;
    const isApproved = status.isApproved;
    const passed = allTasksDone && isApproved;
    if (isJson) {
        io.log(JSON.stringify({ feature: featureArg, passed, allTasksDone, isApproved, status }, null, 2));
        return passed ? 0 : 1;
    }
    io.log('');
    io.log(formatHeading(`Implementation Verification: ${colors.bold(featureArg)}`));
    io.log(`  Documentary Triad Approved: ${isApproved ? colors.green('YES') : colors.yellow('NO')}`);
    io.log(`  Tasks Completion:           ${allTasksDone ? colors.green(`100% (${status.tasks.completed}/${status.tasks.total})`) : colors.yellow(`${status.tasks.percent}% (${status.tasks.completed}/${status.tasks.total})`)}`);
    if (passed) {
        io.log('');
        io.log(formatSuccess(`Verification GATE PASSED for "${featureArg}". Ready for PR & release.`));
        io.log('');
        return 0;
    }
    else {
        io.log('');
        io.log(colors.yellow(`Verification GATE FAILED: Ensure all tasks in tasks.md are completed [x] and specs are approved.`));
        io.log('');
        return 1;
    }
};
