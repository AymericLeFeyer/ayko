import { randomUUID } from 'node:crypto';
import type {
  CacheClear,
  CachedCall,
  CacheEntry,
  CacheEntryUpdate,
  CacheSettings,
  CacheStats,
  HistoryEntry,
} from '@ayko/contracts';
import type {
  CacheEntryFilter,
  CacheEntryRecord,
  CacheRepository,
  HistoryFilter,
} from '../../domain/cache/repositories/CacheRepository.js';
import { isCacheableText, normalizeText } from '../../domain/cache/services/normalizeText.js';
import { cosineSimilarity } from '../../domain/cache/services/similarity.js';
import type { McpToolRecord } from '../../domain/mcp/repositories/McpRepository.js';
import { isNeverCached } from '../../domain/mcp/services/toolPolicy.js';
import type { Logger } from '../../domain/system/Logger.js';
import type { SystemRepository } from '../../domain/system/repositories/SystemRepository.js';
import { AppError, errorMessage, notFound } from '../../shared/errors.js';
import type { OllamaService } from '../llm/OllamaService.js';
import type { EventBus } from '../system/EventBus.js';

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  enabled: true,
  topN: 50,
  minOccurrences: 3,
  maxFailures: 3,
  approximateEnabled: false,
  similarityThreshold: 0.88,
  defaultResponse: "C'est fait.",
  disabledRoomIds: [],
  historyRetentionDays: 90,
};

const EMBEDDING_TIMEOUT_MS = 3000;

export interface CacheMatch {
  entry: CacheEntryRecord;
  matchType: 'exact' | 'approximate';
}

export interface ExecutedCall {
  tool: McpToolRecord;
  arguments: Record<string, unknown>;
  result: string;
}

const keyFor = (normalized: string, roomId: string | null, global: boolean) =>
  `${normalized}|${global ? '*' : (roomId ?? 'none')}`;

const callsKey = (calls: { toolName: string; arguments: unknown }[]) =>
  JSON.stringify(calls.map((call) => [call.toolName, call.arguments]));

const usable = (entry: CacheEntryRecord) =>
  entry.status === 'active' || entry.status === 'pinned' || entry.status === 'doubtful';

export class CacheService {
  /** Top N in RAM: the instant path, avoiding even a SQLite read. */
  private index = new Map<string, CacheEntryRecord>();
  private topIds = new Set<string>();
  private settingsCache: CacheSettings | null = null;

  constructor(
    private readonly repository: CacheRepository,
    private readonly systemRepository: SystemRepository,
    private readonly ollama: OllamaService,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    private readonly roomName: (roomId: string) => Promise<string | null>,
  ) {}

  async settings(): Promise<CacheSettings> {
    this.settingsCache ??= {
      ...DEFAULT_CACHE_SETTINGS,
      ...(await this.repository.getSettings()),
    };
    return this.settingsCache;
  }

  async updateSettings(settings: CacheSettings) {
    await this.repository.saveSettings(settings);
    this.settingsCache = settings;
    await this.refreshIndex();
    return settings;
  }

  async refreshIndex() {
    const settings = await this.settings();
    const top = await this.repository.topEntries(settings.topN, settings.minOccurrences);
    this.index = new Map();
    this.topIds = new Set(top.map((entry) => entry.id));
    for (const entry of top) this.indexEntry(entry);
    this.bus.publish({ topic: 'cache.changed' });
  }

  private indexEntry(entry: CacheEntryRecord) {
    const scope = entry.global ? '*' : (entry.roomId ?? 'none');
    this.index.set(`${entry.normalizedText}|${scope}`, entry);
    for (const alias of entry.aliasKeys) this.index.set(`${alias}|${scope}`, entry);
  }

  async isEnabledFor(roomId: string | null) {
    const settings = await this.settings();
    return settings.enabled && !(roomId && settings.disabledRoomIds.includes(roomId));
  }

  async lookup(
    text: string,
    roomId: string | null,
    signal?: AbortSignal,
  ): Promise<CacheMatch | null> {
    if (!isCacheableText(text)) return null;
    const normalized = normalizeText(text);
    if (!normalized) return null;
    const fromIndex =
      this.index.get(keyFor(normalized, roomId, false)) ??
      this.index.get(keyFor(normalized, roomId, true));
    const exact = fromIndex ?? (await this.repository.lookup(normalized, roomId));
    if (exact) return usable(exact) ? { entry: exact, matchType: 'exact' } : null;
    return this.lookupApproximate(text, roomId, signal);
  }

