import { randomUUID } from 'node:crypto';
import type {
  EndpointTestResult,
  HostMetrics,
  ModelRole,
  ModelRoleName,
  ModelTestEvent,
  OllamaEndpoint,
  ollamaEndpointInput,
  PullProgress,
} from '@ayko/contracts';
import type { z } from 'zod';
import type {
  LlmChatRequest,
  LlmChunk,
  LlmProvider,
  LlmProviderFactory,
} from '../../domain/llm/LlmProvider.js';
import type { EndpointRecord, LlmRepository } from '../../domain/llm/repositories/LlmRepository.js';
import {
  computeHostMetrics,
  defaultMetricsUrl,
  parseNodeMetrics,
  type HostSample,
} from '../../domain/llm/services/hostMetrics.js';
import type { Logger } from '../../domain/system/Logger.js';
import type { Vault } from '../../domain/system/Vault.js';
import { AppError, errorMessage, notFound } from '../../shared/errors.js';
import { isAbortError } from '../../shared/async.js';
import type { EventBus } from '../system/EventBus.js';

type EndpointInput = z.output<typeof ollamaEndpointInput>;

/** Owns endpoints, roles and failover; the rest of Core only sees `chat` and friends. */
export class OllamaService {
  private readonly toolSupport = new Map<string, boolean>();
  private readonly hosts = new Map<string, { sample: HostSample; metrics: HostMetrics }>();

  constructor(
    private readonly repository: LlmRepository,
    private readonly vault: Vault,
    private readonly createProvider: LlmProviderFactory,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    private readonly readMetrics: (url: string) => Promise<string>,
  ) {}

  private toDto({ headersSecretId: _secret, ...endpoint }: EndpointRecord): OllamaEndpoint {
    return { ...endpoint, host: this.hosts.get(endpoint.id)?.metrics ?? null };
  }

  async listEndpoints() {
    return (await this.repository.listEndpoints()).map((record) => this.toDto(record));
  }

