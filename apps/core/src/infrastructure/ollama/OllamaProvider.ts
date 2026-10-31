import type { OllamaModel, OllamaModelDetail, PullProgress, RunningModel } from '@ayko/contracts';
import type {
  LlmChatRequest,
  LlmChunk,
  LlmEndpointConfig,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
} from '../../domain/llm/LlmProvider.js';

interface OllamaTag {
  name: string;
  size: number;
  modified_at?: string;
  details?: { family?: string; parameter_size?: string; quantization_level?: string };
}

interface OllamaShow {
  capabilities?: string[];
  template?: string;
  parameters?: string;
  license?: string;
  details?: OllamaTag['details'];
  model_info?: Record<string, unknown>;
  modified_at?: string;
}

interface OllamaChatLine {
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  };
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

const toWireMessage = (message: LlmMessage) => ({
  role: message.role,
  content: message.content,
  ...(message.toolName ? { tool_name: message.toolName } : {}),
  ...(message.images?.length ? { images: message.images } : {}),
  ...(message.toolCalls
    ? {
        tool_calls: message.toolCalls.map((call: LlmToolCall) => ({
          function: { name: call.name, arguments: call.arguments },
        })),
      }
    : {}),
});

/** Ollama reads a string as a Go duration, so a bare `-1` must travel as a number. */
const toKeepAlive = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number(value) : value);

export class OllamaProvider implements LlmProvider {
  constructor(private readonly config: LlmEndpointConfig) {}

  /**
   * For calls that load a model: Ollama sends no response header until the model is in
   * memory, which takes minutes on a CPU. Reachability is checked first under the
   * connection timeout; the call itself is only bound by the caller's signal.
   */
  private async modelRequest(path: string, init: RequestInit): Promise<Response> {
    await this.request('/api/version', { signal: init.signal });
    return this.request(path, init, false);
  }

  private async request(path: string, init: RequestInit = {}, timed = true): Promise<Response> {
    const controller = new AbortController();
    const parent = init.signal;
    if (parent?.aborted) controller.abort(parent.reason);
    parent?.addEventListener('abort', () => controller.abort(parent.reason), { once: true });
    const timer = timed
      ? setTimeout(
          () =>
            controller.abort(new Error(`Ollama: délai de connexion dépassé (${this.config.url})`)),
          this.config.connectTimeoutMs,
        )
      : undefined;
    let response: Response;
    try {
      response = await fetch(`${this.config.url.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...this.config.headers, ...init.headers },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try {
        message = (JSON.parse(body) as { error?: string }).error ?? body;
      } catch {
        // Non-JSON error body: keep the raw text.
      }
      throw new Error(`Ollama ${response.status}: ${message}`);
    }
    return response;
  }

  private async *lines<T>(response: Response): AsyncGenerator<T> {
    if (!response.body) return;
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
        newline = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as T;
  }

  async version(signal?: AbortSignal) {
    const response = await this.request('/api/version', { signal });
    return ((await response.json()) as { version: string }).version;
  }

  private async show(name: string, signal?: AbortSignal): Promise<OllamaShow> {
    const response = await this.request('/api/show', {
      method: 'POST',
      body: JSON.stringify({ model: name }),
      signal,
    });
    return (await response.json()) as OllamaShow;
  }

  private toModel(tag: OllamaTag, show: OllamaShow | null): OllamaModel {
    const capabilities = show?.capabilities ?? [];
    return {
      name: tag.name,
      sizeBytes: tag.size,
      modifiedAt: tag.modified_at ?? null,
      family: tag.details?.family ?? null,
      parameterSize: tag.details?.parameter_size ?? null,
      quantization: tag.details?.quantization_level ?? null,
      supportsTools: capabilities.includes('tools'),
      supportsVision: capabilities.includes('vision'),
      supportsEmbedding: capabilities.includes('embedding'),
    };
  }

  async listModels(signal?: AbortSignal) {
    const response = await this.request('/api/tags', { signal });
    const { models } = (await response.json()) as { models: OllamaTag[] };
    return Promise.all(
      models.map(async (tag) =>
        this.toModel(tag, await this.show(tag.name, signal).catch(() => null)),
      ),
    );
  }

  async showModel(name: string, signal?: AbortSignal): Promise<OllamaModelDetail> {
    const show = await this.show(name, signal);
    const contextEntry = Object.entries(show.model_info ?? {}).find(([key]) =>
      key.endsWith('.context_length'),
    );
    return {
      ...this.toModel({ name, size: 0, details: show.details }, show),
      modifiedAt: show.modified_at ?? null,
      template: show.template ?? null,
      parameters: show.parameters ?? null,
      license: show.license ?? null,
      contextLength: typeof contextEntry?.[1] === 'number' ? contextEntry[1] : null,
    };
  }

  async running(signal?: AbortSignal): Promise<RunningModel[]> {
    const response = await this.request('/api/ps', { signal });
    const { models } = (await response.json()) as {
      models: { name: string; size: number; size_vram?: number; expires_at?: string }[];
    };
    return models.map((model) => ({
      name: model.name,
      sizeBytes: model.size,
      sizeVramBytes: model.size_vram ?? 0,
      expiresAt: model.expires_at ?? null,
    }));
  }

  async *pull(name: string, signal?: AbortSignal): AsyncGenerator<PullProgress> {
    const response = await this.modelRequest('/api/pull', {
      method: 'POST',
      body: JSON.stringify({ model: name, stream: true }),
      signal,
    });
    yield* this.lines<PullProgress>(response);
  }

  async deleteModel(name: string) {
    await this.request('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ model: name }),
    });
  }

  async *chat(request: LlmChatRequest, signal?: AbortSignal): AsyncGenerator<LlmChunk> {
    const { params } = request;
    const options = {
      ...(params?.temperature != null ? { temperature: params.temperature } : {}),
      ...(params?.numCtx != null ? { num_ctx: params.numCtx } : {}),
      ...(params?.topP != null ? { top_p: params.topP } : {}),
      ...(params?.maxTokens != null ? { num_predict: params.maxTokens } : {}),
    };
    const response = await this.modelRequest('/api/chat', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: request.model,
        stream: true,
        messages: request.messages.map(toWireMessage),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
            }
          : {}),
        ...(params?.keepAlive != null ? { keep_alive: toKeepAlive(params.keepAlive) } : {}),
        options,
      }),
    });
    for await (const line of this.lines<OllamaChatLine>(response)) {
      if (line.error) throw new Error(line.error);
      if (line.message?.thinking) yield { type: 'thinking', text: line.message.thinking };
      if (line.message?.content) yield { type: 'text', text: line.message.content };
      for (const call of line.message?.tool_calls ?? []) {
        yield { type: 'tool_call', call: call.function };
      }
      if (line.done) {
        yield {
          type: 'done',
          outputTokens: line.eval_count ?? null,
          evalDurationMs: line.eval_duration != null ? line.eval_duration / 1e6 : null,
          truncated: line.done_reason === 'length',
        };
      }
    }
  }

  async embed(model: string, text: string, signal?: AbortSignal) {
    const response = await this.modelRequest('/api/embed', {
      method: 'POST',
      body: JSON.stringify({ model, input: text }),
      signal,
    });
    const { embeddings } = (await response.json()) as { embeddings: number[][] };
    return embeddings[0] ?? [];
  }
}
