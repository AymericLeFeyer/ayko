import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentEvent, CacheEntry, McpServer, McpTool, Trace } from '@ayko/contracts';
import { parseShortcutCommand } from '../src/domain/cache/services/shortcutCommand.js';
import { fitHistory } from '../src/domain/conversation/services/contextWindow.js';
import {
  capabilitiesOf,
  routingPrompt,
} from '../src/domain/conversation/services/routingPrompt.js';
import { unknownTarget } from '../src/domain/home/services/homeContext.js';
import { argumentProblem } from '../src/domain/mcp/services/toolArguments.js';
import { parseMemoryCommand } from '../src/domain/memory/services/memoryRules.js';
import { answerOf, requestIdOf, startHarness, type Harness } from './harness.js';

describe('parseShortcutCommand', () => {
  it.each([
    [
      "Quand je dis d'allumer la lumière, tu allumes le salon",
      'allumer la lumière',
      'allumes le salon',
    ],
    ['Ayko, quand je te dis bonne nuit, éteins tout.', 'bonne nuit', 'éteins tout'],
    ['si je dis « on part » alors ferme le volet', 'on part', 'ferme le volet'],
    ['retiens que quand je dis bonne nuit tu éteins le salon', 'bonne nuit', 'éteins le salon'],
    ['quand je dis bonne nuit éteins le salon', 'bonne nuit', 'éteins le salon'],
    ['Crée un raccourci « film » qui ferme le volet', 'film', 'ferme le volet'],
  ])('reads %s', (text, trigger, actions) => {
    expect(parseShortcutCommand(text)).toEqual({ triggers: [trigger], actions });
  });

  it.each([
    ['quand je dis allume ou éteint la lumière, tu contrôles le salon'],
    ["quand je dis d'allumer ou d'éteindre la lumière, tu contrôles le salon"],
    ['quand je dis allume la lumière ou éteins la lumière tu contrôles le salon'],
  ])('makes one phrase per alternative in %s', (text) => {
    const command = parseShortcutCommand(text);
    expect(command?.triggers).toHaveLength(2);
    expect(command?.triggers[0]).toMatch(/^allum\w+ la lumière$/);
    expect(command?.triggers[1]).toMatch(/^[ée]tei\w+ la lumière$/);
    expect(command?.actions).toContain('contrôles le salon');
  });

  it('keeps synonyms whole and ignores repeats', () => {
    expect(
      parseShortcutCommand('quand je dis bonne nuit ou à demain, éteins tout')?.triggers,
    ).toEqual(['bonne nuit', 'à demain']);
    expect(parseShortcutCommand('quand je dis allume ou allumer, éteins tout')?.triggers).toEqual([
      'allumer',
    ]);
  });

  it('does not take the verb after "ou" for the start of the order', () => {
    expect(
      parseShortcutCommand('quand je dis allume ou éteins la lumière baisse le volet'),
    ).toEqual({ triggers: ['allume la lumière', 'éteins la lumière'], actions: 'baisse le volet' });
  });

  it.each([
    'Allume le salon',
    'Quand je dis bonjour, tu fais quoi ?',
    'Quand je dis ça, il rit',
    'Quand est-ce que tu éteins ?',
    'Retiens que le chat dort',
  ])('stays out of %s', (text) => expect(parseShortcutCommand(text)).toBeNull());

  it('leaves plain memories to the memory command', () => {
    expect(parseMemoryCommand('Retiens que le chat dort')).not.toBeNull();
  });
});

describe('stored call checks', () => {
  const schema = {
    type: 'object',
    properties: { room: { type: 'string' }, level: { type: 'integer', enum: [1, 2] } },
    required: ['room'],
    additionalProperties: false,
  };

  it('finds what a call gets wrong', () => {
    expect(argumentProblem(schema, { room: 'salon', level: 2 })).toBeNull();
    expect(argumentProblem(schema, {})).toContain('manquant');
    expect(argumentProblem(schema, { room: 'salon', color: 'vert' })).toContain('inconnu');
    expect(argumentProblem(schema, { room: 3 })).toContain('type');
    expect(argumentProblem(schema, { room: 'salon', level: 3 })).toContain('non autorisée');
  });

  it('accepts only devices and areas that exist, whatever the case', () => {
    const devices = [{ names: ['Lampe salon'], domain: 'light', state: 'on', area: 'Salon' }];
    expect(unknownTarget({ name: 'lampe SALON' }, devices)).toBeNull();
    expect(unknownTarget({ area: 'salon' }, devices)).toBeNull();
    expect(unknownTarget({ name: 'Licorne' }, devices)).toBe('Licorne');
    expect(unknownTarget({ area: 'Grenier' }, devices)).toBe('Grenier');
  });
});

describe('routing and context budget', () => {
  it('tells the router about every connected server', () => {
    const prompt = routingPrompt(
      capabilitiesOf([
        { serverName: 'Maison', exposedName: 'HassTurnOn' },
        { serverName: 'Agenda', exposedName: 'list_events' },
      ]),
    );
    expect(prompt).toContain('- Maison : HassTurnOn');
    expect(prompt).toContain('- Agenda : list_events');
    expect(prompt).toContain('OUTILS ou DIRECT');
  });

  it('counts tool schemas in the context budget', () => {
    const history = [{ role: 'user' as const, content: 'x'.repeat(700) }];
    expect(fitHistory(history, '', '', 400)).toHaveLength(1);
    expect(fitHistory(history, '', '', 400, [{ schema: 'y'.repeat(700) }])).toHaveLength(0);
  });
});

