import { desc, eq } from 'drizzle-orm';
import type { ReportRepository } from '../../../domain/conversation/repositories/ReportRepository.js';
import type { Db } from '../client.js';
import { reports } from '../schema.js';

export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly db: Db) {}

  async create(report: Parameters<ReportRepository['create']>[0]) {
    this.db.insert(reports).values(report).run();
  }

  async list(limit: number) {
    return this.db
      .select({
        id: reports.id,
        deviceName: reports.deviceName,
        roomName: reports.roomName,
        traces: reports.traces,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .all();
  }

  async delete(id: string) {
    this.db.delete(reports).where(eq(reports.id, id)).run();
  }
}
