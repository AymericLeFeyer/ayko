import { and, avg, desc, eq, gte, inArray, isNotNull, like, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { CacheSettings } from '@ayko/contracts';
import type {
  CacheEntryFilter,
  CacheEntryRecord,
  CacheRepository,
  HistoryFilter,
  HistoryRecord,
} from '../../../domain/cache/repositories/CacheRepository.js';
import type { Db } from '../client.js';
import { encodeCursor } from '../pagination.js';
import {
  cacheSettingsTable,
  mcpRequestHistory,
  requestCacheEntries,
  requests,
} from '../schema.js';

const LIVE: ('active' | 'pinned' | 'doubtful')[] = ['active', 'pinned', 'doubtful'];

type HistoryRow = typeof mcpRequestHistory.$inferSelect;

const toHistory = ({ totalDurationMs, ...row }: HistoryRow): HistoryRecord => ({
  ...row,
  avgDurationMs: totalDurationMs / row.occurrences,
});

export class DrizzleCacheRepository implements CacheRepository {
  constructor(private readonly db: Db) {}

  async getSettings() {
    return (
      this.db
        .select()
        .from(cacheSettingsTable)
        .where(eq(cacheSettingsTable.id, 1))
        .get()?.value ?? null
    );
  }

  async saveSettings(value: CacheSettings) {
    this.db
      .insert(cacheSettingsTable)
      .values({ id: 1, value })
      .onConflictDoUpdate({ target: cacheSettingsTable.id, set: { value } })
      .run();
  }

  async findEntry(id: string) {
    return (
      this.db.select().from(requestCacheEntries).where(eq(requestCacheEntries.id, id)).get() ??
      null
    );
  }

  async findByKey(cacheKey: string) {
    return (
      this.db
        .select()
        .from(requestCacheEntries)
        .where(eq(requestCacheEntries.cacheKey, cacheKey))
        .get() ?? null
    );
  }

  async lookup(normalized: string, roomId: string | null) {
    const scope = roomId
      ? or(eq(requestCacheEntries.roomId, roomId), eq(requestCacheEntries.global, true))
      : eq(requestCacheEntries.global, true);
    const rows = this.db
      .select()
      .from(requestCacheEntries)
      .where(
        and(
          scope,
          or(
            eq(requestCacheEntries.normalizedText, normalized),
            sql`EXISTS (SELECT 1 FROM json_each(${requestCacheEntries.aliasKeys}) WHERE value = ${normalized})`,
          ),
        ),
      )
      .all();
    // A room-specific entry always wins over a global one.
    return rows.find((row) => !row.global) ?? rows[0] ?? null;
  }

  async saveEntry(entry: CacheEntryRecord) {
    const { id: _id, createdAt: _createdAt, ...update } = entry;
    this.db
      .insert(requestCacheEntries)
      .values(entry)
      .onConflictDoUpdate({ target: requestCacheEntries.id, set: update })
      .run();
  }

  async deleteEntry(id: string) {
    return this.db.delete(requestCacheEntries).where(eq(requestCacheEntries.id, id)).run().changes > 0;
  }

  async listEntries(filter: CacheEntryFilter) {
    const conditions: (SQL | undefined)[] = [
      filter.roomId ? eq(requestCacheEntries.roomId, filter.roomId) : undefined,
      filter.status ? eq(requestCacheEntries.status, filter.status) : undefined,
      filter.search
        ? or(
            like(requestCacheEntries.sampleText, `%${filter.search}%`),
            like(requestCacheEntries.normalizedText, `%${filter.search}%`),
          )
        : undefined,
    ];
    return this.db
      .select()
      .from(requestCacheEntries)
      .where(and(...conditions))
      .orderBy(desc(requestCacheEntries.occurrences))
      .all();
  }

  async listEmbedded(roomId: string | null) {
    const scope = roomId
      ? or(eq(requestCacheEntries.roomId, roomId), eq(requestCacheEntries.global, true))
      : eq(requestCacheEntries.global, true);
    return this.db
      .select()
      .from(requestCacheEntries)
      .where(
        and(
          scope,
          isNotNull(requestCacheEntries.embedding),
          inArray(requestCacheEntries.status, LIVE),
        ),
      )
      .all();
  }

  async topEntries(limit: number, minOccurrences: number) {
    const pinned = this.db
      .select()
      .from(requestCacheEntries)
      .where(eq(requestCacheEntries.status, 'pinned'))
      .all();
    const frequent = this.db
      .select()
      .from(requestCacheEntries)
      .where(
        and(
          eq(requestCacheEntries.status, 'active'),
          gte(requestCacheEntries.occurrences, minOccurrences),
        ),
      )
      .orderBy(desc(requestCacheEntries.occurrences))
      .limit(limit)
      .all();
    return [...pinned, ...frequent].slice(0, Math.max(limit, pinned.length));
  }

  async upsertHistory(
    record: Parameters<CacheRepository['upsertHistory']>[0],
  ): Promise<HistoryRecord> {
    const { durationMs, ...row } = record;
    const saved = this.db
      .insert(mcpRequestHistory)
      .values({ ...row, occurrences: 1, totalDurationMs: durationMs })
      .onConflictDoUpdate({
        target: mcpRequestHistory.groupKey,
        set: {
          occurrences: sql`${mcpRequestHistory.occurrences} + 1`,
          totalDurationMs: sql`${mcpRequestHistory.totalDurationMs} + ${durationMs}`,
          lastSeenAt: record.lastSeenAt,
          rawText: record.rawText,
          calls: record.calls,
        },
      })
      .returning()
      .get();
    return toHistory(saved);
  }

  async findHistory(id: string) {
    const row = this.db
      .select()
      .from(mcpRequestHistory)
      .where(eq(mcpRequestHistory.id, id))
      .get();
    return row ? toHistory(row) : null;
  }

  async listHistory(filter: HistoryFilter, limit: number, cursor?: string) {
    const conditions: (SQL | undefined)[] = [
      filter.roomId ? eq(mcpRequestHistory.roomId, filter.roomId) : undefined,
      filter.from ? gte(mcpRequestHistory.lastSeenAt, filter.from) : undefined,
      filter.to ? lte(mcpRequestHistory.lastSeenAt, filter.to) : undefined,
      filter.tool
        ? sql`EXISTS (SELECT 1 FROM json_each(${mcpRequestHistory.calls}) WHERE json_extract(value, '$.toolName') = ${filter.tool})`
        : undefined,
      filter.server
        ? sql`EXISTS (SELECT 1 FROM json_each(${mcpRequestHistory.calls}) WHERE json_extract(value, '$.serverName') = ${filter.server})`
        : undefined,
    ];
    const order =
      filter.sort === 'occurrences'
        ? [desc(mcpRequestHistory.occurrences), desc(mcpRequestHistory.lastSeenAt)]
        : [desc(mcpRequestHistory.lastSeenAt)];
    // Occurrence order shifts between requests, so an offset is the honest cursor here.
    const offset = cursor ? Number(JSON.parse(Buffer.from(cursor, 'base64url').toString())[0]) : 0;
    const rows = this.db
      .select()
      .from(mcpRequestHistory)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(limit + 1)
      .offset(offset)
      .all();
    return {
      items: rows.slice(0, limit).map(toHistory),
      nextCursor: rows.length > limit ? encodeCursor(String(offset + limit), '') : null,
    };
  }

  async linkHistory(groupKey: string, entryId: string) {
    this.db
      .update(mcpRequestHistory)
      .set({ cacheEntryId: entryId })
      .where(eq(mcpRequestHistory.groupKey, groupKey))
      .run();
  }

  async clearHistory(filter: { roomId?: string; toolId?: string; serverId?: string }) {
    const condition = and(
      filter.roomId ? eq(mcpRequestHistory.roomId, filter.roomId) : undefined,
      filter.toolId
        ? sql`EXISTS (SELECT 1 FROM json_each(${mcpRequestHistory.calls}) WHERE json_extract(value, '$.toolId') = ${filter.toolId})`
        : undefined,
      filter.serverId
        ? sql`EXISTS (SELECT 1 FROM json_each(${mcpRequestHistory.calls}) WHERE json_extract(value, '$.serverId') = ${filter.serverId})`
        : undefined,
    );
    return this.db.delete(mcpRequestHistory).where(condition).run().changes;
  }

  async purgeHistory(cutoffIso: string) {
    this.db.delete(mcpRequestHistory).where(lt(mcpRequestHistory.lastSeenAt, cutoffIso)).run();
  }

  async averageSavedMs() {
    const row = this.db
      .select({
        value: avg(sql`${requestCacheEntries.llmDurationMs} - ${requests.durationMs}`),
      })
      .from(requests)
      .innerJoin(requestCacheEntries, eq(requestCacheEntries.id, requests.cacheEntryId))
      .where(and(eq(requests.cacheOutcome, 'hit'), isNotNull(requestCacheEntries.llmDurationMs)))
      .get();
    return row?.value == null ? null : Number(row.value);
  }
}