describe('dictated shortcuts', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  const entries = () => h.api<CacheEntry[]>('GET', '/cache/entries');
  const entryFor = async (text: string) =>
    (await entries()).find((entry) => entry.sampleText === text);
  const traceOf = (events: AgentEvent[]) => h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);

  it('stores several real calls for the room without running them', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({
      text: 'Quand je dis bonne nuit, tu éteins le salon et ferme le volet de la chambre',
      roomId: salon.id,
    });
    expect(answerOf(events)).toContain('Raccourci créé pour Salon');
    expect((await traceOf(events)).toolCalls).toEqual([]);
    expect(await entryFor('bonne nuit')).toMatchObject({
      origin: 'manual',
      status: 'pinned',
      kind: 'action',
      roomId: salon.id,
      global: false,
      calls: [
        { toolName: 'light_turn_off', arguments: { room: 'salon' } },
        { toolName: 'cover_set', arguments: { room: 'chambre', position: 0 } },
      ],
    });
  });

  it('replays the whole sequence without the model', async () => {
    const salon = await h.room('Salon');
    // The shutter is a sensitive tool: replaying it still asks.
    const events = await h.chat({ text: 'Bonne nuit !', roomId: salon.id }, (event) => {
      if (event.type === 'confirm.request') {
        h.container.agent.answerConfirmation(event.confirmId, true);
      }
    });
    const trace = await traceOf(events);
    expect(trace.model).toBeNull();
    expect(trace.toolCalls.map((call) => call.toolName)).toEqual(['light_turn_off', 'cover_set']);
    expect(events.at(-2)).toMatchObject({ stats: { cacheHit: true } });
  });

  it('stays in its room', async () => {
    const chambre = await h.room('Chambre');
    const events = await h.chat({ text: 'Bonne nuit', roomId: chambre.id });
    expect((await traceOf(events)).model).not.toBeNull();
  });

  it('works for a phrase that would never be learned', async () => {
    const salon = await h.room('Salon');
    await h.chat({ text: 'quand je dis ça caille, allume le salon', roomId: salon.id });
    const events = await h.chat({ text: 'ça caille', roomId: salon.id });
    expect((await traceOf(events)).toolCalls.map((call) => call.toolName)).toEqual([
      'light_turn_on',
    ]);
  });

  it('holds for the whole house when spoken from no room', async () => {
    await h.chat({ text: 'quand je dis lumière partout, allume le salon' });
    expect(await entryFor('lumière partout')).toMatchObject({ global: true, roomId: null });
    const chambre = await h.room('Chambre');
    const events = await h.chat({ text: 'lumière partout', roomId: chambre.id });
    expect((await traceOf(events)).model).toBeNull();
  });

  it('keeps the confirmation of a sensitive tool at each use', async () => {
    const salon = await h.room('Salon');
    const created = await h.chat({
      text: 'quand je dis je pars, verrouille la porte',
      roomId: salon.id,
    });
    expect(answerOf(created)).toContain('Confirmation demandée');
    const events = await h.chat({ text: 'je pars', roomId: salon.id }, (event) => {
      if (event.type === 'confirm.request') {
        h.container.agent.answerConfirmation(event.confirmId, false);
      }
    });
    expect(events.some((event) => event.type === 'confirm.request')).toBe(true);
    expect(answerOf(events)).toBe('Action annulée.');
    expect((await traceOf(events)).toolCalls).toEqual([]);
  });

  it('refuses a device that does not exist', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({
      text: 'quand je dis magie, allume la licorne',
      roomId: salon.id,
    });
    expect(answerOf(events)).toContain('appareil inconnu : licorne');
    expect(await entryFor('magie')).toBeUndefined();
  });

  it('refuses a tool excluded from the cache', async () => {
    const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
    const tools = await h.api<McpTool[]>('GET', `/mcp/servers/${server?.id}/tools`);
    const tool = tools.find((item) => item.name === 'cover_set') as McpTool;
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { cacheEnabled: false });
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'quand je dis noir, ferme le volet', roomId: salon.id });
    expect(answerOf(events)).toContain("Je n'ai pas trouvé d'outil");
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { cacheEnabled: true });
  });

  it('makes one shortcut per alternative, each with its own verb', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({
      text: 'quand je dis allume ou éteint la lumière, tu contrôles uniquement le salon',
      roomId: salon.id,
    });
    expect(answerOf(events)).toContain('Raccourcis créés pour Salon');
    expect(await entryFor('allume ou éteint la lumière')).toBeUndefined();
    expect((await entryFor('allume la lumière'))?.calls).toMatchObject([
      { toolName: 'light_turn_on', arguments: { room: 'salon' } },
    ]);
    expect((await entryFor('éteint la lumière'))?.calls).toMatchObject([
      { toolName: 'light_turn_off', arguments: { room: 'salon' } },
    ]);
    const replay = await h.chat({ text: 'Éteins la lumière', roomId: salon.id });
    expect((await traceOf(replay)).toolCalls.map((call) => call.toolName)).toEqual([
      'light_turn_off',
    ]);
  });

  it('creates none of the alternatives when one is refused', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({
      text: 'quand je dis coucou ou hello, allume la licorne',
      roomId: salon.id,
    });
    expect(answerOf(events)).toContain('Aucun raccourci créé');
    expect(await entryFor('coucou')).toBeUndefined();
    expect(await entryFor('hello')).toBeUndefined();
  });

  it('never lets the model overwrite a dictated shortcut', async () => {
    const salon = await h.room('Salon');
    const before = await entryFor('bonne nuit');
    await h.chat({ text: 'Bonne nuit', roomId: salon.id, bypassCache: true });
    expect((await entryFor('bonne nuit'))?.calls).toEqual(before?.calls);
  });
});
