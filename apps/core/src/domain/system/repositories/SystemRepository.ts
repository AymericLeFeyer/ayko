import type { AuditEntry, LogEntry, Page, RecentRequest } from '@ayko/contracts';

export interface LogFilter {
  level?: LogEntry['level'];
  component?: string;
  roomId?: string;
  requestId?: string;
  search?: string;
}

export interface RequestStats {
  total: number;
  errors: number;
  avgTokensPerSecond: number | null;
  hits: number;
  misses: number;
}

export interface SystemRepository {
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;
  appendLog(entry: LogEntry): void;
  listLogs(filter: LogFilter, limit: number, cursor?: string): Promise<Page<LogEntry>>;
  appendAudit(entry: AuditEntry): Promise<void>;
  listAudit(limit: number, cursor?: string): Promise<Page<AuditEntry>>;
  requestStats(sinceIso: string): Promise<RequestStats>;
  recentRequests(limit: number): Promise<RecentRequest[]>;
  recentErrors(limit: number): Promise<LogEntry[]>;
  purge(cutoffs: { logs: string; traces: string }): Promise<void>;
  exportTables(includeSecrets: boolean): Promise<Record<string, Record<string, unknown>[]>>;
  importTables(
    tables: Record<string, Record<string, unknown>[]>,
  ): Promise<Record<string, number>>;
}
