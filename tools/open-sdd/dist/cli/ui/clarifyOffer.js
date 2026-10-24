import { planClarify } from '../../core/clarify.js';
import { colors } from './colors.js';
import { isInteractive, isPromptDisabled, promptConfirm } from './prompt.js';
export const offerClarify = async (io, root, feature, args) => {
    if (args.includes('--json') || args.includes('--quiet'))
        return 0;
    let questions;
    try {
        questions = (await planClarify({ cwd: root, feature })).questions;
    }
    catch {
        return 0;
    }
    if (questions.length === 0)
        return 0;
    const codes = [...new Set(questions.map((q) => q.code))].join(', ');
    const command = `open-sdd brownfield clarify ${feature}`;
    io.log('');
    io.log(colors.yellow(`  ⚠ ${questions.length} requisito(s) ambiguo(s) en «${feature}» (${codes}): un agente los rellenaría inventando.`));
    if (!isInteractive() || isPromptDisabled() || args.includes('--yes') || args.includes('-y')) {
        io.log(`  → clarifica antes de diseñar: ${command}`);
        return questions.length;
    }
    if (await promptConfirm('  ¿Ejecutar clarify ahora?', true)) {
        const { handleBrownfieldCommand } = await import('../commands/brownfield.js');
        await handleBrownfieldCommand(['clarify', feature, '--write'], io, root);
    }
    else {
        io.log(`  → cuando quieras: ${command}`);
    }
    return questions.length;
};
