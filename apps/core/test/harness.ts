import type { AddressInfo } from 'node:net';
import type { AgentEvent, McpServer, Room } from '@ayko/contracts';
import { createContainer, type Container } from '../src/container.js';
import { buildServer } from '../src/presentation/http/server.js';
import { loadEnv } from '../src/shared/env.js';
import { sleep } from '../src/shared/async.js';

export const PASSWORD = 'correct-horse-battery';

export interface Harness {
  container: Container;
  app: Awaited<ReturnType<typeof buildServer>>;
  cookie: string;
  baseUrl: string;
  api<T = unknown>(method: string, path: string, payload?: unknown): Promise<T>;
  status(method: string, path: string, payload?: unknown): Promise<number>;
  chat(payload: Record<string, unknown>, onEvent?: (event: AgentEvent) => void): Promise<AgentEvent[]>;
  room(name: string): Promise<Room>;
  close(): Promise<void>;
}

/** Full stack in mock mode: real SQLite, real stdio MCP server, fake Ollama over HTTP. */
export async function startHarness(): Promise<Harness> {
  const env = loadEnv({ AYKO_MOCK: 'true', AYKO_FAKE_OLLAMA_PORT: '0', AYKO_LOG_LEVEL: 'error' });
  const container = await createContainer(env, { databaseFile: ':memory:' });
  const app = await buildServer(container);
  await container.start();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    payload: { username: 'admin', password: PASSWORD },
  });
  const cookie = setup.headers['set-cookie']?.toString().split(';')[0] ?? '';

  const send = (method: string, path: string, payload?: unknown) =>
    app.inject({
      method: method as 'GET',
      url: `/api/v1${path}`,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const harness: Harness = {
    container,
    app,
    cookie,
    baseUrl,
    async api<T>(method: string, path: string, payload?: unknown) {
      const response = await send(method, path, payload);
      if (response.statusCode >= 400) {
        throw new Error(`${method} ${path}: ${response.statusCode} ${response.body}`);
      }
      return response.json<T>();
    },
    async status(method, path, payload) {
      return (await send(method, path, payload)).statusCode;
    },
    async chat(payload, onEvent) {
      const response = await fetch(`${baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(payload),
      });
      const events: AgentEvent[] = [];
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of response.body!) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const line = buffer.slice(0, boundary).replace(/^data: /, '');
          buffer = buffer.slice(boundary + 2);
          const event = JSON.parse(line) as AgentEvent;
          events.push(event);
          onEvent?.(event);
          boundary = buffer.indexOf('\n\n');
        }
      }
      return events;
    },
    async room(name) {
      const rooms = await harness.api<Room[]>('GET', '/rooms');
      return rooms.find((room) => room.name === name) as Room;
    },
    async close() {
      await app.close();
      await container.stop();
    },
  };

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const servers = await harness.api<McpServer[]>('GET', '/mcp/servers');
    if (servers[0]?.status === 'connected') return harness;
    await sleep(50);
  }
  throw new Error('Mock MCP server did not connect');
}

export const answerOf = (events: AgentEvent[]) =>
  events
    .filter((event) => event.type === 'answer.delta')
    .map((event) => event.text)
    .join('');

export const requestIdOf = (events: AgentEvent[]) => {
  const accepted = events.find((event) => event.type === 'request.accepted');
  if (accepted?.type !== 'request.accepted') throw new Error('No request.accepted event');
  return accepted.requestId;
};
