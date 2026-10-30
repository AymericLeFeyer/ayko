import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentEvent, Memory, McpServer, McpTool, Trace } from '@ayko/contracts';
import { withToolHistory } from '../src/domain/conversation/services/toolHistory.js';
import { fitHistory } from '../src/domain/conversation/services/contextWindow.js';
import { parseLiveContext, renderHomeContext } from '../src/domain/home/services/homeContext.js';
import { learnableAlias, parseMemoryCommand } from '../src/domain/memory/services/memoryRules.js';
import { answerOf, requestIdOf, startHarness, type Harness } from './harness.js';

const LIVE_CONTEXT = JSON.stringify({
  result: `Live Context: An overview of the areas and the devices in this smart home:
- names: light_desktop_lightstrip, ruban led
  domain: light
  state: 'off'
  areas: Bureau
  attributes:
    brightness:
- names: Lampe salon
  domain: light
  state: 'on'
  areas: Salon
`,
});

describe('home context', () => {
  it('reads the Home Assistant overview', () => {
    expect(parseLiveContext(LIVE_CONTEXT)).toEqual([
      {
        names: ['light_desktop_lightstrip', 'ruban led'],
        domain: 'light',
        state: 'off',
        area: 'Bureau',
      },
      { names: ['Lampe salon'], domain: 'light', state: 'on', area: 'Salon' },
    ]);
  });

  it('puts the current room first, whatever its accents or case', () => {
    const text = renderHomeContext(parseLiveContext(LIVE_CONTEXT), 'SALON', 1000);
    expect(text.indexOf('Lampe salon')).toBeLessThan(text.indexOf('ruban led'));
  });

  it('cuts the rest of the house first and says so', () => {
    const text = renderHomeContext(parseLiveContext(LIVE_CONTEXT), 'Salon', 130);
    expect(text).toContain('Lampe salon');
    expect(text).not.toContain('ruban led');
    expect(text).toContain('1 autres appareils');
  });
});

describe('tool history', () => {
  const messages = [
    { role: 'user' as const, content: 'allume le ruban', requestId: 'r1' },
    { role: 'assistant' as const, content: "C'est fait", requestId: 'r1' },
    { role: 'user' as const, content: 'mets-le en vert', requestId: 'r2' },
  ];
  const calls = [
    {
      requestId: 'r1',
      toolName: 'turn_on',
      arguments: { name: 'light_desktop_lightstrip' },
      result: 'ok',
      isError: false,
    },
  ];

  it('keeps what the tools said, in the order a model expects', () => {
    const history = withToolHistory(messages, calls, (name) => name);
    expect(history.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(history[1]?.toolCalls?.[0]?.arguments).toEqual({ name: 'light_desktop_lightstrip' });
  });

  it('counts tool calls in the context budget', () => {
    const big = 'x'.repeat(3000);
    const history = [
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [{ name: 'a', arguments: { big } }],
      },
    ];
    expect(fitHistory(history, '', '', 400)).toHaveLength(0);
  });
});

describe('memory rules', () => {
  it.each([
    ['Souviens-toi que je préfère 30 %.', 'je préfère 30 %'],
    ["Ayko, retiens que l'atelier c'est deux lampes", "l'atelier c'est deux lampes"],
    ["n'oublie pas que Sam dort tôt", 'Sam dort tôt'],
    ["rappelle-toi qu'il y a un chat", 'il y a un chat'],
  ])('saves from %s', (text, fact) => {
    expect(parseMemoryCommand(text)).toEqual({ type: 'remember', fact });
  });

  it('recognises a request to forget', () => {
    expect(parseMemoryCommand('Oublie que je préfère 30 %')).toEqual({
      type: 'forget',
      query: 'je préfère 30 %',
    });
  });

  it.each(['Allume le salon', 'Retiens-tu ce que je dis ?', 'Note la recette', 'Oublie ça'])(
    'stays out of %s',
    (text) => expect(parseMemoryCommand(text)).toBeNull(),
  );

  it('learns a nickname only when the phrase does not spell the device', () => {
    expect(learnableAlias("Éteins l'atelier", ['atelier droite', 'atelier gauche'])).toBe(
      'atelier',
    );
    expect(learnableAlias('Allume ma grande lampe', ['Kayo'])).toBe('grande lampe');
    expect(learnableAlias('Allume Kayo', ['Kayo'])).toBeNull();
    expect(learnableAlias('Allume atelier droite', ['atelier droite'])).toBeNull();
    expect(learnableAlias('Mets le ruban led en vert', ['ruban led'])).toBeNull();
  });
});