  private async lookupApproximate(text: string, roomId: string | null, signal?: AbortSignal) {
    const settings = await this.settings();
    if (!settings.approximateEnabled) return null;
    const role = await this.ollama.getRole('embeddings');
    if (!role?.model) return null;
    try {
      const timeout = AbortSignal.timeout(EMBEDDING_TIMEOUT_MS);
      const vector = await this.ollama.embed(
        role.model,
        text,
        signal ? AbortSignal.any([signal, timeout]) : timeout,
      );
      let best: { entry: CacheEntryRecord; score: number } | null = null;
      for (const entry of await this.repository.listEmbedded(roomId)) {
        const score = cosineSimilarity(vector, entry.embedding ?? []);
        if (score >= settings.similarityThreshold && score > (best?.score ?? 0)) {
          best = { entry, score };
        }
      }
      return best ? { entry: best.entry, matchType: 'approximate' as const } : null;
    } catch (error) {
      // An unreachable embedding model only loses the shortcut, never the request.
      this.logger.log('warn', 'cache', `Embeddings indisponibles : ${errorMessage(error)}`);
      return null;
    }
  }

  async recordHit(entry: CacheEntryRecord, lastResult?: string) {
    const now = new Date().toISOString();
    const updated: CacheEntryRecord = {
      ...entry,
      hits: entry.hits + 1,
      occurrences: entry.occurrences + 1,
      lastHitAt: now,
      failures: 0,
      status: entry.status === 'doubtful' ? 'active' : entry.status,
      ...(lastResult === undefined ? {} : { lastResult, lastResultAt: now }),
    };
    await this.repository.saveEntry(updated);
    await this.syncIndex(updated);
  }

  private async syncIndex(entry: CacheEntryRecord) {
    const settings = await this.settings();
    const promoted =
      !this.topIds.has(entry.id) &&
      entry.status === 'active' &&
      entry.occurrences >= settings.minOccurrences;
    if (promoted) return this.refreshIndex();
    if (this.topIds.has(entry.id)) this.indexEntry(entry);
    this.bus.publish({ topic: 'cache.changed' });
  }

  /** Failed replay: doubtful first, invalidated once the failure limit is reached. */
  async recordFailure(entry: CacheEntryRecord, reason: string) {
    const settings = await this.settings();
    const failures = entry.failures + 1;
    const status = failures >= settings.maxFailures ? 'invalidated' : 'doubtful';
    await this.repository.saveEntry({ ...entry, failures, status });
    this.logger.log('warn', 'cache', `Rejeu échoué (${entry.sampleText}) : ${reason}`, {
      roomId: entry.roomId,
    });
    await this.refreshIndex();
  }

  /** History is always recorded, cache on or off. Returns the aggregate's group key. */
  async recordHistory(input: {
    text: string;
    roomId: string | null;
    deviceId: string | null;
    calls: ExecutedCall[];
    durationMs: number;
  }) {
    const normalized = normalizeText(input.text);
    const calls = input.calls.map((call) => ({
      toolId: call.tool.id,
      serverId: call.tool.serverId,
      serverName: call.tool.serverName,
      toolName: call.tool.name,
      arguments: call.arguments,
      result: call.result.slice(0, 2000),
    }));
    const groupKey = `${normalized}|${input.roomId ?? 'none'}|${callsKey(calls)}`;
    const now = new Date().toISOString();
    await this.repository.upsertHistory({
      id: randomUUID(),
      groupKey,
      rawText: input.text,
      normalizedText: normalized,
      roomId: input.roomId,
      deviceId: input.deviceId,
      calls,
      durationMs: input.durationMs,
      firstSeenAt: now,
      lastSeenAt: now,
      cacheEntryId: null,
    });
    return groupKey;
  }

