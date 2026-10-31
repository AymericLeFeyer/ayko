import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const cacheStatus = z.enum(['active', 'pinned', 'excluded', 'doubtful', 'invalidated']);
export type CacheStatus = z.infer<typeof cacheStatus>;

/** `manual`: dictated to Ayko. `learned`: picked up after a successful LLM run. */
export const cacheOrigin = z.enum(['learned', 'manual']);
export type CacheOrigin = z.infer<typeof cacheOrigin>;

export const cachedCall = z.object({
  toolId: uuid,
  serverId: uuid,
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type CachedCall = z.infer<typeof cachedCall>;

export const cacheEntry = z.object({
  id: uuid,
  normalizedText: z.string(),
  sampleText: z.string(),
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  global: z.boolean(),
  kind: z.enum(['action', 'read']),
  calls: z.array(cachedCall),
  response: z.string(),
  aliases: z.array(z.string()),
  status: cacheStatus,
  origin: cacheOrigin,
  hits: z.number().int(),
  failures: z.number().int(),
  occurrences: z.number().int(),
  inTopN: z.boolean(),
  ttlSeconds: z.number().int().nullable(),
  llmDurationMs: z.number().nullable(),
  hasEmbedding: z.boolean(),
  createdAt: isoDate,
  lastHitAt: isoDate.nullable(),
});
export type CacheEntry = z.infer<typeof cacheEntry>;

export const cacheEntryUpdate = z.object({
  aliases: z.array(z.string().min(1)).optional(),
  calls: z.array(cachedCall).optional(),
  response: z.string().optional(),
  ttlSeconds: z.number().int().min(1).nullable().optional(),
  status: cacheStatus.optional(),
  global: z.boolean().optional(),
});
export type CacheEntryUpdate = z.infer<typeof cacheEntryUpdate>;

export const cacheEntryQuery = z.object({
  roomId: uuid.optional(),
  status: cacheStatus.optional(),
  search: z.string().optional(),
});

export const cachePromote = z.object({ historyId: uuid });

export const cacheClear = z.object({
  roomId: uuid.optional(),
  toolId: uuid.optional(),
  serverId: uuid.optional(),
  /** Off by default: clearing the cache keeps history and its counters. */
  includeHistory: z.boolean().default(false),
});
export type CacheClear = z.input<typeof cacheClear>;

export const cacheSettings = z.object({
  enabled: z.boolean(),
  topN: z.number().int().min(0).max(5000),
  minOccurrences: z.number().int().min(1),
  maxFailures: z.number().int().min(1),
  approximateEnabled: z.boolean(),
  similarityThreshold: z.number().min(0).max(1),
  defaultResponse: z.string().min(1),
  disabledRoomIds: z.array(uuid),
  historyRetentionDays: z.number().int().min(1),
});
export type CacheSettings = z.infer<typeof cacheSettings>;

export const cacheStats = z.object({
  hits: z.number().int(),
  misses: z.number().int(),
  hitRate: z.number(),
  avgSavedMs: z.number().nullable(),
  entries: z.number().int(),
  inMemory: z.number().int(),
  doubtful: z.array(cacheEntry),
  top: z.array(cacheEntry),
});
export type CacheStats = z.infer<typeof cacheStats>;

export const historyCall = z.object({
  toolId: uuid.nullable(),
  serverId: uuid.nullable(),
  serverName: z.string(),
  toolName: z.string(),
  arguments: z.unknown(),
  result: z.string().nullable(),
});

export const historyEntry = z.object({
  id: uuid,
  rawText: z.string(),
  normalizedText: z.string(),
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  deviceId: uuid.nullable(),
  calls: z.array(historyCall),
  occurrences: z.number().int(),
  avgDurationMs: z.number(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  cacheEntryId: uuid.nullable(),
});
export type HistoryEntry = z.infer<typeof historyEntry>;

export const historyQuery = z.object({
  roomId: uuid.optional(),
  tool: z.string().optional(),
  server: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['occurrences', 'recent']).default('occurrences'),
});
