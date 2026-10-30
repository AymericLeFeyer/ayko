import { describe, expect, it } from 'vitest';
import { createContainer } from '../src/container.js';
import type { McpConnection } from '../src/domain/mcp/McpConnection.js';
import { loadEnv } from '../src/shared/env.js';
import { sleep } from '../src/shared/async.js';

describe('MCP reconnection', () => {
  it('makes a single attempt, then waits for the admin', async () => {
    let attempts = 0;
    const env = loadEnv({ AYKO_MOCK: 'true', AYKO_FAKE_OLLAMA_PORT: '0', AYKO_LOG_LEVEL: 'error' });
    const container = await createContainer(env, {
      databaseFile: ':memory:',
      createMcpConnection: () =>
        ({
          connect: async () => {
            attempts += 1;
            throw new Error('Error POSTing to endpoint (HTTP 401)');
          },
          close: async () => {},
        }) as unknown as McpConnection,
    });
    const server = await container.registry.createServer({
      name: 'Home Assistant',
      transport: 'http',
      url: 'http://homeassistant.test:8123/api/mcp',
      args: [],
      enabled: true,
    });
    await sleep(50);
    const before = attempts;
    await sleep(1500);
    expect(attempts).toBe(before);

    const status = await container.registry.getServer(server.id);
    expect(status.status).toBe('error');
    expect(status.lastError).toContain('401');

    await container.registry.restart(server.id);
    expect(attempts).toBe(before + 1);
    await container.stop();
  });
});
