import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  displayServerMessage,
  type ConfigBundle,
  type Device,
  type DisplayServerMessage,
  type McpServer,
  type McpTool,
  type OllamaEndpoint,
  type OllamaModel,
  type PairingCreated,
  type PairingPoll,
  type Persona,
  type Trace,
} from '@ayko/contracts';
import { answerOf, PASSWORD, requestIdOf, startHarness, type Harness } from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const tools = async () => {
  const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
  return h.api<McpTool[]>('GET', `/mcp/servers/${server?.id}/tools`);
};
const toolNamed = async (name: string) => (await tools()).find((tool) => tool.name === name)!;

describe('foundations', () => {
  it('exposes a green /health without authentication', async () => {
    const response = await h.app.inject({ url: '/health' });
    expect(response.json()).toMatchObject({ status: 'ok', mock: true });
  });

  it('rejects anonymous admin calls with the normalised error body', async () => {
    const response = await h.app.inject({ url: '/api/v1/rooms' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'unauthorized' });
  });

  it('closes first-run setup once an admin exists', async () => {
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: { username: 'intruder', password: PASSWORD },
    });
    expect(response.statusCode).toBe(409);
  });

  it('refuses a wrong password', async () => {
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts an API key and stops accepting it once deleted', async () => {
    const key = await h.api<{ id: string; token: string }>('POST', '/api-keys', { name: 'ci' });
    const call = () =>
      h.app.inject({ url: '/api/v1/rooms', headers: { authorization: `Bearer ${key.token}` } });
    expect((await call()).statusCode).toBe(200);
    await h.api('DELETE', `/api-keys/${key.id}`);
    expect((await call()).statusCode).toBe(401);
  });

  it('validates input with a 400', async () => {
    expect(await h.status('POST', '/rooms', { name: '' })).toBe(400);
  });

  it('audits admin mutations', async () => {
    const room = await h.api<{ id: string }>('POST', '/rooms', { name: 'Audit' });
    await h.api('DELETE', `/rooms/${room.id}`);
    const audit = await h.api<{ items: { action: string }[] }>('GET', '/audit');
    expect(audit.items.some((item) => item.action === 'POST /api/v1/rooms')).toBe(true);
  });
});

describe('secrets', () => {
  it('stores MCP secrets encrypted and only returns their names', async () => {
    const server = await h.api<McpServer & { env?: unknown }>('POST', '/mcp/servers', {
      name: 'Secret',
      transport: 'http',
      url: 'http://127.0.0.1:9/mcp',
      headers: { Authorization: 'Bearer super-secret-value' },
      enabled: false,
    });
    expect(server.headerNames).toEqual(['Authorization']);
    expect(JSON.stringify(server)).not.toContain('super-secret-value');
    const exported = await h.api<ConfigBundle>('POST', '/config/export', { includeSecrets: true });
    expect(JSON.stringify(exported)).not.toContain('super-secret-value');
    await h.api('DELETE', `/mcp/servers/${server.id}`);
  });

  it('never exports secrets unless asked', async () => {
    const exported = await h.api<ConfigBundle>('POST', '/config/export', {});
    expect(exported.data.tables.secrets).toBeUndefined();
  });

  it('restores an exported configuration', async () => {
    const exported = await h.api<ConfigBundle>('POST', '/config/export', {});
    const created = await h.api<{ id: string }>('POST', '/rooms', { name: 'Éphémère' });
    await h.api('POST', '/config/import', exported);
    expect(await h.status('GET', `/rooms/${created.id}`)).toBe(404);
    expect(await h.room('Salon')).toBeDefined();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [server] = await h.api<McpServer[]>('GET', '/mcp/servers');
      if (server?.status === 'connected') return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('MCP did not reconnect after import');
  });
});

