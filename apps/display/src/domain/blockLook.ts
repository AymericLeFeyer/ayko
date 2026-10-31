export type Tone = 'on' | 'off' | 'ok' | 'info' | 'alert';
export type EntityKind =
  | 'light'
  | 'heating'
  | 'shutter'
  | 'plug'
  | 'screen'
  | 'door'
  | 'speaker'
  | 'fan'
  | 'humidity'
  | 'power';
export type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const ENTITY_TONES: [RegExp, Tone][] = [
  [/^(indisponible|unavailable|inconnue?|unknown|erreur|error|echec|hors ligne|offline)$/, 'alert'],
  [/^(on|allumee?|ouverte?|actif|active|en marche|en cours|present|presente)$/, 'on'],
  [/^(off|eteinte?|fermee?|inactif|inactive|arretee?|absent|absente)$/, 'off'],
  [/^(fait|ok|done|terminee?)$/, 'ok'],
];

const ENTITY_KINDS: [RegExp, EntityKind][] = [
  [/lumiere|lampe|plafonnier|lustre|applique|ampoule|light/, 'light'],
  [/chauffage|radiateur|thermostat|temperature|climatisation|clim\b/, 'heating'],
  [/volet|store|rideau/, 'shutter'],
  [/prise|plug/, 'plug'],
  [/\btv\b|tele|ecran/, 'screen'],
  [/porte|serrure|portail|garage/, 'door'],
  [/enceinte|musique|speaker|sonos/, 'speaker'],
  [/ventilateur|\bvmc\b/, 'fan'],
  [/humidite/, 'humidity'],
];

const WEATHER_KINDS: [RegExp, WeatherKind][] = [
  [/orage/, 'storm'],
  [/neige|gresil/, 'snow'],
  [/pluie|pluvieux|averse|bruine/, 'rain'],
  [/brouillard|brume/, 'fog'],
  [/soleil|ensoleille|degage|clair/, 'sun'],
];

/** Servers send free text: the state decides the colour, unknown states stay neutral. */
export function entityTone(state: string): Tone | undefined {
  const folded = fold(state);
  if (folded !== '' && !Number.isNaN(Number(folded.replace(',', '.')))) return 'info';
  return ENTITY_TONES.find(([pattern]) => pattern.test(folded))?.[1];
}

export function entityKind(name: string, unit?: string): EntityKind {
  const folded = fold(name);
  const kind = ENTITY_KINDS.find(([pattern]) => pattern.test(folded))?.[1];
  if (kind) return kind;
  if (unit === '°C') return 'heating';
  return unit === '%' ? 'humidity' : 'power';
}

export function weatherKind(condition: string): WeatherKind {
  const folded = fold(condition);
  return WEATHER_KINDS.find(([pattern]) => pattern.test(folded))?.[1] ?? 'cloud';
}
