import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Trace } from '@ayko/contracts';
import { isActionRequest } from '../src/domain/cache/services/normalizeText.js';
import { answerOf, requestIdOf, startHarness, type Harness } from './harness.js';

describe('isActionRequest', () => {
  it.each([
    'allume atelier droite',
    'Allume la lampe',
    'Éteins la lumière',
    'Illumine Kayo',
    'ferme-le',
    'Tu peux ouvrir le volet ?',
  ])('sees an action in %s', (text) => expect(isActionRequest(text)).toBe(true));

  it.each([
    'Quelle température fait-il ?',
    'La lampe est allumée ?',
    'Comment allumer la lampe ?',
    'Liste moi les entités',
    'Bonjour',
  ])('sees no action in %s', (text) => expect(isActionRequest(text)).toBe(false));
});

describe('claimed actions', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  const entries = () => h.api<{ sampleText: string }[]>('GET', '/cache/entries');

  it('sends a model back to work when it claims an action it did not run', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'Allume le modèle hésitant', roomId: salon.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls.map((call) => call.toolName)).toEqual([
      'get_temperature',
      'light_turn_on',
    ]);
    expect(answerOf(events)).toContain('Lumière atelier allumée');
    expect(answerOf(events)).not.toContain("je l'allume");
  });

  it('says nothing was done when the model keeps lying', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'Allume le modèle menteur', roomId: salon.id });
    expect(answerOf(events)).toContain("rien n'a été fait");
    expect(answerOf(events)).not.toContain("C'est fait");
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls.map((call) => call.toolName)).toEqual(['get_temperature']);
    expect(trace.steps.some((step) => step.kind === 'error')).toBe(true);
  });

  it('never learns a shortcut from a false success', async () => {
    const texts = (await entries()).map((entry) => entry.sampleText);
    expect(texts.some((text) => text.includes('menteur'))).toBe(false);
  });

  it('still answers read-only questions without any reminder', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'Quelle température ?', roomId: salon.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls).toMatchObject([{ toolName: 'get_temperature' }]);
    expect(answerOf(events)).toContain('°C');
  });
});
