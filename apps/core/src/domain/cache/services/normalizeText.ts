const STOP_WORDS = new Set(
  `le la les l un une des du de d au aux a ce cet cette ces mon ma mes ton ta tes son sa ses notre
  nos votre vos je tu il elle on nous vous ils elles me te se y en et ou s stp svp merci
  plait plaît sil peux peut pourrais pourriez veux voudrais voulez aimerais dans sur pour avec
  please ayko hey salut bonjour bonsoir`
    .split(/\s+/)
    .filter(Boolean),
);

/** Polite multi-word forms are dropped before tokenising. */
const STOP_PHRASES = [/s il (te|vous) pla[iî]t/g, /est ce que/g, /tu peux/g, /vous pouvez/g];

function conjugations(lemma: string, forms: string): [string, string][] {
  return forms
    .split(' ')
    .filter(Boolean)
    .map((form) => [form, lemma]);
}

const erVerb = (lemma: string): [string, string][] => {
  const stem = lemma.slice(0, -2);
  return conjugations(
    lemma,
    `${stem}e ${stem}es ${stem}ez ${stem}ons ${stem}ent ${stem}er ${stem}erais ${stem}e ${stem}é`,
  );
};

/** Common home-control verbs brought to a single form ("ouvre", "ouvrir", "ouvres"). */
const VERB_FORMS = new Map<string, string>([
  ...['allumer', 'fermer', 'baisser', 'monter', 'lancer', 'arreter', 'demarrer'].flatMap(erVerb),
  ...['activer', 'desactiver', 'regler', 'augmenter', 'diminuer', 'tamiser'].flatMap(erVerb),
  ...['verrouiller', 'deverrouiller', 'couper', 'donner', 'afficher', 'montrer'].flatMap(erVerb),
  ...['illuminer', 'eclairer'].flatMap(erVerb),
  ...conjugations('ouvrir', 'ouvre ouvres ouvrez ouvrons ouvrent ouvrir ouvrirais ouvert'),
  ...conjugations('eteindre', 'eteins eteint eteignez eteignons eteindre eteindrais'),
  ...conjugations('descendre', 'descends descend descendez descendons descendre'),
  ...conjugations('mettre', 'mets met mettez mettons mettre'),
  ...conjugations('etre', 'est es suis sont etes etre'),
  ...conjugations('faire', 'fais fait faites faisons faire'),
]);

export const stripAccents = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Canonical form used as cache key: case, accents, punctuation, stop words, verb
 * conjugation and word order are all ignored.
 */
export function normalizeText(text: string): string {
  let value = stripAccents(text.toLowerCase())
    .replace(/[’']/g, ' ')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .replace(/-/g, ' ');
  for (const phrase of STOP_PHRASES) value = value.replace(phrase, ' ');
  const tokens = value
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .map((token) => VERB_FORMS.get(token) ?? token);
  return [...new Set(tokens)].sort().join(' ');
}

const AMBIGUOUS = [
  /-(le|la|les|lui|leur)\b/i,
  /\b(la meme chose|pareil|idem|comme avant|comme tout a l heure|encore|refais|recommence)\b/,
  /\b(ca|cela|celui|celle|ceux|ici|la bas)\b/,
];
const OPEN_QUESTION = /\b(pourquoi|comment|explique|raconte|c est quoi|qu est ce|que penses)\b/;

export const ACTION_VERBS = new Set(
  `allumer eteindre ouvrir fermer baisser monter descendre lancer arreter demarrer activer
  desactiver regler augmenter diminuer tamiser verrouiller deverrouiller couper mettre illuminer
  eclairer`.split(/\s+/),
);

/** True when the user asks to change something, as opposed to asking about it. */
export function isActionRequest(text: string): boolean {
  const plain = stripAccents(text.toLowerCase()).replace(/[’']/g, ' ');
  if (OPEN_QUESTION.test(plain)) return false;
  const tokens = normalizeText(text).split(' ');
  // "la lampe est allumée" uses the verb as a state.
  return !tokens.includes('etre') && tokens.some((token) => ACTION_VERBS.has(token));
}

const commandKey = (normalized: string) =>
  normalized
    .split(' ')
    .filter((token) => /\d/.test(token) || ACTION_VERBS.has(token))
    .join(' ');

/**
 * Embeddings rate "sur 18" and "sur 20", or "allume" and "éteins", as nearly identical: two
 * phrases are interchangeable only if their numbers and action verbs are the same.
 */
export const sameCommand = (normalizedA: string, normalizedB: string): boolean =>
  commandKey(normalizedA) === commandKey(normalizedB);

/** Context-dependent or open requests are never cached (spec 4.9). */
export function isCacheableText(text: string): boolean {
  if (AMBIGUOUS[0]?.test(text)) return false;
  const plain = stripAccents(text.toLowerCase()).replace(/[’']/g, ' ');
  if (AMBIGUOUS.slice(1).some((pattern) => pattern.test(plain))) return false;
  return !OPEN_QUESTION.test(plain);
}
