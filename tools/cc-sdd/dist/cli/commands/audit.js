import { colors, formatHeading } from '../ui/colors.js';
import { auditAll, auditFeature } from '../../core/auditEngine.js';
import { resolveSddDir } from '../../core/specManager.js';
export const handleAuditCommand = async (argv, io, cwd = process.cwd()) => {
    const isJson = argv.includes('--json');
    const isRegulatory = argv.includes('--regulatory');
    const isStrict = argv.includes('--strict') || argv.some((a) => a === '--mode=strict');
    const mode = isStrict ? 'strict' : undefined;
    const sddDirArg = argv.find((a) => a.startsWith('--sdd-dir='));
    const sddDir = sddDirArg ? sddDirArg.split('=')[1] : await resolveSddDir(cwd);
    const featureArg = argv.find((a) => !a.startsWith('-'));
    if (featureArg) {
        const result = await auditFeature(cwd, featureArg, { regulatory: isRegulatory, sddDir, mode });
        if (isJson) {
            io.log(JSON.stringify(result, null, 2));
            return result.inSync ? 0 : 1;
        }
        io.log('');
        io.log(formatHeading(`Open-SDD Compliance Audit: ${colors.bold(featureArg)}`));
        io.log(`  Governance:        ${isStrict ? colors.yellow('STRICT (Enterprise / Sovereign)') : colors.green('FLUID (Modo Libre: Fast-flow, non-blocking)')}`);
        io.log(`  Health Score:      ${result.score >= 80 ? colors.green(`${result.score}/100`) : colors.yellow(`${result.score}/100`)}`);
        io.log(`  Status:            ${result.inSync ? colors.green('IN_SYNC') : colors.red('ISSUES_DETECTED')}`);
        io.log(`  Architectural Drift: ${result.driftDetected ? colors.yellow('DRIFT DETECTED') : colors.green('NONE')}`);
        if (result.regulatory) {
            io.log('');
            io.log(formatHeading('Regulatory Assessment:'));
            io.log(`  EU AI Act Art. 11 (Technical Documentation): ${result.regulatory.euAiActArt11 ? colors.green('PASS') : colors.red('FAIL')}`);
            io.log(`  EU AI Act Art. 12 (Traceability & Logs):    ${result.regulatory.euAiActArt12 ? colors.green('PASS') : colors.red('FAIL')}`);
            io.log(`  EU AI Act Art. 14 (Human Oversight Gate):   ${result.regulatory.euAiActArt14 ? colors.green('PASS') : colors.red('FAIL')}`);
            io.log(`  NIST AI RMF Invariant Alignment:            ${result.regulatory.nistAiRmf ? colors.green('PASS') : colors.red('FAIL')}`);
            io.log(`  Compliance Index:                           ${colors.cyan(`${result.regulatory.compliancePercent}%`)}`);
        }
        if (result.rtm.length > 0) {
            io.log('');
            io.log(formatHeading(`Requirements Traceability Matrix (RTM):`));
            for (const entry of result.rtm) {
                const check = entry.verified ? colors.green('✓') : colors.dim('○');
                const tasksStr = entry.mappedTasks.length > 0 ? colors.cyan(entry.mappedTasks.join(', ')) : colors.yellow('NO TASKS');
                io.log(`  ${check} ${colors.bold(entry.requirementId)}: ${entry.title.slice(0, 35).padEnd(36)} → Tasks: [${tasksStr}]`);
            }
        }
        if (result.issues.length > 0) {
            io.log('');
            io.log(formatHeading(`Audit Findings (${result.issues.length}):`));
            for (const issue of result.issues) {
                const prefix = issue.severity === 'critical' ? colors.red('[CRITICAL]') : issue.severity === 'warning' ? colors.yellow('[WARNING]') : colors.dim('[INFO]');
                io.log(`  ${prefix} ${colors.bold(issue.code)}: ${issue.message}`);
            }
        }
        io.log('');
        return result.inSync ? 0 : 1;
    }
    // Project-wide audit
    const projectResult = await auditAll(cwd, { regulatory: isRegulatory, sddDir });
    if (isJson) {
        io.log(JSON.stringify(projectResult, null, 2));
        return projectResult.projectInSync ? 0 : 1;
    }
    io.log('');
    io.log(formatHeading(`Open-SDD Project-Wide Audit`));
    io.log(`  Overall Health Score: ${projectResult.overallScore >= 80 ? colors.green(`${projectResult.overallScore}/100`) : colors.yellow(`${projectResult.overallScore}/100`)}`);
    io.log(`  Project Alignment:    ${projectResult.projectInSync ? colors.green('ALL SPECS IN SYNC') : colors.yellow('DRIFT OR GAPS DETECTED')}`);
    io.log(`  Audited Specs:        ${projectResult.features.length}`);
    io.log('');
    for (const f of projectResult.features) {
        const statusStr = f.inSync ? colors.green('PASS') : colors.yellow('ATTENTION');
        io.log(`  • ${colors.bold(f.feature.padEnd(25))} Score: ${f.score}/100 [${statusStr}]`);
    }
    io.log('');
    return projectResult.projectInSync ? 0 : 1;
};