  /** A missing exporter is a normal setup: it only hides the gauges, nothing is logged. */
  async pollHostMetrics() {
    const endpoints = (await this.repository.listEndpoints()).filter((item) => item.enabled);
    await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const text = await this.readMetrics(
            endpoint.metricsUrl ?? defaultMetricsUrl(endpoint.url),
          );
          const sample = parseNodeMetrics(text);
          if (!sample) throw new Error('Not a node_exporter page');
          const previous = this.hosts.get(endpoint.id)?.sample ?? null;
          const sampledAt = new Date().toISOString();
          const metrics = computeHostMetrics(sample, previous, sampledAt);
          this.hosts.set(endpoint.id, { sample, metrics });
        } catch {
          this.hosts.delete(endpoint.id);
        }
      }),
    );
    this.bus.publish({ topic: 'host.metrics' });
  }

  async createEndpoint(input: EndpointInput) {
    const headers = input.headers ?? {};
    const hasHeaders = Object.keys(headers).length > 0;
    const record: EndpointRecord = {
      id: randomUUID(),
      name: input.name,
      url: input.url,
      enabled: input.enabled,
      priority: input.priority,
      connectTimeoutMs: input.connectTimeoutMs,
      headersSecretId: hasHeaders ? await this.vault.store(headers) : null,
      headerNames: Object.keys(headers),
      lastStatus: 'unknown',
      lastLatencyMs: null,
      lastCheckedAt: null,
      version: null,
      metricsUrl: input.metricsUrl ?? null,
    };
    await this.repository.saveEndpoint(record);
    this.bus.publish({ topic: 'ollama.changed' });
    return this.toDto(record);
  }

  async updateEndpoint(id: string, input: Partial<EndpointInput>) {
    const current = await this.repository.findEndpoint(id);
    if (!current) throw notFound('Endpoint');
    const { headers, ...fields } = input;
    const record: EndpointRecord = { ...current, ...fields };
    if (headers) {
      record.headersSecretId = await this.vault.store(headers, current.headersSecretId);
      record.headerNames = Object.keys(headers);
    }
    await this.repository.saveEndpoint(record);
    this.hosts.delete(id);
    this.bus.publish({ topic: 'ollama.changed' });
    return this.toDto(record);
  }

  async deleteEndpoint(id: string) {
    const current = await this.repository.findEndpoint(id);
    if (!current || !(await this.repository.deleteEndpoint(id))) throw notFound('Endpoint');
    await this.vault.remove(current.headersSecretId);
    this.bus.publish({ topic: 'ollama.changed' });
  }

  private async providerFor(endpoint: EndpointRecord): Promise<LlmProvider> {
    return this.createProvider({
      url: endpoint.url,
      connectTimeoutMs: endpoint.connectTimeoutMs,
      headers: await this.vault.read(endpoint.headersSecretId),
    });
  }

  /** Enabled endpoints, healthy first: a known-down primary should not cost a timeout. */
  private async candidates() {
    const endpoints = (await this.repository.listEndpoints()).filter((item) => item.enabled);
    const rank = (status: EndpointRecord['lastStatus']) => (status === 'down' ? 1 : 0);
    return endpoints.sort(
      (a, b) => rank(a.lastStatus) - rank(b.lastStatus) || a.priority - b.priority,
    );
  }

  private async withProvider<T>(work: (provider: LlmProvider) => Promise<T>): Promise<T> {
    let lastError: unknown = new AppError('ollama_unavailable', 'Aucun endpoint Ollama actif', 503);
    for (const endpoint of await this.candidates()) {
      try {
        return await work(await this.providerFor(endpoint));
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastError = error;
        this.logger.log('warn', 'ollama', `${endpoint.name}: ${errorMessage(error)}`);
      }
    }
    throw lastError;
  }

  async testEndpoint(id: string): Promise<EndpointTestResult> {
    const endpoint = await this.repository.findEndpoint(id);
    if (!endpoint) throw notFound('Endpoint');
    return this.probe(endpoint);
  }

  private async probe(endpoint: EndpointRecord): Promise<EndpointTestResult> {
    const started = performance.now();
    const provider = await this.providerFor(endpoint);
    const finish = async (ok: boolean, version: string | null, error: string | null) => {
      const latencyMs = performance.now() - started;
      await this.repository.recordHealth(endpoint.id, {
        lastStatus: ok ? 'up' : 'down',
        lastLatencyMs: ok ? latencyMs : null,
        lastCheckedAt: new Date().toISOString(),
        version,
      });
      if (endpoint.lastStatus !== (ok ? 'up' : 'down')) {
        this.logger.log(
          ok ? 'info' : 'error',
          'ollama',
          `Endpoint ${endpoint.name} ${ok ? 'disponible' : `indisponible : ${error}`}`,
        );
        this.bus.publish({ topic: 'ollama.changed' });
      }
      return { ok, latencyMs, version, error };
    };
    try {
      return await finish(true, await provider.version(), null);
    } catch (error) {
      return finish(false, null, errorMessage(error));
    }
  }

  async checkHealth() {
    const endpoints = (await this.repository.listEndpoints()).filter((item) => item.enabled);
    await Promise.all(endpoints.map((endpoint) => this.probe(endpoint)));
  }

  listModels() {
    return this.withProvider((provider) => provider.listModels());
  }

  showModel(name: string) {
    return this.withProvider((provider) => provider.showModel(name));
  }

  running() {
    return this.withProvider((provider) => provider.running());
  }

  deleteModel(name: string) {
    this.toolSupport.delete(name);
    return this.withProvider((provider) => provider.deleteModel(name));
  }

  async *pull(name: string, signal?: AbortSignal): AsyncGenerator<PullProgress> {
    const [endpoint] = await this.candidates();
    if (!endpoint) throw new AppError('ollama_unavailable', 'Aucun endpoint Ollama actif', 503);
    const provider = await this.providerFor(endpoint);
    yield* provider.pull(name, signal);
    this.bus.publish({ topic: 'ollama.changed' });
  }

  listRoles() {
    return this.repository.listRoles();
  }

  /** Roles are read per request, so a change applies on the very next message. */
  async getRole(role: ModelRoleName) {
    return this.repository.findRole(role);
  }

  async saveRoles(roles: ModelRole[]) {
    for (const role of roles) await this.repository.saveRole(role);
    this.bus.publish({ topic: 'ollama.changed' });
    return this.repository.listRoles();
  }

  async supportsTools(model: string) {
    const known = this.toolSupport.get(model);
    if (known !== undefined) return known;
    const detail = await this.showModel(model);
    this.toolSupport.set(model, detail.supportsTools);
    return detail.supportsTools;
  }

  /** Failover only happens before the first chunk: a started stream cannot be resumed. */
  async *chat(request: LlmChatRequest, signal?: AbortSignal): AsyncGenerator<LlmChunk> {
    let lastError: unknown = new AppError('ollama_unavailable', 'Aucun endpoint Ollama actif', 503);
    for (const endpoint of await this.candidates()) {
      let started = false;
      try {
        const provider = await this.providerFor(endpoint);
        for await (const chunk of provider.chat(request, signal)) {
          started = true;
          yield chunk;
        }
        return;
      } catch (error) {
        if (started || isAbortError(error) || signal?.aborted) throw error;
        lastError = error;
        this.logger.log('warn', 'ollama', `${endpoint.name}: ${errorMessage(error)}`);
      }
    }
    throw lastError;
  }

  embed(model: string, text: string, signal?: AbortSignal) {
    return this.withProvider((provider) => provider.embed(model, text, signal));
  }

  async *testModel(
    request: Pick<LlmChatRequest, 'model' | 'params'> & { prompt: string },
    signal?: AbortSignal,
  ): AsyncGenerator<ModelTestEvent> {
    const started = performance.now();
    let ttftMs: number | null = null;
    let outputTokens = 0;
    let evalDurationMs: number | null = null;
    try {
      const messages = [{ role: 'user' as const, content: request.prompt }];
      for await (const chunk of this.chat(
        { model: request.model, messages, params: request.params },
        signal,
      )) {
        if (chunk.type === 'text') {
          ttftMs ??= performance.now() - started;
          yield { type: 'delta', text: chunk.text };
        } else if (chunk.type === 'done') {
          outputTokens = chunk.outputTokens ?? 0;
          evalDurationMs = chunk.evalDurationMs;
        }
      }
      const loaded = await this.running().catch(() => []);
      yield {
        type: 'done',
        ttftMs,
        tokensPerSecond:
          evalDurationMs && outputTokens ? (outputTokens * 1000) / evalDurationMs : null,
        totalMs: performance.now() - started,
        outputTokens,
        memoryBytes: loaded.find((item) => item.name === request.model)?.sizeBytes ?? null,
      };
    } catch (error) {
      if (!isAbortError(error)) yield { type: 'error', message: errorMessage(error) };
    }
  }

  async primaryStatus() {
    return this.repository.listEndpoints();
  }
}
