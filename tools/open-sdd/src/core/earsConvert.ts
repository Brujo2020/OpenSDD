/**
 * EARS conversion (REQ-VR-007): free text → EARS, deterministically, in English or Spanish.
 *
 * Pipeline per sentence:
 *   1. pattern from the opening words — when/whenever/after/once/upon/cuando/al/tras → WHEN;
 *      while/during/mientras/durante → WHILE; where/if the option/donde → WHERE;
 *      if/in case/si/en caso de → IF … THEN;
 *   2. actor and response from the modal (must, shall, should, will, needs to, debe, deberá, tiene que…);
 *      negative modals (must not, cannot, no debe) become `shall not`;
 *   3. repairs that keep the meaning: passive with an agent ("be notified by the mailer") becomes active;
 *      a user capability ("the user must be able to…", "users can…") becomes "the <system> shall allow the
 *      user to…" and is marked for confirmation; two actions on one actor ("validate … and log …") become
 *      two requirements;
 *   4. refusals that would need invention become questions with a concrete hint: vague terms (with the
 *      measure to use), pronoun or missing actor, missing trigger or response, passive without an agent.
 *
 * The fixed keywords and `shall` stay in English, as `ears.ts` fixes them; the variable parts keep the
 * author's language. Every proposal is re-validated by `validateEarsRequirement` before it is offered.
 */
import { validateEarsRequirement, type EarsPattern } from './ears.js';

export type ConversionStatus = 'converted' | 'needs-confirmation' | 'question';

export interface Conversion {
  input: string;
  status: ConversionStatus;
  pattern: EarsPattern | null;
  /** The first proposal (kept for callers that expect one). */
  proposal: string | null;
  /** One or more EARS sentences (several when one sentence held several actions). */
  proposals: string[];
  /** Things a person must answer before anything is written. */
  questions: string[];
  /** What was rewritten and must be checked (e.g. "should" read as mandatory). */
  notes: string[];
  /** 0–100: 100 converted as-is, lowered by each repair, 0 for a question. */
  confidence: number;
}

const MODAL =
  /\b(must not|mustn't|shall not|should not|shouldn't|will not|won't|cannot|can't|may not|no debe(?:r[aá])?|no deben|no tiene que|no puede|must|should|shall|will|has to|have to|needs to|need to|is required to|are required to|debe(?:r[aá]|r[ií]a)?|deben|tiene que|tienen que|ha de|han de|necesita)\b/i;
const NEGATIVE = /^(must not|mustn't|shall not|should not|shouldn't|will not|won't|cannot|can't|may not|no )/i;
const WEAK = /^(should|will|deber[ií]a)$/i;
const CAPABILITY = /\b(can|could|may|is able to|are able to|puede[n]?|podr[aá][n]?)\b/i;

const VAGUE: { re: RegExp; hint: string }[] = [
  { re: /\b(fast|quick(?:ly)?|r[aá]pid[oa]s?|r[aá]pidamente|responsive|performant|in real[- ]time|en tiempo real)\b/i, hint: 'a latency at a percentile, e.g. "within 300 ms at p95" / "en menos de 300 ms en el p95"' },
  { re: /\b(easy|easily|simple|user[- ]friendly|intuitive|f[aá]cil(?:mente)?|intuitiv[oa]|amigable)\b/i, hint: 'a task measure, e.g. "a new user completes checkout in ≤ 3 steps"' },
  { re: /\b(secure(?:ly)?|safe(?:ly)?|segur[oa])\b/i, hint: 'the control, e.g. "encrypt card numbers with AES-256 at rest" or "require MFA"' },
  { re: /\b(scalable|escalable)\b/i, hint: 'a load, e.g. "sustain 500 requests/s with p95 ≤ 300 ms"' },
  { re: /\b(robust|reliable|highly available|robust[oa]|fiable|confiable|disponible)\b/i, hint: 'an availability or error target, e.g. "99.9 % monthly availability"' },
  { re: /\b(efficient(?:ly)?|optimal(?:ly)?|eficiente(?:mente)?|[oó]ptim[oa])\b/i, hint: 'a resource budget, e.g. "≤ 512 MB memory per instance"' },
  { re: /\b(appropriate(?:ly)?|adequate(?:ly)?|proper(?:ly)?|reasonable|adecuad[oa]|apropiad[oa]|razonable)\b/i, hint: 'the exact criterion instead of "appropriate"' },
  { re: /\b(as soon as possible|asap|timely|lo antes posible|oportunamente)\b/i, hint: 'a deadline, e.g. "within 5 minutes"' },
  { re: /\b(etc\.?|and so on|y\/o|and\/or|among others|entre otros)\b/i, hint: 'the complete list (each item may be its own requirement)' },
  { re: /\b(seamless(?:ly)?|modern|nice|bonito|moderno)\b/i, hint: 'an observable behaviour instead of a quality adjective' },
];

