import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  displayServerMessage,
  type DisplayServerMessage,
  type McpServer,
  type McpTool,
  type PairingCreated,
  type PairingPoll,
  type WidgetData,
} from '@ayko/contracts';
import { startHarness, type Harness } from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

async function pair(roomId: string) {
  const pairing = (
    await h.app.inject({ method: 'POST', url: '/api/v1/pairing/request', payload: {} })
  ).json<PairingCreated>();
  await h.api('POST', '/pairing/confirm', { code: pairing.code, roomId });
  const poll = await h.app.inject({ url: `/api/v1/pairing/${pairing.pairingId}` });
  return poll.json<PairingPoll>().deviceToken as string;
}

const toolNamed = async (name: string) => {
  const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
  const tools = await h.api<McpTool[]>('GET', `/mcp/servers/${server?.id}/tools`);
  return tools.find((tool) => tool.name === name) as McpTool;
};

const widgetsFor = async (token: string) =>
  (
    await h.app.inject({
      url: '/api/v1/device/widgets',
      headers: { authorization: `Bearer ${token}` },
    })
  ).json<WidgetData>();

describe('rich blocks', () => {
  it('forwards the blocks a tool returns, on live runs and on replays', async () => {
    const salon = await h.room('Salon');
    const blocksOf = async () => {
      const events = await h.chat({ text: 'Quel est mon agenda ?', roomId: salon.id });
      return events.filter((event) => event.type === 'answer.blocks');
    };
    expect(await blocksOf()).toMatchObject([{ blocks: [{ type: 'calendar_events' }] }]);
    expect(await blocksOf()).toMatchObject([{ blocks: [{ type: 'calendar_events' }] }]);
  });
});

describe('home widgets', () => {
  it('serves read tools and refuses anything that acts', async () => {
    const salon = await h.room('Salon');
    const token = await pair(salon.id);
    const weather = await toolNamed('get_weather');
    const light = await toolNamed('light_turn_on');
    await h.api('PATCH', `/rooms/${salon.id}`, {
      config: { widgetTools: { weather: weather.id, calendar: light.id } },
    });
    const { widgets } = await widgetsFor(token);
    expect(widgets).toMatchObject([{ widget: 'weather', blocks: [{ type: 'weather' }] }]);
  });

  it('refuses an unknown device token', async () => {
    expect((await widgetsFor('nope')).widgets).toBeUndefined();
  });

  it('gives old rooms the defaults of new settings', async () => {
    const salon = await h.room('Salon');
    expect(salon.config).toMatchObject({ lightMode: false, nightStart: '22:00' });
  });
});

describe('dashboard mode', () => {
  const listen = async (token: string) => {
    const socket = new WebSocket(`${h.baseUrl.replace('http', 'ws')}/ws/display?token=${token}`);
    const frames: DisplayServerMessage[] = [];
    socket.on('message', (raw) =>
      frames.push(displayServerMessage.parse(JSON.parse(raw.toString()))),
    );
    await new Promise((resolve) => socket.once('open', resolve));
    return { socket, frames };
  };
  const activity = (frames: DisplayServerMessage[]) =>
    frames.filter((frame) => frame.type === 'house.activity');

  it('feeds the whole house to dashboard tablets only', async () => {
    const entree = await h.room('Entrée');
    const chambre = await h.room('Chambre');
    await h.api('PATCH', `/rooms/${entree.id}`, { config: { dashboardMode: true } });
    const dashboard = await listen(await pair(entree.id));
    const regular = await listen(await pair(chambre.id));

    await h.chat({ text: 'Bonjour', roomId: chambre.id });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(activity(dashboard.frames).map((frame) => frame.payload)).toMatchObject([
      { roomName: 'Chambre', text: 'Bonjour', status: 'running' },
      { roomName: 'Chambre', text: 'Bonjour', status: 'done' },
    ]);
    expect(activity(regular.frames)).toHaveLength(0);
    dashboard.socket.close();
    regular.socket.close();
  });
});
