import { desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  MemoryRecord,
  MemoryRepository,
} from '../../../domain/memory/repositories/MemoryRepository.js';
import type { Db } from '../client.js';
import { memories } from '../schema.js';

export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Db) {}

  async list() {
    return this.db.select().from(memories).orderBy(desc(memories.updatedAt)).all();
  }

  async find(id: string) {
    return this.db.select().from(memories).where(eq(memories.id, id)).get() ?? null;
  }

  async findByAlias(aliasKey: string) {
    return this.db.select().from(memories).where(eq(memories.aliasKey, aliasKey)).get() ?? null;
  }

  async save(memory: MemoryRecord) {
    const { id: _id, createdAt: _createdAt, ...update } = memory;
    this.db
      .insert(memories)
      .values(memory)
      .onConflictDoUpdate({ target: memories.id, set: update })
      .run();
  }

  async delete(id: string) {
    return this.db.delete(memories).where(eq(memories.id, id)).run().changes > 0;
  }

  async markUsed(ids: string[], nowIso: string) {
    this.db
      .update(memories)
      .set({ useCount: sql`${memories.useCount} + 1`, lastUsedAt: nowIso })
      .where(inArray(memories.id, ids))
      .run();
  }
}
