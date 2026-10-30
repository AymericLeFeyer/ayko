import { and, avg, count, desc, eq, gte, like, lt, notInArray, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { AuditEntry, LogEntry } from '@ayko/contracts';
import type {
  LogFilter,
  SystemRepository,
} from '../../../domain/system/repositories/SystemRepository.js';
import type { Db } from '../client.js';
import { cursorCondition, newestFirst, toPage } from '../pagination.js';
import {
  auditLog,
  logs,
  mcpServers,
  mcpTools,
  modelRoles,
  ollamaEndpoints,
  personas,
  personaVersions,
  requests,
  rooms,
  secrets,
  settings,
  toolCalls,
  toolPolicyOverrides,
  voiceProviders,
} from '../schema.js';

/** Backup scope, parents before children so foreign keys hold on restore. */
const BACKUP_TABLES: Record<string, { table: SQLiteTable; pk: SQLiteColumn | null }> = {
  rooms: { table: rooms, pk: rooms.id },
  personas: { table: personas, pk: personas.id },
  personaVersions: { table: personaVersions, pk: personaVersions.id },
  ollamaEndpoints: { table: ollamaEndpoints, pk: ollamaEndpoints.id },
  modelRoles: { table: modelRoles, pk: null },
  mcpServers: { table: mcpServers, pk: mcpServers.id },
  mcpTools: { table: mcpTools, pk: mcpTools.id },
  toolPolicyOverrides: { table: toolPolicyOverrides, pk: null },
  voiceProviders: { table: voiceProviders, pk: voiceProviders.id },
};

export class DrizzleSystemRepository implements SystemRepository {
  constructor(private readonly db: Db) {}

  async getSetting<T>(key: string) {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return (row?.value as T | undefined) ?? null;
  }

  async setSetting(key: string, value: unknown) {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  appendLog(entry: LogEntry) {
    this.db.insert(logs).values(entry).run();
  }

  async listLogs(filter: LogFilter, limit: number, cursor?: string) {
    const conditions: (SQL | undefined)[] = [
      filter.level ? eq(logs.level, filter.level) : undefined,
      filter.component ? eq(logs.component, filter.component) : undefined,
      filter.roomId ? eq(logs.roomId, filter.roomId) : undefined,
      filter.requestId ? eq(logs.requestId, filter.requestId) : undefined,
      filter.search ? like(logs.message, `%${filter.search}%`) : undefined,
      cursorCondition(logs.ts, logs.id, cursor),
    ];
    const rows = this.db
      .select()
      .from(logs)
      .where(and(...conditions))
      .orderBy(...newestFirst(logs.ts, logs.id))
      .limit(limit + 1)
      .all();
    return toPage(
      rows,
      limit,
      (row) => row,
      (row) => [row.ts, row.id],
    );
  }

  async appendAudit(entry: AuditEntry) {
    this.db.insert(auditLog).values(entry).run();
  }

  async listAudit(limit: number, cursor?: string) {
    const rows = this.db
      .select()
      .from(auditLog)
      .where(cursorCondition(auditLog.ts, auditLog.id, cursor))
      .orderBy(...newestFirst(auditLog.ts, auditLog.id))
      .limit(limit + 1)
      .all();
    return toPage(
      rows,
      limit,
      (row) => row,
      (row) => [row.ts, row.id],
    );
  }

  async requestStats(sinceIso: string) {
    const row = this.db
      .select({
        total: count(),
        errors: sql<number>`coalesce(sum(${requests.status} = 'error'), 0)`,
        avgTokensPerSecond: avg(requests.tokensPerSecond),
        hits: sql<number>`coalesce(sum(${requests.cacheOutcome} = 'hit'), 0)`,
        misses: sql<number>`coalesce(sum(${requests.cacheOutcome} = 'miss'), 0)`,
      })
      .from(requests)
      .where(gte(requests.createdAt, sinceIso))
      .get();
    return {
      total: row?.total ?? 0,
      errors: Number(row?.errors ?? 0),
      avgTokensPerSecond: row?.avgTokensPerSecond == null ? null : Number(row.avgTokensPerSecond),
      hits: Number(row?.hits ?? 0),
      misses: Number(row?.misses ?? 0),
    };
  }

  async recentRequests(limit: number) {
    const rows = this.db
      .select({ request: requests, roomName: rooms.name })
      .from(requests)
      .leftJoin(rooms, eq(rooms.id, requests.roomId))
      .orderBy(desc(requests.createdAt))
      .limit(limit)
      .all();
    return rows.map(({ request, roomName }) => ({
      requestId: request.id,
      text: request.text,
      roomName,
      status: request.status,
      durationMs: request.durationMs,
      tokensPerSecond: request.tokensPerSecond,
      cacheHit: request.cacheOutcome === 'hit',
      createdAt: request.createdAt,
    }));
  }

  async recentErrors(limit: number) {
    return this.db
      .select()
      .from(logs)
      .where(eq(logs.level, 'error'))
      .orderBy(desc(logs.ts))
      .limit(limit)
      .all();
  }

  async purge(cutoffs: { logs: string; traces: string }) {
    this.db.delete(logs).where(lt(logs.ts, cutoffs.logs)).run();
    this.db.delete(requests).where(lt(requests.createdAt, cutoffs.traces)).run();
    this.db.delete(toolCalls).where(lt(toolCalls.createdAt, cutoffs.traces)).run();
  }

  async exportTables(includeSecrets: boolean) {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const [name, { table }] of Object.entries(BACKUP_TABLES)) {
      tables[name] = this.db.select().from(table).all();
    }
    if (includeSecrets) tables.secrets = this.db.select().from(secrets).all();
    return tables;
  }

  async importTables(tables: Record<string, Record<string, unknown>[]>) {
    const restored: Record<string, number> = {};
    this.db.transaction((tx) => {
      if (tables.secrets) {
        for (const row of tables.secrets as (typeof secrets.$inferInsert)[]) {
          tx.insert(secrets)
            .values(row)
            .onConflictDoUpdate({ target: secrets.id, set: { ciphertext: row.ciphertext } })
            .run();
        }
        restored.secrets = tables.secrets.length;
      }
      for (const [name, { table, pk }] of Object.entries(BACKUP_TABLES)) {
        const rows = tables[name];
        if (!rows) continue;
        if (pk) {
          // Upsert rather than wipe: deleting a room first would detach paired tablets.
          const ids = rows.map((row) => String(row.id));
          for (const row of rows) {
            tx.insert(table).values(row).onConflictDoUpdate({ target: pk, set: row }).run();
          }
          tx.delete(table)
            .where(ids.length > 0 ? notInArray(pk, ids) : undefined)
            .run();
        } else {
          tx.delete(table).run();
          if (rows.length > 0) tx.insert(table).values(rows).run();
        }
        restored[name] = rows.length;
      }
    });
    return restored;
  }
}
