import { describe, expect, it } from 'vitest';
import { actionBlock } from '../src/domain/mcp/services/toolBlocks.js';
import {
  isCacheableText,
  normalizeText,
  sameCommand,
} from '../src/domain/cache/services/normalizeText.js';
import { cosineSimilarity } from '../src/domain/cache/services/similarity.js';
import { fitHistory } from '../src/domain/conversation/services/contextWindow.js';
import {
  mayBeStructuredCall,
  parseStructuredCall,
} from '../src/domain/llm/services/structuredTools.js';
import { defaultPolicy, resolvePolicy } from '../src/domain/mcp/services/toolPolicy.js';
import { renderPrompt, TOOL_SAFETY_CLAUSE } from '../src/domain/persona/services/renderPrompt.js';

describe('sameCommand', () => {
  const same = (a: string, b: string) => sameCommand(normalizeText(a), normalizeText(b));

  it('tells apart the odd exchanges reported from the tablets', () => {
    expect(same('met le chauffage sur 20', 'met le chauffage sur 18')).toBe(false);
    expect(same('éteint la lumière', 'allume la lumière')).toBe(false);
  });

  it('still accepts a rewording of the same command', () => {
    expect(same('allume le salon', 'allume la lumière du salon')).toBe(true);
    expect(same('mets le chauffage à 20', 'met le chauffage du bureau sur 20')).toBe(true);
  });
});

describe('normalizeText', () => {
  it.each([
    ['Ouvre le volet', 'ouvrir volet'],
    ['ouvres le volet !', 'ouvrir volet'],
    ["Peux-tu ouvrir le volet s'il te plaît ?", 'ouvrir volet'],
    ['le volet, ouvre', 'ouvrir volet'],
    ['OUVRE LES VOLETS', 'ouvrir volets'],
    ["Éteins la lumière de l'entrée", 'entree eteindre lumiere'],
    ['Allumez la lumière du salon', 'allumer lumiere salon'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('treats conjugations and word order as identical', () => {
    expect(normalizeText('baisse le store')).toBe(normalizeText('le store, baisser'));
  });
});

describe('isCacheableText', () => {
  it.each(['ferme-le', 'la même chose', 'refais ça', 'pourquoi le ciel est bleu', 'comment ça va'])(
    'refuses %s',
    (text) => expect(isCacheableText(text)).toBe(false),
  );

  it.each(['ouvre le volet', 'quelle température fait-il', 'donne-moi la température'])(
    'accepts %s',
    (text) => expect(isCacheableText(text)).toBe(true),
  );
});

describe('tool policies', () => {
  const roomId = 'room-1';
  const base = { enabled: true, policy: 'auto' as const, roomOverrides: [] };

  it('asks for confirmation on sensitive tools by default', () => {
    expect(defaultPolicy('lock_door')).toBe('confirm');
    expect(defaultPolicy('alarm_arm_away')).toBe('confirm');
    expect(defaultPolicy('light_turn_on')).toBe('auto');
    expect(defaultPolicy('set_warm_white')).toBe('auto');
  });

  it('lets a room override win and a disabled tool stay forbidden', () => {
    const tool = { ...base, roomOverrides: [{ roomId, policy: 'forbidden' as const }] };
    expect(resolvePolicy(tool, roomId)).toBe('forbidden');
    expect(resolvePolicy(tool, 'other')).toBe('auto');
    expect(resolvePolicy({ ...base, enabled: false }, null)).toBe('forbidden');
  });
});

describe('renderPrompt', () => {
  const persona = {
    systemPrompt: 'Bonjour {{user}}, pièce {{room}}. {{inconnue}}',
    language: 'fr',
    responseLength: 'short' as const,
    address: 'tu' as const,
  };
  const context = { now: new Date(0), roomName: 'Salon', userName: 'Sam', devices: [] };

  it('substitutes variables and reports unknown ones', () => {
    const { prompt, unknownVariables } = renderPrompt(persona, context);
    expect(prompt).toContain('Bonjour Sam, pièce Salon.');
    expect(unknownVariables).toEqual(['inconnue']);
  });

  it('always keeps the tool safety clause', () => {
    expect(renderPrompt(persona, context).prompt).toContain(TOOL_SAFETY_CLAUSE);
  });
});

describe('fitHistory', () => {
  it('keeps the most recent messages that fit', () => {
    const history = ['a', 'b', 'c'].map((letter) => ({
      role: 'user' as const,
      content: letter.repeat(700),
    }));
    const kept = fitHistory(history, 'system', 'question', 400);
    expect(kept.map((message) => message.content[0])).toEqual(['c']);
  });

  it('keeps the last exchange even when the tools fill the window', () => {
    const history = [
      { role: 'user' as const, content: 'météo à Lille' },
      { role: 'assistant' as const, content: 'Il fait 14 °C.' },
    ];
    const tools = [{ schema: 'y'.repeat(11_000) }];
    expect(fitHistory(history, 's'.repeat(2200), 'et à Bailleul', 4096, tools)).toEqual(history);
  });

  it('gives up tool details before the words of the conversation', () => {
    const history = [
      { role: 'user' as const, content: 'météo à Lille' },
      { role: 'assistant' as const, content: '', toolCalls: [{ name: 'web', arguments: {} }] },
      { role: 'tool' as const, content: 'x'.repeat(2000), toolName: 'web' },
      { role: 'assistant' as const, content: 'Il fait 14 °C.' },
    ];
    const kept = fitHistory(history, 's'.repeat(4000), 'et à Bailleul', 1000);
    expect(kept.map((message) => message.role)).toEqual(['user', 'assistant']);
  });
});

describe('structured tool fallback', () => {
  const tools = [{ name: 'light_turn_on', description: '', parameters: {} }];

  it('parses a call, even fenced', () => {
    const text = '```json\n{"tool": "light_turn_on", "arguments": {"room": "salon"}}\n```';
    expect(parseStructuredCall(text, tools)).toEqual({
      name: 'light_turn_on',
      arguments: { room: 'salon' },
    });
  });

  it('ignores prose and unknown tools', () => {
    expect(parseStructuredCall('Bonjour !', tools)).toBeNull();
    expect(parseStructuredCall('{"tool": "rm_rf", "arguments": {}}', tools)).toBeNull();
  });

  it('holds back only what may still be a call', () => {
    expect(mayBeStructuredCall('  {"to')).toBe(true);
    expect(mayBeStructuredCall('```')).toBe(true);
    expect(mayBeStructuredCall('Bonjour')).toBe(false);
  });
});

describe('cosineSimilarity', () => {
  it('handles identical, orthogonal and mismatched vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});

describe('actionBlock', () => {
  it('gives plain-text actions a card with their new state', () => {
    expect(actionBlock('HassTurnOn', 'Allumer', { name: 'Lampe salon' })).toEqual({
      type: 'entity',
      name: 'Lampe salon',
      state: 'Allumé',
      action: { label: 'Éteindre', text: 'Éteins Lampe salon' },
    });
    expect(actionBlock('light_turn_off', 'Éteindre', { room: 'salon' })).toMatchObject({
      name: 'salon',
      state: 'Éteint',
      action: { label: 'Allumer', text: 'Allume salon' },
    });
    expect(actionBlock('cover_set', 'Volet', {})).toEqual({
      type: 'entity',
      name: 'Volet',
      state: 'Fait',
    });
  });

  it('offers no way back without a known target', () => {
    expect(actionBlock('HassTurnOn', 'Allumer', {})).not.toHaveProperty('action');
    expect(actionBlock('cover_set', 'Volet', { name: 'Volet' })).not.toHaveProperty('action');
  });
});
