/**
 * Aviso de ambigüedad y oferta de clarify (REQ: «avisar cuando existan requisitos ambiguos y ofrecer
 * clarify automáticamente»). Se llama al final de los comandos que crean o revisan requisitos.
 *
 * - Sin ambigüedad: no imprime nada.
 * - Con ambigüedad: imprime cuántas y de qué tipo, y el comando exacto.
 * - En una terminal interactiva (sin `--json`, `--quiet`, `--yes` ni `--no-input`) pregunta
 *   «¿Clarificar ahora?» y, si se acepta, ejecuta `brownfield clarify <feature>` en el acto.
 * Nunca escribe nada por sí mismo: clarify escribe solo las respuestas que la persona teclea (vacío = no aplicar).
 */
import type { CliIO } from '../io.js';
import { planClarify } from '../../core/clarify.js';
import { colors } from './colors.js';
import { isInteractive, isPromptDisabled, promptConfirm } from './prompt.js';

export const offerClarify = async (io: CliIO, root: string, feature: string, args: readonly string[]): Promise<number> => {
  if (args.includes('--json') || args.includes('--quiet')) return 0;
  let questions: { code: string }[];
  try {
    questions = (await planClarify({ cwd: root, feature })).questions;
  } catch {
    return 0;
  }
  if (questions.length === 0) return 0;
  const codes = [...new Set(questions.map((q) => q.code))].join(', ');
  const command = `steelforge brownfield clarify ${feature}`;
  io.log('');
  io.log(colors.yellow(`  ⚠ ${questions.length} requisito(s) ambiguo(s) en «${feature}» (${codes}): un agente los rellenaría inventando.`));
  if (!isInteractive() || isPromptDisabled() || args.includes('--yes') || args.includes('-y')) {
    io.log(`  → clarifica antes de diseñar: ${command}`);
    return questions.length;
  }
  if (await promptConfirm('  ¿Ejecutar clarify ahora?', true)) {
    const { handleBrownfieldCommand } = await import('../commands/brownfield.js');
    await handleBrownfieldCommand(['clarify', feature, '--write'], io, root);
  } else {
    io.log(`  → cuando quieras: ${command}`);
  }
  return questions.length;
};
