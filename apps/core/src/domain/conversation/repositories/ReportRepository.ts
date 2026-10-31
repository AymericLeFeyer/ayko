import type { Report } from '@ayko/contracts';

export interface ReportRepository {
  create(report: Report & { deviceId: string }): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<Report[]>;
  delete(id: string): Promise<void>;
}
