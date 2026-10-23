/**
 * EARS conversion (REQ-VR-007): free text → EARS, deterministically, in English or Spanish.
 *
 * The five patterns are recognised from the opening words (when/whenever/after/upon/cuando/al →
 * WHEN; while/during/mientras/durante → WHILE; where/if the option/donde/si está habilitado → WHERE;
 * if/in case/si/en caso de → IF … THEN), the actor and the response from the modal verb (must, should,
 * shall, will, needs to, debe, deberá, tiene que…). The fixed keywords and `shall` stay in English, as
 * `ears.ts` fixes them; the variable parts keep the author's language.
 *
 * It never invents: a vague response ("fast", "rápido", "user-friendly"), a missing actor or a missing
 * response becomes a question, not a sentence. Every proposal is re-validated by `validateEarsRequirement`
 * before it is offered.
 */
import { validateEarsRequirement, type EarsPattern } from './ears.js';

export interface Conversion {
  input: string;
  pattern: EarsPattern | null;
  proposal: string | null;
  questions: string[];
}

const MODAL = /\b(must|should|shall|will|has to|have to|needs to|need to|is required to|debe(?:rá|ría)?|deben|tiene que|tienen que|ha de|han de|necesita)\b/i;
const VAGUE = /\b(fast|quick(?:ly)?|easy|easily|simple|user[- ]friendly|intuitive|robust|efficient(?:ly)?|scalable|seamless(?:ly)?|appropriate(?:ly)?|asap|as soon as possible|as needed|etc|r[aá]pid[oa]s?|f[aá]cil(?:mente)?|intuitiv[oa]|robust[oa]|eficiente(?:mente)?|adecuad[oa]|apropiad[oa]|escalable)\b/i;
const OPENERS: { pattern: EarsPattern; re: RegExp; kw: string }[] = [
  { pattern: 'state-driven', re: /^(while|during|as long as|mientras(?: que)?|durante)\s+/i, kw: 'WHILE' },
  { pattern: 'optional', re: /^(where|if the (?:feature|option|module|setting)\b|donde|si (?:la opci[oó]n|el m[oó]dulo|la funcionalidad))\s*/i, kw: 'WHERE' },
  { pattern: 'unwanted', re: /^(if|in case(?: of)?|in the event that|si|en caso de(?: que)?)\s+/i, kw: 'IF' },
  { pattern: 'event-driven', re: /^(when|whenever|once|after|upon|as soon as|cuando|al|tras|una vez que|despu[eé]s de(?: que)?)\s+/i, kw: 'WHEN' },
];
const ARTICLE = /\b(the|a|an|el|la|los|las|un|una)\s+$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,.;]+$/g, '');

/** Split "trigger the actor" at the actor: the article (or bare name) right before the modal. */
const splitActor = (beforeModal: string): { trigger: string; actor: string } => {
  const words = beforeModal.trim().split(/\s+/);
  // Actor = last 1–4 words before the modal, starting at an article if there is one.
  for (let n = Math.min(4, words.length); n >= 1; n -= 1) {
    const cand = words.slice(-n);
    if (/^(the|el|la|los|las)$/i.test(cand[0])) return { trigger: words.slice(0, -n).join(' '), actor: cand.join(' ') };
  }
  const lastComma = beforeModal.lastIndexOf(',');
  if (lastComma >= 0) return { trigger: beforeModal.slice(0, lastComma), actor: beforeModal.slice(lastComma + 1).trim() };
  return { trigger: words.slice(0, -1).join(' '), actor: words.slice(-1).join(' ') };
};

export const convertStatement = (text: string, opts: { system?: string } = {}): Conversion => {
  const input = clean(text);
  const questions: string[] = [];
  const spanish = /\b(debe|deberá|cuando|mientras|el sistema|tiene que|si |usuario)\b/i.test(input);
  let body = input;
  let opener: (typeof OPENERS)[number] | undefined;
  for (const o of OPENERS) if (o.re.test(body)) {
    opener = o;
    body = body.replace(o.re, '');
    break;
  }
  const m = body.match(MODAL);
  if (!m || m.index === undefined) {
    const can = body.match(/\b(can|could|may|puede[n]?|podr[aá][n]?)\b/i);
    if (can) questions.push(spanish ? `«${can[0]}» expresa una posibilidad, no una obligación: ¿el sistema DEBE permitirlo? Escribe «el <sistema> debe permitir …».` : `"${can[0]}" states a possibility, not an obligation: shall the system allow it? Write "the <system> shall allow …".`);
    else questions.push(spanish ? '¿Qué DEBE hacer el sistema? Nombra el actor y la respuesta (p. ej. «el servicio de pagos debe …»).' : 'What shall the system do? Name the actor and the response (e.g. "the payment service shall …").');
    return { input, pattern: opener?.pattern ?? null, proposal: null, questions };
  }
  const before = body.slice(0, m.index);
  let response = clean(body.slice(m.index + m[0].length)).replace(/^(be able to|ser capaz de|poder)\s+/i, '');
  let trigger = '';
  let actor = '';
  if (opener) {
    const cut = before.includes(',') ? { trigger: before.slice(0, before.lastIndexOf(',')), actor: before.slice(before.lastIndexOf(',') + 1) } : splitActor(before);
    trigger = clean(cut.trigger);
    actor = clean(cut.actor).replace(ARTICLE, '');
  } else actor = clean(before);
  actor = actor.replace(/^(the|el|la|los|las)\s+/i, '');
  if (opts.system && (!actor || /^(it|ello|esto)$/i.test(actor))) actor = opts.system;
  if (!actor) questions.push(spanish ? '¿Quién es el actor (qué sistema o componente)?' : 'Who is the actor (which system or component)?');
  if (opener && !trigger) questions.push(spanish ? `¿Cuál es el disparador después de ${opener.kw}?` : `What is the trigger after ${opener.kw}?`);
  if (!response) questions.push(spanish ? '¿Cuál es la respuesta observable?' : 'What is the observable response?');
  const vague = response.match(VAGUE) ?? input.match(VAGUE);
  if (vague) questions.push(spanish ? `«${vague[0]}» no es comprobable: dilo con una cifra (p. ej. «en menos de 2 s en el p95»).` : `"${vague[0]}" is not testable: state it with a number (e.g. "within 2 s at p95").`);
  if (/\b(and|y)\b.*\b(and|y)\b/i.test(response) || /\b(and|y) (also|además|tambi[eé]n)\b/i.test(response)) questions.push(spanish ? 'Parecen dos requisitos en uno: sepáralos.' : 'This looks like two requirements in one: split them.');
  if (questions.length) return { input, pattern: opener?.pattern ?? 'ubiquitous', proposal: null, questions };
  const sys = spanish ? `el ${actor}`.replace(/^el (el|la) /i, '$1 ') : `the ${actor}`;
  response = response.replace(/\.$/, '');
  const proposal =
    opener?.pattern === 'unwanted' ? `IF ${trigger}, THEN ${sys} shall ${response}.`
    : opener ? `${opener.kw} ${trigger}, ${sys} shall ${response}.`
    : `${sys.charAt(0).toUpperCase()}${sys.slice(1)} shall ${response}.`;
  const verdict = validateEarsRequirement(proposal);
  if (!verdict.conforms) return { input, pattern: opener?.pattern ?? 'ubiquitous', proposal: null, questions: verdict.issues.map((i) => i.message) };
  return { input, pattern: verdict.pattern, proposal, questions: [] };
};