describe('ollama', () => {
  it('flags which models support tool calling', async () => {
    const models = await h.api<OllamaModel[]>('GET', '/ollama/models');
    expect(models.find((model) => model.name === 'mock-llama:latest')?.supportsTools).toBe(true);
    expect(models.find((model) => model.name === 'mock-tiny:latest')?.supportsTools).toBe(false);
  });

  it('pulls a model with streamed progress', async () => {
    const response = await fetch(`${h.baseUrl}/api/v1/ollama/models/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: h.cookie },
      body: JSON.stringify({ name: 'mock-new' }),
    });
    const text = await response.text();
    expect(text).toContain('"status":"downloading"');
    expect(text).toContain('"status":"success"');
    const models = await h.api<OllamaModel[]>('GET', '/ollama/models');
    expect(models.some((model) => model.name === 'mock-new:latest')).toBe(true);
  });

  it('deletes a model whose name contains a colon', async () => {
    await h.api('DELETE', '/ollama/models/mock-new:latest');
    const models = await h.api<OllamaModel[]>('GET', '/ollama/models');
    expect(models.some((model) => model.name === 'mock-new:latest')).toBe(false);
  });

  it('reports time to first token and throughput', async () => {
    const response = await fetch(`${h.baseUrl}/api/v1/ollama/models/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: h.cookie },
      body: JSON.stringify({ model: 'mock-llama:latest', prompt: 'Bonjour' }),
    });
    const events = (await response.text())
      .split('\n\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, '')) as Record<string, unknown>);
    const done = events.find((event) => event.type === 'done');
    expect(done?.ttftMs).toBeGreaterThan(0);
    expect(done?.tokensPerSecond).toBeGreaterThan(0);
    expect(done?.memoryBytes).toBeGreaterThan(0);
  });

  it('fails over to a healthy endpoint', async () => {
    const [primary] = await h.api<OllamaEndpoint[]>('GET', '/ollama/endpoints');
    await h.api('PATCH', `/ollama/endpoints/${primary?.id}`, { priority: 5 });
    const broken = await h.api<OllamaEndpoint>('POST', '/ollama/endpoints', {
      name: 'Panne',
      url: 'http://127.0.0.1:9',
      priority: 0,
      connectTimeoutMs: 200,
    });
    const events = await h.chat({ text: 'Bonjour', bypassCache: true });
    expect(answerOf(events)).toContain('Réponse simulée');
    await h.api('DELETE', `/ollama/endpoints/${broken.id}`);
  });
});

