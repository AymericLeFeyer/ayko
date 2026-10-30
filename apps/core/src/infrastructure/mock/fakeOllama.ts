import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { sleep } from '../../shared/async.js';

interface FakeModel {
  name: string;
  size: number;
  capabilities: string[];
  family: string;
}

interface WireMessage {
  role: string;
  content: string;
  tool_calls?: unknown[];
}

interface WireTool {
  function: { name: string; parameters?: { properties?: Record<string, unknown> } };
}

const INITIAL_MODELS: FakeModel[] = [
  {
    name: 'mock-llama:latest',
    size: 2_100_000_000,
    capabilities: ['completion', 'tools'],
    family: 'llama',
  },
  { name: 'mock-tiny:latest', size: 400_000_000, capabilities: ['completion'], family: 'tiny' },
  { name: 'mock-embed:latest', size: 270_000_000, capabilities: ['embedding'], family: 'bert' },
];

const TOKEN_DELAY_MS = 25;

/** Minimal rule-based "model": turns device phrases into tool calls. */
function decide(text: string, tools: WireTool[]) {
  const lower = text.toLowerCase();
  const find = (name: string) => tools.find((tool) => tool.function.name === name);
  const room = ['salon', 'chambre', 'cuisine', 'entrée'].find((item) => lower.includes(item));
  if (/éteins|eteins|coupe/.test(lower) && find('light_turn_off')) {
    return { name: 'light_turn_off', arguments: { room: room ?? 'salon' } };
  }
  if (/allume/.test(lower) && find('light_turn_on')) {
    return { name: 'light_turn_on', arguments: { room: room ?? 'salon' } };
  }
  if (/volet/.test(lower) && find('cover_set')) {
    return {
      name: 'cover_set',
      arguments: { room: room ?? 'salon', position: /ouvre/.test(lower) ? 100 : 0 },
    };
  }
  if (/temp[ée]rature/.test(lower) && find('get_temperature')) {
    return { name: 'get_temperature', arguments: { room: room ?? 'salon' } };
  }
  if (/m[ée]t[ée]o/.test(lower) && find('get_weather')) {
    return { name: 'get_weather', arguments: {} };
  }
  if (/agenda|rendez-vous|calendrier/.test(lower) && find('get_calendar_events')) {
    return { name: 'get_calendar_events', arguments: {} };
  }
  if (/serrure|verrouille/.test(lower) && find('lock_door')) {
    return { name: 'lock_door', arguments: { door: 'entrée' } };
  }
  return null;
}

function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(32).fill(0);
  for (const word of text.toLowerCase().split(/\s+/)) {
    for (let index = 0; index < word.length; index += 1) {
      const slot = (word.charCodeAt(index) + index) % 32;
      vector[slot] = (vector[slot] ?? 0) + 1;
    }
  }
  return vector;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}) as T;
}

const sendJson = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};

const writeLine = (response: ServerResponse, value: unknown) =>
  response.write(`${JSON.stringify(value)}\n`);

/** Speaks the Ollama HTTP API, so mock mode exercises the real provider code path. */
export class FakeOllama {
  private readonly server: Server;
  private readonly models = [...INITIAL_MODELS];
  private loaded: string | null = null;

  constructor() {
    this.server = createServer((request, response) => {
      this.route(request, response).catch((error: unknown) => {
        if (!response.headersSent) sendJson(response, { error: String(error) }, 500);
        else response.end();
      });
    });
  }