const OPENERS: { pattern: EarsPattern; re: RegExp; kw: string }[] = [
  { pattern: 'state-driven', re: /^(while|during|as long as|mientras(?: que)?|durante)\s+/i, kw: 'WHILE' },
  { pattern: 'optional', re: /^(where|if the (?:feature|option|module|setting|flag)\b|donde|si (?:la opci[oó]n|el m[oó]dulo|la funcionalidad|el flag))\s*/i, kw: 'WHERE' },
  { pattern: 'unwanted', re: /^(if|in case(?: of)?|in the event that|should (?=\w+ (?:fail|be))|si|en caso de(?: que)?)\s+/i, kw: 'IF' },
  { pattern: 'event-driven', re: /^(when|whenever|once|after|upon|as soon as|on|cuando|al|tras|una vez que|despu[eé]s de(?: que)?|cada vez que)\s+/i, kw: 'WHEN' },
];
/** Openers whose meaning is not plain "when": the trigger is kept but flagged. */
const LOSSY_OPENER = /^(after|once|upon|on|tras|despu[eé]s de|una vez que)\b/i;

const SPLIT_VERBS =
  /^(log|logs|record|send|notify|return|store|save|validate|display|show|reject|create|update|delete|remove|retry|lock|unlock|emit|publish|calculate|compute|generate|export|import|alert|redirect|block|allow|deny|audit|archive|enviar|registrar|notificar|devolver|guardar|almacenar|validar|mostrar|rechazar|crear|actualizar|eliminar|borrar|reintentar|bloquear|desbloquear|emitir|publicar|calcular|generar|exportar|importar|alertar|redirigir|permitir|denegar|auditar|archivar)\b/i;

const IRREGULAR: Record<string, string> = { sent: 'send', paid: 'pay', built: 'build', kept: 'keep', held: 'hold', shown: 'show', written: 'write', made: 'make', run: 'run', set: 'set', put: 'put', read: 'read', sold: 'sell', told: 'tell', given: 'give', taken: 'take', done: 'do', seen: 'see', found: 'find', locked: 'lock' };
/** notified → notify, logged → log, stored → store, rejected → reject, sent → send. */
export const baseVerb = (participle: string): string | null => {
  const w = participle.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/ied$/.test(w)) return w.replace(/ied$/, 'y');
  if (/([bdgmnprt])\1ed$/.test(w)) return w.replace(/(.)ed$/, '');
  if (/(at|iz|is|or|ar|ur|iv|os|us|uc|ag|anc|enc|ov|ir|ut|ol|ud|id|ad|ib|ok|et|av)ed$/.test(w)) return w.replace(/d$/, '');
  if (/ed$/.test(w)) return w.replace(/ed$/, '');
  return null;
};

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,.;:]+$/g, '');
const stripArticle = (s: string) => s.replace(/^(the|a|an|el|la|los|las|un|una)\s+/i, '');
const isSpanish = (s: string) => /\b(debe|deber[áa]|deben|cuando|mientras|el sistema|tiene que|usuari[oa]s?|si |en caso de|al |tras )/i.test(s);

