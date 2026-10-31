import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentEvent, CacheEntry, McpServer, McpTool, Trace } from '@ayko/contracts';
import { oppositeToolName } from '../src/domain/mcp/services/toolBlocks.js';
import { requestIdOf, startHarness, type Harness } from './harness.js';

describe('oppositeToolName', () => {
  it('swaps on and off, keeping the style of the name', () => {
    expect(oppositeToolName('HassTurnOn')).toBe('HassTurnOff');
    expect(oppositeToolName('light_turn_off')).toBe('light_turn_on');
    expect(oppositeToolName('cover_set')).toBeNull();
  });
});

describe('card action', () => {
  let h: Harness;
  let tools: McpTool[];

  beforeAll(async () => {
    h = await startHarness();
    const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
    tools = await h.api<McpTool[]>('GET', `/mcp/servers/${server?.id}/tools`);
  });
  afterAll(() => h.close());

  const toolId = (name: string) => tools.find((tool) => tool.name === name)?.id as string;

  const tap = async (id: string, args: Record<string, unknown>) => {
    const salon = await h.room('Salon');
    const events: AgentEvent[] = [];
    await h.container.agent.run(
      {
        text: 'Éteins la lumière du salon',
        roomId: salon.id,
        source: 'display',
        directCall: { toolId: id, arguments: args },
      },
      (event) => {
        events.push(event);
        if (event.type === 'confirm.request') {
          // The confirmation is registered right after this event.
          queueMicrotask(() => h.container.agent.answerConfirmation(event.confirmId, false));
        }
      },
    );
    return events;
  };

  const blocksOf = (events: AgentEvent[]) =>
    events.flatMap((event) => (event.type === 'answer.blocks' ? event.blocks : []));

  it('runs the tool without the model and hands back the way to undo it', async () => {
    const events = await tap(toolId('light_turn_off'), { room: 'salon' });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.model).toBeNull();
    expect(trace.toolCalls.map((call) => call.toolName)).toEqual(['light_turn_off']);
    expect(blocksOf(events)[0]).toMatchObject({
      state: 'Éteinte',
      action: {
        label: 'Allumer',
        call: { toolId: toolId('light_turn_on'), arguments: { room: 'salon' } },
      },
    });
  });

  it('learns no shortcut from a tap', async () => {
    const entries = await h.api<CacheEntry[]>('GET', '/cache/entries');
    expect(entries.some((entry) => entry.sampleText === 'Éteins la lumière du salon')).toBe(false);
  });

  it('refuses a read-only or unknown tool, and bad arguments', async () => {
    const readOnly = tools.find((tool) => tool.readOnly) as McpTool;
    for (const events of [
      await tap(readOnly.id, {}),
      await tap('no-such-tool', {}),
      await tap(toolId('light_turn_off'), {}),
    ]) {
      expect(blocksOf(events)).toMatchObject([{ type: 'error' }]);
    }
  });

  it('still asks for a sensitive tool', async () => {
    const events = await tap(toolId('cover_set'), { room: 'salon', position: 0 });
    expect(events.some((event) => event.type === 'confirm.request')).toBe(true);
  });
});
