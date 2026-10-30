import type { CacheEntry, CacheSettings, HistoryEntry, Page } from '@ayko/contracts';

export type CacheEntryRecord = Omit<CacheEntry, 'inTopN' | 'roomName' | 'hasEmbedding'> & {
  cacheKey: string;
  aliasKeys: string[];
  embedding: number[] | null;
  lastResult: string | null;
  lastResultAt: string | null;
};

export type HistoryRecord = Omit<HistoryEntry, 'roomName'> & { groupKey: string };

export interface CacheEntryFilter {
  roomId?: string;
  status?: CacheEntry['status'];
  search?: string;
}

export interface HistoryFilter {
  roomId?: string;
  tool?: string;
  server?: string;
  from?: string;
  to?: string;
  sort: 'occurrences' | 'recent';
}

export interface CacheRepository {
  getSettings(): Promise<CacheSettings | null>;
  saveSettings(settings: CacheSettings): Promise<void>;
  findEntry(id: string): Promise<CacheEntryRecord | null>;
  findByKey(cacheKey: string): Promise<CacheEntryRecord | null>;
  /** Matches on the key or on any alias, for a room or for global entries. */
  lookup(normalized: string, roomId: string | null): Promise<CacheEntryRecord | null>;
  saveEntry(entry: CacheEntryRecord): Promise<void>;
  deleteEntry(id: string): Promise<boolean>;
  listEntries(filter: CacheEntryFilter): Promise<CacheEntryRecord[]>;
  listEmbedded(roomId: string | null): Promise<CacheEntryRecord[]>;
  topEntries(limit: number, minOccurrences: number): Promise<CacheEntryRecord[]>;
  upsertHistory(
    record: Omit<HistoryRecord, 'avgDurationMs' | 'occurrences'> & { durationMs: number },
  ): Promise<HistoryRecord>;
  findHistory(id: string): Promise<HistoryRecord | null>;
  listHistory(
    filter: HistoryFilter,
    limit: number,
    cursor?: string,
  ): Promise<Page<HistoryRecord>>;
  linkHistory(groupKey: string, entryId: string): Promise<void>;
  clearHistory(filter: {
    roomId?: string;
    toolId?: string;
    serverId?: string;
  }): Promise<number>;
  purgeHistory(cutoffIso: string): Promise<void>;
  /** Average time saved by hits compared to the LLM run that taught the entry. */
  averageSavedMs(): Promise<number | null>;
}