/** Split "trigger the actor" at the actor: the article (or comma) closest to the modal. */
const splitActor = (beforeModal: string): { trigger: string; actor: string } => {
  if (beforeModal.includes(',')) {
    const i = beforeModal.lastIndexOf(',');
    return { trigger: beforeModal.slice(0, i), actor: beforeModal.slice(i + 1) };
  }
  const words = beforeModal.trim().split(/\s+/);
  for (let n = Math.min(5, words.length - 1); n >= 1; n -= 1) {
    const cand = words.slice(-n);
    if (/^(the|el|la|los|las)$/i.test(cand[0])) return { trigger: words.slice(0, -n).join(' '), actor: cand.join(' ') };
  }
  return { trigger: words.slice(0, -1).join(' '), actor: words.slice(-1).join(' ') };
};

const build = (pattern: EarsPattern | null, kw: string | undefined, trigger: string, sys: string, neg: boolean, response: string): string => {
  const shall = neg ? 'shall not' : 'shall';
  const body = `${sys} ${shall} ${response.replace(/\.$/, '')}.`;
  if (pattern === 'unwanted') return `IF ${trigger}, THEN ${body}`;
  if (kw) return `${kw} ${trigger}, ${body}`;
  return body.charAt(0).toUpperCase() + body.slice(1);
};

