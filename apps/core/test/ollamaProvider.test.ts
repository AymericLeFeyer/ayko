import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OllamaProvider } from '../src/infrastructure/ollama/OllamaProvider.js';

const CONNECT_TIMEOUT_MS = 100;
const MODEL_LOAD_MS = 400;

describe('OllamaProvider timeouts', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // Like Ollama: no response headers at all until the model is loaded.
    server = createServer((request, response) => {
      if (request.url === '/api/version') {
        response.end(JSON.stringify({ version: 'test' }));
        return;
      }
      setTimeout(() => {
        response.write(`${JSON.stringify({ message: { content: 'Bonjour' } })}\n`);
        response.end(`${JSON.stringify({ done: true, eval_count: 1, eval_duration: 1000 })}\n`);
      }, MODEL_LOAD_MS);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('lets a slow-loading model answer past the connection timeout', async () => {
    const provider = new OllamaProvider({
      url,
      headers: {},
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
    });
    const text: string[] = [];
    for await (const chunk of provider.chat({
      model: 'slow',
      messages: [{ role: 'user', content: 'Bonjour' }],
    })) {
      if (chunk.type === 'text') text.push(chunk.text);
    }
    expect(text.join('')).toBe('Bonjour');
  });

  it('still fails fast on a server that cannot be reached', async () => {
    const provider = new OllamaProvider({
      url: 'http://127.0.0.1:9',
      headers: {},
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
    });
    const chat = provider.chat({ model: 'any', messages: [] });
    await expect(chat.next()).rejects.toThrow();
  });
});