  /** Called only after a run the LLM finished without any tool error (spec 4.9 §5). */
  async learn(input: {
    text: string;
    roomId: string | null;
    calls: ExecutedCall[];
    response: string;
    durationMs: number;
    historyKey: string;
  }) {
    const settings = await this.settings();
    if (!isCacheableText(input.text) || input.calls.length === 0) return;
    if (input.calls.some(({ tool }) => isNeverCached(tool.name) || !tool.cacheEnabled)) return;
    const normalized = normalizeText(input.text);
    if (!normalized) return;
    const cacheKey = keyFor(normalized, input.roomId, false);
    const existing = await this.repository.findByKey(cacheKey);
    if (existing?.status === 'excluded') return;

    const kind = input.calls.every(({ tool }) => tool.readOnly) ? 'read' : 'action';
    const calls: CachedCall[] = input.calls.map(({ tool, arguments: args }) => ({
      toolId: tool.id,
      serverId: tool.serverId,
      toolName: tool.name,
      arguments: args,
    }));
    const entry: CacheEntryRecord = {
      id: existing?.id ?? randomUUID(),
      cacheKey,
      normalizedText: normalized,
      sampleText: input.text,
      roomId: input.roomId,
      global: existing?.global ?? false,
      kind,
      calls,
      response: kind === 'action' ? settings.defaultResponse : '',
      aliases: existing?.aliases ?? [],
      aliasKeys: existing?.aliasKeys ?? [],
      // A doubtful entry keeps its failure count: only a successful replay clears it.
      status: existing?.status === 'pinned' || existing?.status === 'doubtful' ? existing.status : 'active',
      hits: existing?.hits ?? 0,
      failures: existing?.status === 'doubtful' ? existing.failures : 0,
      occurrences: (existing?.occurrences ?? 0) + 1,
      ttlSeconds: existing?.ttlSeconds ?? null,
      lastResult: null,
      lastResultAt: null,
      llmDurationMs: input.durationMs,
      embedding: existing?.embedding ?? (await this.computeEmbedding(input.text)),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastHitAt: existing?.lastHitAt ?? null,
    };
    await this.repository.saveEntry(entry);
    await this.repository.linkHistory(input.historyKey, entry.id);
    await this.syncIndex(entry);
  }

  private async computeEmbedding(text: string) {
    const settings = await this.settings();
    if (!settings.approximateEnabled) return null;
    const role = await this.ollama.getRole('embeddings');
    if (!role?.model) return null;
    return this.ollama.embed(role.model, text).catch(() => null);
  }

  private async toDto(entry: CacheEntryRecord): Promise<CacheEntry> {
    const {
      cacheKey: _key,
      aliasKeys: _aliases,
      embedding,
      lastResult: _result,
      lastResultAt: _at,
      ...fields
    } = entry;
    return {
      ...fields,
      roomName: entry.roomId ? await this.roomName(entry.roomId) : null,
      inTopN: this.topIds.has(entry.id),
      hasEmbedding: embedding !== null,
    };
  }

  async listEntries(filter: CacheEntryFilter) {
    const entries = await this.repository.listEntries(filter);
    return Promise.all(entries.map((entry) => this.toDto(entry)));
  }

  async getEntry(id: string) {
    const entry = await this.repository.findEntry(id);
    if (!entry) throw notFound('Entrée de cache');
    return this.toDto(entry);
  }

  async updateEntry(id: string, update: CacheEntryUpdate) {
    const entry = await this.repository.findEntry(id);
    if (!entry) throw notFound('Entrée de cache');
    const global = update.global ?? entry.global;
    const updated: CacheEntryRecord = {
      ...entry,
      ...update,
      global,
      cacheKey: keyFor(entry.normalizedText, entry.roomId, global),
      aliasKeys: update.aliases ? update.aliases.map(normalizeText) : entry.aliasKeys,
      // A manual status change gives the entry a clean slate.
      failures: update.status ? 0 : entry.failures,
    };
    await this.repository.saveEntry(updated);
    await this.refreshIndex();
    return this.toDto(updated);
  }

  async togglePin(id: string) {
    const entry = await this.repository.findEntry(id);
    if (!entry) throw notFound('Entrée de cache');
    return this.updateEntry(id, { status: entry.status === 'pinned' ? 'active' : 'pinned' });
  }

  async deleteEntry(id: string) {
    if (!(await this.repository.deleteEntry(id))) throw notFound('Entrée de cache');
    await this.refreshIndex();
  }