describe('agent loop', () => {
  it('streams an answer and writes a complete trace', async () => {
    const events = await h.chat({ text: 'Bonjour Ayko' });
    expect(answerOf(events)).toContain('Bonjour Ayko');
    expect(events.at(-1)).toMatchObject({ type: 'state.changed', state: 'idle' });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.status).toBe('done');
    expect(trace.ttftMs).toBeGreaterThan(0);
    expect(trace.prompt).toBeTruthy();
    expect(JSON.stringify(trace.prompt)).toContain('des données');
  });

  it('calls a tool, feeds the result back and traces the call', async () => {
    const salon = await h.room('Salon');
    const events = await h.chat({ text: 'Allume le salon', roomId: salon.id, bypassCache: true });
    expect(answerOf(events)).toContain('Lumière salon allumée');
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls).toMatchObject([{ toolName: 'light_turn_on', source: 'llm' }]);
  });

  it('never runs a forbidden tool, even for a room override', async () => {
    const salon = await h.room('Salon');
    const tool = await toolNamed('light_turn_off');
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, {
      roomOverrides: [{ roomId: salon.id, policy: 'forbidden' }],
    });
    const events = await h.chat({ text: 'Éteins le salon', roomId: salon.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls).toHaveLength(0);
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { roomOverrides: [] });
  });

  it('waits for confirmation on sensitive tools', async () => {
    const entree = await h.room('Entrée');
    expect((await toolNamed('lock_door')).policy).toBe('confirm');
    const events = await h.chat({ text: 'Verrouille la porte', roomId: entree.id }, (event) => {
      if (event.type === 'confirm.request') {
        void h.api('POST', '/chat/confirm', { confirmId: event.confirmId, accepted: true });
      }
    });
    expect(answerOf(events)).toContain('verrouillée');
  });

  it('does not run the tool when confirmation is refused', async () => {
    const entree = await h.room('Entrée');
    const events = await h.chat(
      { text: 'Verrouille la serrure', roomId: entree.id, bypassCache: true },
      (event) => {
        if (event.type === 'confirm.request') {
          void h.api('POST', '/chat/confirm', { confirmId: event.confirmId, accepted: false });
        }
      },
    );
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.toolCalls).toHaveLength(0);
  });

  it('cancels a running request immediately', async () => {
    const events = await h.chat({ text: 'Une longue réponse', bypassCache: true }, (event) => {
      if (event.type === 'answer.delta') {
        void h.api('POST', `/chat/${event.requestId}/cancel`);
      }
    });
    expect(events.find((event) => event.type === 'request.failed')).toMatchObject({
      code: 'cancelled',
    });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.status).toBe('cancelled');
  });

  it('keeps the conversation and allows replaying with another persona', async () => {
    const persona = await h.api<Persona>('POST', '/personas', {
      name: 'Majordome',
      systemPrompt: 'Tu es un majordome.',
      address: 'vous',
    });
    const first = await h.chat({ text: 'Bonjour' });
    const conversationId = (first[0] as { conversationId: string }).conversationId;
    const second = await h.chat({ text: 'Rebonjour', conversationId, personaId: persona.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(second)}`);
    expect(trace.personaName).toBe('Majordome');
    expect(JSON.stringify(trace.prompt)).toContain('Bonjour');
    const detail = await h.api<{ messages: unknown[] }>('GET', `/conversations/${conversationId}`);
    expect(detail.messages).toHaveLength(4);
  });

  it('versions personas and rolls back', async () => {
    const persona = await h.api<Persona>('POST', '/personas', {
      name: 'Versionnée',
      systemPrompt: 'v1',
    });
    await h.api('PATCH', `/personas/${persona.id}`, { systemPrompt: 'v2' });
    const restored = await h.api<Persona>('POST', `/personas/${persona.id}/rollback`, {
      version: 1,
    });
    expect(restored).toMatchObject({ systemPrompt: 'v1', version: 3 });
  });
});

describe('shortcut cache', () => {
  const entries = (roomId?: string) =>
    h.api<{ id: string; status: string; sampleText: string; hits: number; calls: unknown[] }[]>(
      'GET',
      `/cache/entries${roomId ? `?roomId=${roomId}` : ''}`,
    );

  it('learns from the LLM and replays without it', async () => {
    const chambre = await h.room('Chambre');
    const first = await h.chat({ text: 'Allume la chambre', roomId: chambre.id });
    expect((await h.api<Trace>('GET', `/traces/${requestIdOf(first)}`)).cache.outcome).toBe('miss');

    const second = await h.chat({ text: 'allumer la chambre !', roomId: chambre.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(second)}`);
    expect(trace.cache).toMatchObject({ outcome: 'hit', matchType: 'exact' });
    expect(trace.model).toBeNull();
    expect(trace.toolCalls).toMatchObject([{ toolName: 'light_turn_on', source: 'cache' }]);
    expect(answerOf(second)).toBe("C'est fait.");
    expect(second.find((event) => event.type === 'activity.step' && event.kind === 'cache_hit')).toBeTruthy();
  });

  it('isolates entries by room', async () => {
    const chambre = await h.room('Chambre');
    const entree = await h.room('Entrée');
    const events = await h.chat({ text: 'Allume la chambre', roomId: entree.id });
    expect((await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`)).cache.outcome).toBe('miss');
    const inChambre = await entries(chambre.id);
    const inEntree = await entries(entree.id);
    expect(inChambre).toHaveLength(1);
    expect(inEntree.some((entry) => entry.id === inChambre[0]?.id)).toBe(false);
  });

  it('applies a global entry to every room', async () => {
    const chambre = await h.room('Chambre');
    const salon = await h.room('Salon');
    const [entry] = await entries(chambre.id);
    await h.api('PATCH', `/cache/entries/${entry?.id}`, { global: true });
    const events = await h.chat({ text: 'Allume la chambre', roomId: salon.id });
    expect((await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`)).cache.outcome).toBe('hit');
    await h.api('PATCH', `/cache/entries/${entry?.id}`, { global: false });
  });

  it('calls read tools live on every hit', async () => {
    const salon = await h.room('Salon');
    await h.chat({ text: 'Quelle température ?', roomId: salon.id });
    const first = await h.chat({ text: 'Quelle température ?', roomId: salon.id });
    const second = await h.chat({ text: 'Quelle température ?', roomId: salon.id });
    for (const events of [first, second]) {
      const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
      expect(trace.cache.outcome).toBe('hit');
      expect(trace.toolCalls).toHaveLength(1);
      expect(answerOf(events)).toContain('°C');
    }
  });

  it('never caches ambiguous requests', async () => {
    const salon = await h.room('Salon');
    const before = (await entries()).length;
    await h.chat({ text: 'allume ça', roomId: salon.id });
    expect(await entries()).toHaveLength(before);
  });

  it('falls back on the LLM when a replay fails, then invalidates', async () => {
    const chambre = await h.room('Chambre');
    const [entry] = await entries(chambre.id);
    const unknownTool = {
      toolId: '00000000-0000-4000-8000-000000000000',
      serverId: '00000000-0000-4000-8000-000000000000',
      toolName: 'gone',
      arguments: {},
    };
    await h.api('PATCH', `/cache/entries/${entry?.id}`, { calls: [unknownTool] });
    const events = await h.chat({ text: 'Allume la chambre', roomId: chambre.id });
    expect(answerOf(events)).toContain('Lumière chambre allumée');
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.cache.outcome).toBe('miss');
    expect((await entries(chambre.id))[0]?.status).toBe('doubtful');

    for (let failure = 1; failure < 3; failure += 1) {
      await h.api('PATCH', `/cache/entries/${entry?.id}`, { calls: [unknownTool] });
      await h.chat({ text: 'Allume la chambre', roomId: chambre.id });
      if (failure === 1) expect((await entries(chambre.id))[0]?.status).toBe('doubtful');
    }
  });

  it('does not learn from a failed run', async () => {
    const salon = await h.room('Salon');
    const tool = await toolNamed('cover_set');
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { policy: 'forbidden' });
    await h.chat({ text: 'Ouvre le volet', roomId: salon.id });
    const learned = await entries(salon.id);
    expect(learned.some((entry) => entry.sampleText === 'Ouvre le volet')).toBe(false);
    await h.api('PUT', `/mcp/tools/${tool.id}/policy`, { policy: 'auto' });
  });

  it('respects the master switch while history keeps recording', async () => {
    const salon = await h.room('Salon');
    const settings = await h.api<Record<string, unknown>>('GET', '/cache/settings');
    await h.api('PUT', '/cache/settings', { ...settings, enabled: false });
    const events = await h.chat({ text: 'Allume le salon', roomId: salon.id });
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.cache.outcome).toBe('skipped');
    await h.api('PUT', '/cache/settings', settings);
    const history = await h.api<{ items: { occurrences: number; normalizedText: string }[] }>(
      'GET',
      '/history/requests',
    );
    const row = history.items.find((item) => item.normalizedText === 'allumer salon');
    expect(row?.occurrences).toBeGreaterThanOrEqual(2);
  });

  it('promotes an entry after enough occurrences and honours pinning', async () => {
    const salon = await h.room('Salon');
    const settings = await h.api<Record<string, unknown>>('GET', '/cache/settings');
    await h.api('PUT', '/cache/settings', { ...settings, minOccurrences: 1 });
    const [entry] = await entries(salon.id);
    await h.api('POST', `/cache/entries/${entry?.id}/pin`);
    const stats = await h.api<{ inMemory: number; hits: number }>('GET', '/cache/stats');
    expect(stats.inMemory).toBeGreaterThan(0);
    expect(stats.hits).toBeGreaterThan(0);
    await h.api('PUT', '/cache/settings', settings);
  });

  it('invalidates entries when a room is deleted', async () => {
    const room = await h.api<{ id: string }>('POST', '/rooms', { name: 'Temporaire' });
    await h.chat({ text: 'Allume le garage', roomId: room.id });
    const [entry] = await entries(room.id);
    await h.api('DELETE', `/rooms/${room.id}`);
    const after = await h.api<{ status: string }>('GET', `/cache/entries/${entry?.id}`);
    expect(after.status).toBe('invalidated');
  });

  it('clears the cache without touching history by default', async () => {
    const before = await h.api<{ items: unknown[] }>('GET', '/history/requests');
    const salon = await h.room('Salon');
    await h.api('POST', '/cache/clear', { roomId: salon.id });
    expect(await entries(salon.id)).toHaveLength(0);
    const after = await h.api<{ items: unknown[] }>('GET', '/history/requests');
    expect(after.items).toHaveLength(before.items.length);
    await h.api('POST', '/cache/clear', { includeHistory: true });
    expect(await entries()).toHaveLength(0);
    expect((await h.api<{ items: unknown[] }>('GET', '/history/requests')).items).toHaveLength(0);
  });
});