describe('agent with context and memory', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  const promptOf = async (events: AgentEvent[]) =>
    JSON.stringify((await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`)).prompt);
  const memories = () => h.api<Memory[]>('GET', '/memories');

  it('tells the model which devices exist', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'Bonjour', roomId: salon.id });
    const prompt = await promptOf(events);
    expect(prompt).toContain('Utilise exactement ces noms');
    expect(prompt).toContain('ruban led');
  });

  it('can turn the context source off', async () => {
    const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
    const tools = await h.api<McpTool[]>('GET', `/mcp/servers/${server?.id}/tools`);
    const tool = tools.find((item) => item.contextSource) as McpTool;
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { contextSource: false });
    const events = await h.chat({ text: 'Rebonjour' });
    expect(await promptOf(events)).not.toContain('Utilise exactement ces noms');
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { contextSource: true });
  });

  it('keeps tool results in the conversation', async () => {
    const salon = await h.room('Salon');
    const first = await h.chat({ text: 'Allume le salon', roomId: salon.id, bypassCache: true });
    const conversationId = (first[0] as { conversationId: string }).conversationId;
    const next = await h.chat({ text: 'Merci', roomId: salon.id, conversationId });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(next)}`);
    const { messages } = trace.prompt as { messages: { role: string; content: string }[] };
    expect(messages.find((message) => message.role === 'tool')?.content).toContain(
      'Lumière salon allumée',
    );
  });

  it('saves a memory without the model and offers it next time', async () => {
    const saved = await h.chat({ text: 'Souviens-toi que le chat dort dans le salon' });
    expect(answerOf(saved)).toContain('noté');
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(saved)}`);
    expect(trace.model).toBeNull();
    expect((await memories())[0]).toMatchObject({
      content: 'le chat dort dans le salon',
      source: 'user',
    });
    const next = await h.chat({ text: 'Où dort le chat ?' });
    expect(await promptOf(next)).toContain('le chat dort dans le salon');
  });

  it('does not save the same thing twice', async () => {
    await h.chat({ text: 'Souviens-toi que le chat dort dans le salon' });
    expect(await memories()).toHaveLength(1);
  });

  it('filters memories once there are many, keeping pinned ones', async () => {
    for (let index = 0; index < 8; index += 1) {
      await h.api('POST', '/memories', { content: `Fait numéro ${index} sur les plantes` });
    }
    await h.api('POST', '/memories', { content: 'Sam est allergique', pinned: true });
    const prompt = await promptOf(await h.chat({ text: 'Où dort le chat ?' }));
    expect(prompt).toContain('le chat dort');
    expect(prompt).toContain('Sam est allergique');
    expect(prompt).not.toContain('plantes');
  });

  it('forgets on request', async () => {
    const events = await h.chat({ text: 'Oublie que le chat dort dans le salon' });
    expect(answerOf(events)).toContain('oublié');
    const contents = (await memories()).map((memory) => memory.content);
    expect(contents).not.toContain('le chat dort dans le salon');
  });

  it('says so when there is nothing to forget', async () => {
    const events = await h.chat({ text: 'Oublie que les licornes volent' });
    expect(answerOf(events)).toContain('Je ne trouve');
  });

  it('continues the conversation of a room for a tablet session', async () => {
    const chambre = await h.room('Chambre');
    const run = (text: string) =>
      h.container.agent.run({ text, roomId: chambre.id, source: 'display' }, () => {});
    await run('Bonjour');
    const second = await run('Rebonjour');
    const trace = await h.api<Trace>('GET', `/traces/${second}`);
    expect(JSON.stringify(trace.prompt)).toContain('Bonjour');
    const conversations = await h.api<{ items: unknown[] }>(
      'GET',
      `/conversations?roomId=${chambre.id}`,
    );
    expect(conversations.items).toHaveLength(1);
  });
});
