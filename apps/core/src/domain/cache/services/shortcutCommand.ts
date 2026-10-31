import { ACTION_VERBS, normalizeText } from './normalizeText.js';

export interface ShortcutCommand {
  /** One stored shortcut each: the same order means something else for each phrase. */
  triggers: string[];
  actions: string;
}

const LEAD_IN = String.raw`^\s*(?:ayko[\s,]+)?(?:(?:cr[ée]e|ajoute|enregistre)(?:[- ]moi)?\s+un\s+raccourci\s*[:,]?\s*)?(?:(?:souviens[- ]toi|rappelle[- ]toi|retiens|note|apprends|n['’]oublie pas)\s+(?:bien\s+)?(?:que\s+|qu['’])?)?(?:(?:[àa] partir de maintenant|d[ée]sormais|dor[ée]navant)[\s,]+)?`;
const WHEN = String.raw`(?:quand|lorsque|si|d[èe]s que|(?:[àa] )?chaque fois que)\s+(?:je\s+(?:te\s+)?(?:dis|dirai)|on\s+(?:te\s+)?dit)\s*:?\s*`;
const COMMAND = new RegExp(`${LEAD_IN}${WHEN}(.+)$`, 'i');
const NAMED =
  /^\s*(?:ayko[\s,]+)?(?:cr[ée]e|ajoute|enregistre)(?:[- ]moi)?\s+un\s+raccourci\s+([«"“].+?[»"”])\s+(?:qui|pour)\s+(.+)$/i;

const QUOTED = /^[«"“]\s*(.+?)\s*[»"”][\s,:;]*(?:alors\s+)?(.+)$/;
const SEPARATED = /^(.+?)(?:\s*[,:;]\s*|\s+alors\s+|\s+tu\s+)(.+)$/i;
/** "quand je dis ça, il rit" describes something, it does not give Ayko an order. */
const NOT_AN_ORDER = /^(?:il|elle|ils|elles|on|je|j['’]|ça|cela|c['’]est)\b/i;

const clean = (text: string) => text.trim().replace(/[.!\s]+$/, '');
const trigger = (text: string) => clean(text).replace(/^(?:d['’]|de\s+|que\s+|qu['’])/i, '');
const actions = (text: string) =>
  clean(text).replace(/^(?:tu\s+(?:dois\s+|vas\s+|peux\s+)?|il faut\s+)/i, '');

/** "allume ou éteins la lumière" is two phrases sharing their end, not one odd phrase. */
function alternatives(text: string) {
  const parts = text
    .split(/\s+ou\s+/i)
    .map(trigger)
    .filter(Boolean);
  const tail = parts.at(-1)?.split(/\s+/).slice(1).join(' ') ?? '';
  const phrases = parts.map((part) =>
    !/\s/.test(part) && ACTION_VERBS.has(normalizeText(part)) ? `${part} ${tail}`.trim() : part,
  );
  return [...new Map(phrases.map((phrase) => [normalizeText(phrase), phrase])).values()];
}

function clauses(text: string): [string, string] | null {
  const quoted = QUOTED.exec(text.trim()) ?? SEPARATED.exec(text.trim());
  if (quoted?.[1] && quoted[2]) return [quoted[1], quoted[2]];
  // Dictated speech often comes without punctuation: the order starts at its first verb.
  const words = text.trim().split(/\s+/);
  const verb = words.findIndex(
    (word, index) =>
      index > 0 &&
      words[index - 1]?.toLowerCase() !== 'ou' &&
      ACTION_VERBS.has(normalizeText(word)),
  );
  return verb > 0 ? [words.slice(0, verb).join(' '), words.slice(verb).join(' ')] : null;
}

/**
 * Recognised by code, like memory commands: the model never decides on its own to store
 * a shortcut, and a sentence that teaches one can never be run as an order.
 */
export function parseShortcutCommand(text: string): ShortcutCommand | null {
  if (text.trim().endsWith('?')) return null;
  const named = NAMED.exec(text);
  const parts = named?.[1] && named[2] ? clauses(`${named[1]} ${named[2]}`) : null;
  const sentence = COMMAND.exec(text)?.[1];
  const found = parts ?? (sentence ? clauses(sentence) : null);
  if (!found) return null;
  const command = {
    triggers: alternatives(found[0].replace(/^[«"“]|[»"”]$/g, '')),
    actions: actions(found[1]),
  };
  if (command.triggers.length === 0 || !command.actions) return null;
  if (NOT_AN_ORDER.test(command.actions)) return null;
  return command;
}