describe('pairing and tablets', () => {
  const connect = (token: string) => {
    const socket = new WebSocket(`${h.baseUrl.replace('http', 'ws')}/ws/display?token=${token}`);
    const frames: DisplayServerMessage[] = [];
    socket.on('message', (raw) => frames.push(displayServerMessage.parse(JSON.parse(raw.toString()))));
    return { socket, frames };
  };
  const until = async (check: () => boolean) => {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(check()).toBe(true);
  };

  it('pairs a tablet, hands the token once and drives it over WebSocket', async () => {
    const pairing = (
      await h.app.inject({ method: 'POST', url: '/api/v1/pairing/request', payload: {} })
    ).json<PairingCreated>();
    const poll = async () =>
      (await h.app.inject({ url: `/api/v1/pairing/${pairing.pairingId}` })).json<PairingPoll>();
    expect((await poll()).status).toBe('pending');

    const salon = await h.room('Salon');
    const device = await h.api<Device>('POST', '/pairing/confirm', {
      code: pairing.code,
      roomId: salon.id,
      deviceName: 'Tablette salon',
    });
    const collected = await poll();
    expect(collected.deviceToken).toBeTruthy();
    expect((await poll()).deviceToken).toBeNull();

    const { socket, frames } = connect(collected.deviceToken as string);
    await new Promise((resolve) => socket.once('open', resolve));
    await until(() => h.container.hub.isOnline(device.id));
    expect((await h.api<Device>('GET', `/devices/${device.id}`)).online).toBe(true);

    socket.send(
      JSON.stringify({
        type: 'user.text',
        room: salon.id,
        ts: new Date().toISOString(),
        payload: { text: 'Bonjour' },
      }),
    );
    await until(() => frames.some((frame) => frame.type === 'answer.done'));
    expect(frames.some((frame) => frame.type === 'answer.delta')).toBe(true);

    await h.api('POST', `/devices/${device.id}/command`, { command: 'reload' });
    await until(() => frames.some((frame) => frame.type === 'device.command'));

    await h.api('PATCH', `/rooms/${salon.id}`, { config: { nightBrightness: 10 } });
    await until(() => frames.some((frame) => frame.type === 'config.updated'));

    await h.api('PATCH', `/devices/${device.id}`, { revoked: true });
    await until(() => socket.readyState === WebSocket.CLOSED);
    const refused = connect(collected.deviceToken as string);
    await until(() => refused.socket.readyState === WebSocket.CLOSED);
  });

  it('refuses an unknown token and scopes the device route', async () => {
    const { socket } = connect('nope');
    await until(() => socket.readyState === WebSocket.CLOSED);
    const response = await h.app.inject({
      url: '/api/v1/device/config',
      headers: { authorization: 'Bearer nope' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('voice and logs', () => {
  it('tests the fake providers shipped by default', async () => {
    const providers = await h.api<{ id: string; slot: string }[]>('GET', '/voice/providers');
    expect(providers.map((provider) => provider.slot).sort()).toEqual(['stt', 'tts', 'wake_word']);
    const result = await h.api<{ ok: boolean }>('POST', `/voice/providers/${providers[0]?.id}/test`);
    expect(result.ok).toBe(true);
  });

  it('refuses two active providers in one slot', async () => {
    const payload = ['a', 'b'].map((name) => ({
      slot: 'stt',
      kind: 'fake',
      name,
      active: true,
      config: {},
    }));
    expect(await h.status('PUT', '/voice/providers', payload)).toBe(400);
  });

  it('paginates with a cursor', async () => {
    h.container.logger.log('error', 'test', 'un');
    h.container.logger.log('error', 'test', 'deux');
    const first = await h.api<{ items: { message: string }[]; nextCursor: string }>(
      'GET',
      '/logs?component=test&limit=1',
    );
    expect(first.nextCursor).toBeTruthy();
    const second = await h.api<{ items: { message: string }[] }>(
      'GET',
      `/logs?component=test&limit=1&cursor=${first.nextCursor}`,
    );
    expect(second.items[0]?.message).not.toBe(first.items[0]?.message);
  });

  it('reports every component on the dashboard', async () => {
    const metrics = await h.api<{ components: { kind: string }[]; requests24h: number }>(
      'GET',
      '/metrics',
    );
    const kinds = metrics.components.map((component) => component.kind);
    expect(kinds).toEqual(expect.arrayContaining(['database', 'ollama', 'mcp', 'rooms']));
    expect(metrics.requests24h).toBeGreaterThan(0);
  });
});
