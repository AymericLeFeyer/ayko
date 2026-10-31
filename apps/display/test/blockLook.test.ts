import { describe, expect, it } from 'vitest';
import { entityKind, entityTone, weatherKind } from '../src/domain/blockLook';

describe('entityTone', () => {
  it.each([
    ['Allumée', 'on'],
    ['ON', 'on'],
    ['Éteint', 'off'],
    ['fermée', 'off'],
    ['Fait', 'ok'],
    ['Indisponible', 'alert'],
    ['21,5', 'info'],
  ])('reads %s as %s', (state, tone) => {
    expect(entityTone(state)).toBe(tone);
  });

  it('leaves an unknown state neutral', () => {
    expect(entityTone('Mode nuit')).toBeUndefined();
    expect(entityTone('')).toBeUndefined();
  });
});

describe('entityKind', () => {
  it('recognises the device in its name, accents aside', () => {
    expect(entityKind('Lumière salon')).toBe('light');
    expect(entityKind('Volet chambre')).toBe('shutter');
    expect(entityKind('Télé')).toBe('screen');
  });

  it('falls back on the unit, then on a power icon', () => {
    expect(entityKind('Salon', '°C')).toBe('heating');
    expect(entityKind('Cave', '%')).toBe('humidity');
    expect(entityKind('Salon')).toBe('power');
  });
});

describe('weatherKind', () => {
  it('maps the condition, and defaults to clouds', () => {
    expect(weatherKind('Averses')).toBe('rain');
    expect(weatherKind('Ensoleillé')).toBe('sun');
    expect(weatherKind('Couvert')).toBe('cloud');
  });
});