  /** One click from the history page: the entry is pinned, so it is immediately in the top. */
  async promote(historyId: string) {
    const history = await this.repository.findHistory(historyId);
    if (!history) throw notFound('Historique');
    const settings = await this.settings();
    if (history.calls.some((call) => !call.toolId || !call.serverId)) {
      throw new AppError('not_promotable', 'Cette entrée référence un outil disparu', 409);
    }
    const cacheKey = keyFor(history.normalizedText, history.roomId, false);
    const existing = await this.repository.findByKey(cacheKey);
    const entry: CacheEntryRecord = {
      ...(existing ?? {
        id: randomUUID(),
        cacheKey,
        normalizedText: history.normalizedText,
        sampleText: history.rawText,
        roomId: history.roomId,
        global: false,
        kind: 'action' as const,
        response: settings.defaultResponse,
        aliases: [],
        aliasKeys: [],
        hits: 0,
        failures: 0,
        ttlSeconds: null,
        lastResult: null,
        lastResultAt: null,
        llmDurationMs: history.avgDurationMs,
        embedding: await this.computeEmbedding(history.rawText),
        createdAt: new Date().toISOString(),
        lastHitAt: null,
      }),
      calls: history.calls.map((call) => ({
        toolId: call.toolId as string,
        serverId: call.serverId as string,
        toolName: call.toolName,
        arguments: call.arguments as Record<string, unknown>,
      })),
      occurrences: history.occurrences,
      status: 'pinned',
    };
    await this.repository.saveEntry(entry);
    await this.repository.linkHistory(history.groupKey, entry.id);
    await this.refreshIndex();
    return this.toDto(entry);
  }

  async clear(filter: CacheClear) {
    const entries = await this.matching(filter);
    for (const entry of entries) await this.repository.deleteEntry(entry.id);
    const history = filter.includeHistory ? await this.repository.clearHistory(filter) : 0;
    await this.refreshIndex();
    return { entries: entries.length, history };
  }

  private async matching(filter: Pick<CacheClear, 'roomId' | 'toolId' | 'serverId'>) {
    const entries = await this.repository.listEntries({ roomId: filter.roomId });
    return entries.filter(
      (entry) =>
        (!filter.toolId || entry.calls.some((call) => call.toolId === filter.toolId)) &&
        (!filter.serverId || entry.calls.some((call) => call.serverId === filter.serverId)),
    );
  }

  private async invalidate(filter: Pick<CacheClear, 'roomId' | 'toolId' | 'serverId'>) {
    const entries = await this.matching(filter);
    for (const entry of entries) {
      if (entry.status !== 'excluded') {
        await this.repository.saveEntry({ ...entry, status: 'invalidated' });
      }
    }
    if (entries.length > 0) await this.refreshIndex();
  }

  invalidateTool(toolId: string) {
    return this.invalidate({ toolId });
  }

  invalidateServer(serverId: string) {
    return this.invalidate({ serverId });
  }

  invalidateRoom(roomId: string) {
    return this.invalidate({ roomId });
  }

  async stats(): Promise<CacheStats> {
    const entries = await this.repository.listEntries({});
    const requests = await this.systemRepository.requestStats('1970-01-01T00:00:00.000Z');
    const total = requests.hits + requests.misses;
    const toDtos = (list: CacheEntryRecord[]) =>
      Promise.all(list.map((entry) => this.toDto(entry)));
    return {
      hits: requests.hits,
      misses: requests.misses,
      hitRate: total > 0 ? requests.hits / total : 0,
      avgSavedMs: await this.repository.averageSavedMs(),
      entries: entries.length,
      inMemory: this.topIds.size,
      doubtful: await toDtos(entries.filter((entry) => entry.status === 'doubtful')),
      top: await toDtos([...entries].sort((a, b) => b.hits - a.hits).slice(0, 10)),
    };
  }

  async listHistory(filter: HistoryFilter, limit: number, cursor?: string) {
    const page = await this.repository.listHistory(filter, limit, cursor);
    const items: HistoryEntry[] = await Promise.all(
      page.items.map(async ({ groupKey: _key, ...item }) => ({
        ...item,
        roomName: item.roomId ? await this.roomName(item.roomId) : null,
      })),
    );
    return { items, nextCursor: page.nextCursor };
  }

  async getHistory(id: string) {
    const history = await this.repository.findHistory(id);
    if (!history) throw notFound('Historique');
    const { groupKey: _key, ...item } = history;
    return { ...item, roomName: item.roomId ? await this.roomName(item.roomId) : null };
  }

  async purgeHistory() {
    const { historyRetentionDays } = await this.settings();
    const cutoff = new Date(Date.now() - historyRetentionDays * 86_400_000).toISOString();
    await this.repository.purgeHistory(cutoff);
  }
}