  listen(port: number) {
    return new Promise<number>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    });
  }

  close() {
    this.server.closeAllConnections();
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async route(request: IncomingMessage, response: ServerResponse) {
    const path = request.url ?? '/';
    if (path === '/api/version') return sendJson(response, { version: '0.0.0-mock' });
    if (path === '/api/tags') {
      return sendJson(response, {
        models: this.models.map((model) => ({
          name: model.name,
          size: model.size,
          modified_at: '2026-10-01T10:00:00Z',
          details: { family: model.family, parameter_size: '7B', quantization_level: 'Q4_K_M' },
        })),
      });
    }
    if (path === '/api/show') {
      const { model: name } = await readJson<{ model: string }>(request);
      const model = this.models.find((item) => item.name === name);
      if (!model) return sendJson(response, { error: 'model not found' }, 404);
      return sendJson(response, {
        capabilities: model.capabilities,
        template: '{{ .Prompt }}',
        parameters: 'temperature 0.7',
        license: 'mock',
        details: { family: model.family },
        model_info: { 'mock.context_length': 8192 },
      });
    }
    if (path === '/api/ps') {
      const model = this.models.find((item) => item.name === this.loaded);
      return sendJson(response, {
        models: model
          ? [
              {
                name: model.name,
                size: model.size,
                size_vram: 0,
                expires_at: new Date(Date.now() + 300_000).toISOString(),
              },
            ]
          : [],
      });
    }
    if (path === '/api/pull') return this.pull(request, response);
    if (path === '/api/delete') {
      const { model: name } = await readJson<{ model: string }>(request);
      const index = this.models.findIndex((item) => item.name === name);
      if (index < 0) return sendJson(response, { error: 'model not found' }, 404);
      this.models.splice(index, 1);
      return sendJson(response, {});
    }
    if (path === '/api/chat') return this.chat(request, response);
    if (path === '/api/embed') {
      const { input } = await readJson<{ input: string }>(request);
      return sendJson(response, { embeddings: [fakeEmbedding(input)] });
    }
    return sendJson(response, { error: 'not found' }, 404);
  }

  private async pull(request: IncomingMessage, response: ServerResponse) {
    const { model: rawName } = await readJson<{ model: string }>(request);
    const name = rawName.includes(':') ? rawName : `${rawName}:latest`;
    const total = 200_000_000;
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });
    writeLine(response, { status: 'pulling manifest' });
    for (let completed = 0; completed <= total; completed += total / 10) {
      await sleep(120);
      writeLine(response, { status: 'downloading', completed, total });
    }
    if (!this.models.some((item) => item.name === name)) {
      this.models.push({
        name,
        size: total,
        capabilities: ['completion', 'tools'],
        family: 'mock',
      });
    }
    writeLine(response, { status: 'success' });
    response.end();
  }

  private async chat(request: IncomingMessage, response: ServerResponse) {
    const body = await readJson<{ model: string; messages: WireMessage[]; tools?: WireTool[] }>(
      request,
    );
    const model = this.models.find((item) => item.name === body.model);
    if (!model) return sendJson(response, { error: `model '${body.model}' not found` }, 404);
    this.loaded = model.name;
    response.writeHead(200, { 'content-type': 'application/x-ndjson' });
    let closed = false;
    response.once('close', () => {
      closed = true;
    });

    const last = body.messages[body.messages.length - 1];
    const lastUser = [...body.messages].reverse().find((message) => message.role === 'user');
    const started = performance.now();
    if (last?.role === 'user' && body.tools?.length) {
      const call = decide(last.content, body.tools);
      if (call) {
        await sleep(TOKEN_DELAY_MS * 4);
        writeLine(response, { message: { content: '', tool_calls: [{ function: call }] } });
        writeLine(response, { done: true, eval_count: 12, eval_duration: 100_000_000 });
        return response.end();
      }
    }
    const answer =
      last?.role === 'tool'
        ? `C'est fait. ${last.content}`
        : `Réponse simulée à : « ${lastUser?.content ?? ''} ». Le mode mock n'utilise aucun vrai modèle.`;
    const tokens = answer.split(/(?<=\s)/);
    for (const token of tokens) {
      if (closed) return undefined;
      await sleep(TOKEN_DELAY_MS);
      writeLine(response, { message: { content: token } });
    }
    writeLine(response, {
      done: true,
      eval_count: tokens.length,
      eval_duration: Math.round((performance.now() - started) * 1e6),
    });
    return response.end();
  }
}
