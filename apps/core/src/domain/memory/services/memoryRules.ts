import { ACTION_VERBS, normalizeText, stripAccents } from '../../cache/services/normalizeText.js';

export type MemoryCommand = { type: 'remember'; fact: string } | { type: 'forget'; query: string };

const PREFIX = String.raw`^\s*(?:ayko[\s,]+)?`;
const REMEMBER = new RegExp(
  `${PREFIX}(?:souviens[- ]toi|rappelle[- ]toi|retiens|memorise|mémorise|n['’]oublie pas|note)\\s+(?:bien\\s+)?(?:que\\s+|qu['’]|de\\s+)(.+)$`,
  'i',
);
const FORGET = new RegExp(`${PREFIX}oublie\\s+(?:que\\s+|qu['’])(.+)$`, 'i');

const clean = (text: string) => text.trim().replace(/[.!\s]+$/, '');

/**
 * Handled by code rather than left to the model: saving something is then instant,
 * certain, and cannot be invented from a sentence that never asked for it.
 */
export function parseMemoryCommand(text: string): MemoryCommand | null {
  const forget = FORGET.exec(text)?.[1];
  if (forget) return { type: 'forget', query: clean(forget) };
  const fact = REMEMBER.exec(text)?.[1];
  if (fact && !text.trim().endsWith('?')) return { type: 'remember', fact: clean(fact) };
  return null;
}

const MIN_KEYWORD_LENGTH = 3;

export const keywords = (text: string) =>
  new Set(
    normalizeText(text)
      .split(' ')
      .filter((token) => token.length >= MIN_KEYWORD_LENGTH && !ACTION_VERBS.has(token)),
  );

export function keywordScore(query: Set<string>, content: string) {
  let score = 0;
  for (const token of keywords(content)) if (query.has(token)) score += 1;
  return score;
}

/**
 * Finds a shortcut the user revealed by acting: "éteins l'atelier" that ended up on two
 * lamps teaches "atelier". A phrase that already spells the device teaches nothing.
 */
export function learnableAlias(text: string, deviceNames: string[]): string | null {
  const unique = [...new Set(deviceNames)];
  const alias = keywords(text);
  if (unique.length === 0 || alias.size === 0) return null;
  const tokens = unique.map((name) => keywords(name));
  const overlap = (device: Set<string>) => [...device].some((token) => alias.has(token));
  const spelled = (device: Set<string>) => [...device].every((token) => alias.has(token));
  if (tokens.every(spelled)) return null;
  if (unique.length === 1 && tokens[0] && overlap(tokens[0])) return null;
  return [...alias].join(' ');
}

export const aliasContent = (alias: string, deviceNames: string[]) =>
  `« ${alias} » désigne : ${[...new Set(deviceNames)].join(', ')}`;

export const plain = (text: string) => stripAccents(text.toLowerCase()).trim();