export const convertStatement = (text: string, opts: { system?: string } = {}): Conversion => {
  const input = clean(text);
  const es = isSpanish(input);
  const questions: string[] = [];
  const notes: string[] = [];
  let confidence = 100;
  const done = (status: ConversionStatus, pattern: EarsPattern | null, proposals: string[] = []): Conversion => ({
    input,
    status,
    pattern,
    proposal: proposals[0] ?? null,
    proposals,
    questions,
    notes,
    confidence: status === 'question' ? 0 : Math.max(10, confidence),
  });

  let body = input;
  let opener: (typeof OPENERS)[number] | undefined;
  let openerWord = '';
  for (const o of OPENERS) {
    const m = body.match(o.re);
    if (m) {
      opener = o;
      openerWord = m[1];
      body = body.slice(m[0].length);
      break;
    }
  }
  const pattern: EarsPattern = opener?.pattern ?? 'ubiquitous';
  const m = body.match(MODAL);

  // ── No modal: maybe a capability ("users can download invoices") ─────────────────────────
  if (!m || m.index === undefined) {
    const cap = body.match(CAPABILITY);
    if (cap && cap.index !== undefined) {
      const who = clean(body.slice(0, cap.index));
      const what = clean(body.slice(cap.index + cap[0].length));
      if (who && what && !opener?.kw) {
        const sys = opts.system ? `the ${stripArticle(opts.system)}` : es ? 'el sistema' : 'the system';
        notes.push(es ? `«${cap[0]}» expresa una posibilidad: se escribió como obligación del sistema de permitirlo; confirma que es obligatorio` : `"${cap[0]}" states a possibility: written as the system's obligation to allow it; confirm it is mandatory`);
        confidence -= 30;
        const p = build(pattern, undefined, '', sys, false, `${es ? 'permitir a' : 'allow'} ${es ? who.replace(/^(los|las|el|la)\s+/i, (x) => x.toLowerCase()) : who.toLowerCase()} ${es ? '' : 'to '}${what}`.replace(/\s+/g, ' '));
        if (validateEarsRequirement(p).conforms) return done('needs-confirmation', 'ubiquitous', [p]);
      }
    }
    questions.push(es ? '¿Qué DEBE hacer el sistema? Nombra el actor y la respuesta (p. ej. «el servicio de pagos debe …»).' : 'What shall the system do? Name the actor and the response (e.g. "the payment service shall …").');
    return done('question', opener?.pattern ?? null);
  }

  const modal = m[0];
  const neg = NEGATIVE.test(modal);
  if (WEAK.test(modal)) {
    notes.push(es ? `«${modal}» se leyó como obligatorio («shall»); confírmalo` : `"${modal}" was read as mandatory ("shall"); confirm it`);
    confidence -= 10;
  }
  const before = body.slice(0, m.index);
  let response = clean(body.slice(m.index + modal.length));
  let trigger = '';
  let actor = '';
  if (opener) {
    const cut = splitActor(before);
    trigger = clean(cut.trigger);
    actor = clean(cut.actor);
  } else actor = clean(before);
  actor = stripArticle(actor);

  // ── Trailing condition: "… shall notify the customer when an invoice is overdue" → WHEN first.
  let pat: EarsPattern = pattern;
  let kw = opener?.kw;
  if (!opener) {
    const tail = response.match(/^(.*\S)\s*,?\s+\b(when(?:ever)?|while|if|in case|cuando|mientras|si|en caso de que)\s+(.+)$/i);
    if (tail && !/\b(by|por)\b/i.test(tail[3].split(/\s+/)[0])) {
      const w = tail[2].toLowerCase();
      const o = OPENERS.find((x) => x.re.test(`${w} x`))!;
      pat = o.pattern;
      kw = o.kw;
      trigger = clean(tail[3]);
      response = clean(tail[1]);
      notes.push(es ? `la condición final «${tail[2]} …» se movió al principio (${o.kw})` : `the trailing "${tail[2]} …" condition was moved to the front (${o.kw})`);
      confidence -= 5;
    }
  }

  // ── Passive first: "the customer must be notified [by the mailer]".
  const passive0 = response.match(/^(be|ser|estar)\s+(\w+)\b\s*(.*)$/i);
  const isParticiple = (w: string) => Boolean(IRREGULAR[w.toLowerCase()]) || /(ed|en)$/i.test(w) || /(ad|id|ado|ada|ados|adas|ido|ida|idos|idas)$/i.test(w);
  if (passive0 && isParticiple(passive0[2]) && !/^(able|capaz)$/i.test(passive0[2])) {
    const by = passive0[3].match(/^(.*?)\b(?:by|por)\s+(.+)$/i);
    const verb = es ? null : baseVerb(passive0[2]);
    if (by && verb) {
      const rest = clean(by[1]);
      response = `${verb} ${actor ? `the ${actor}` : ''}${rest ? ` ${rest}` : ''}`.replace(/\s+/g, ' ').trim();
      actor = stripArticle(clean(by[2]));
      notes.push(`passive voice rewritten as active: "${actor}" is the actor`);
      confidence -= 10;
    } else if (opts.system && verb) {
      const rest = clean(passive0[3]);
      response = `${verb} the ${actor}${rest ? ` ${rest}` : ''}`;
      actor = stripArticle(opts.system);
      notes.push(`passive voice rewritten as active with --system "${actor}" as the actor`);
      confidence -= 20;
    } else questions.push(es ? `Voz pasiva sin actor («${passive0[1]} ${passive0[2]}»): ¿quién lo hace? (o usa --system)` : `Passive voice without an agent ("${passive0[1]} ${passive0[2]}"): who does it? (or pass --system)`);
  }

  // ── Capability on a user: "the user must be able to export" → system shall allow the user to export.
  const userActor = /^(user|users|customer|customers|operator|operators|admin|admins|administrator|usuari[oa]s?|cliente|clientes|operador(?:es)?|administrador(?:es)?)$/i.test(actor);
  const ableTo = response.match(/^(be able to|ser capaz de|poder)\s+(.+)$/i);
  if (userActor && !ableTo && !neg && !questions.length && !opts.system) questions.push(es ? `El actor «${actor}» es una persona: ¿qué sistema lo hace posible? (o usa --system)` : `The actor "${actor}" is a person: which system makes it happen? (or pass --system)`);
  else if (ableTo || (userActor && !neg && opts.system && !questions.length)) {
    const what = ableTo ? ableTo[2] : response;
    const sys = opts.system ? `the ${stripArticle(opts.system)}` : es ? 'el sistema' : 'the system';
    notes.push(es ? `el actor «${actor}» es una persona: la obligación se escribió para ${sys}, que debe permitirlo` : `the actor "${actor}" is a person: the obligation was written for ${sys}, which shall allow it`);
    confidence -= 20;
    const plural = /s$/i.test(actor);
    response = es ? `permitir ${plural ? `a los ${actor}` : `al ${actor}`} ${what}` : `allow the ${actor} to ${what}`;
    actor = stripArticle(sys);
  }

  if (/^(it|they|this|that|ello|esto|eso)$/i.test(actor)) {
    if (opts.system) actor = stripArticle(opts.system);
    else questions.push(es ? `«${actor}» no nombra un actor: ¿qué sistema o componente?` : `"${actor}" does not name an actor: which system or component?`);
  }
  if (!actor) {
    if (opts.system) actor = stripArticle(opts.system);
    else questions.push(es ? '¿Quién es el actor (qué sistema o componente)?' : 'Who is the actor (which system or component)?');
  }
  if (kw && !trigger) questions.push(es ? `¿Cuál es el disparador después de «${openerWord}»?` : `What is the trigger after "${openerWord}"?`);
  if (!response) questions.push(es ? '¿Cuál es la respuesta observable?' : 'What is the observable response?');
  for (const v of VAGUE) {
    const hit = response.match(v.re) ?? trigger.match(v.re);
    if (hit) questions.push(es ? `«${hit[0]}» no es comprobable: usa ${v.hint}.` : `"${hit[0]}" is not testable: use ${v.hint}.`);
  }
  if (opener && LOSSY_OPENER.test(openerWord) && trigger) {
    notes.push(es ? `«${openerWord} …» se escribió como WHEN; comprueba que el disparador se lee como un evento` : `"${openerWord} …" was written as WHEN; check the trigger reads as an event`);
    confidence -= 10;
  }
  if (questions.length) return done('question', pat);

  // ── Several actions on one actor → several requirements.
  const parts: string[] = [];
  const chunks = response.split(/\s*(?:,\s*and also|,\s*and|\band also|\band then|\bthen|,\s*y además|\by además|\by luego|\by tambi[eé]n|,)\s+|\s+(?:and|y)\s+(?=\S)/i);
  let current = chunks[0];
  for (const c of chunks.slice(1)) {
    if (SPLIT_VERBS.test(c)) {
      parts.push(current);
      current = c;
    } else current = `${current}${/^(and|y)\b/i.test(c) ? ' ' : response.includes(`, ${c}`) ? ', ' : ` ${es ? 'y' : 'and'} `}${c}`;
  }
  parts.push(current);
  if (parts.length > 1) {
    notes.push(es ? `una frase con ${parts.length} acciones se dividió en ${parts.length} requisitos` : `one sentence with ${parts.length} actions was split into ${parts.length} requirements`);
    confidence -= 5;
  }

  const sys = es ? `el ${actor}`.replace(/^el (el|la|los|las) /i, '$1 ') : `the ${actor}`;
  const proposals = parts.map((r) => build(pat === 'ubiquitous' ? null : pat, kw, trigger, sys, neg, clean(r)));
  for (const p of proposals) {
    const v = validateEarsRequirement(p);
    if (!v.conforms) {
      questions.push(...v.issues.map((i) => i.message));
      return done('question', pattern);
    }
  }
  return done(notes.length && confidence < 90 ? 'needs-confirmation' : 'converted', pat, proposals);
};

export interface ConversionReport {
  rows: Conversion[];
  converted: number;
  needsConfirmation: number;
  questions: number;
  requirements: string[];
}

export const convertText = (statements: string[], opts: { system?: string } = {}): ConversionReport => {
  const rows = statements.map((s) => convertStatement(s, opts));
  return {
    rows,
    converted: rows.filter((r) => r.status === 'converted').length,
    needsConfirmation: rows.filter((r) => r.status === 'needs-confirmation').length,
    questions: rows.filter((r) => r.status === 'question').length,
    requirements: rows.flatMap((r) => r.proposals),
  };
};

/** Next free `REQ-<AREA>-NNN` ids for appended requirements. */
export const nextRequirementIds = (existing: string, area: string, n: number): string[] => {
  const used = [...existing.matchAll(new RegExp(`REQ-${area}-(\\d{3})`, 'g'))].map((x) => Number(x[1]));
  let k = used.length ? Math.max(...used) : 0;
  return Array.from({ length: n }, () => `REQ-${area}-${String(++k).padStart(3, '0')}`);
};
