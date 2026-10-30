import { and, count, eq, gt } from 'drizzle-orm';
import type {
  IdentityRepository,
  UserRecord,
} from '../../../domain/identity/repositories/IdentityRepository.js';
import type { Db } from '../client.js';
import { apiKeys, sessionsAuth, users } from '../schema.js';

export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Db) {}

  async countUsers() {
    return this.db.select({ value: count() }).from(users).get()?.value ?? 0;
  }

  async createUser(user: UserRecord) {
    this.db.insert(users).values(user).run();
  }

  async findUserByName(username: string) {
    return this.db.select().from(users).where(eq(users.username, username)).get() ?? null;
  }

  async findUserById(id: string) {
    return this.db.select().from(users).where(eq(users.id, id)).get() ?? null;
  }

  async updatePassword(id: string, passwordHash: string) {
    this.db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
  }

  async createSession(session: typeof sessionsAuth.$inferInsert) {
    this.db.insert(sessionsAuth).values(session).run();
  }

  async findUserBySession(tokenHash: string, nowIso: string) {
    const row = this.db
      .select({ user: users })
      .from(sessionsAuth)
      .innerJoin(users, eq(users.id, sessionsAuth.userId))
      .where(and(eq(sessionsAuth.tokenHash, tokenHash), gt(sessionsAuth.expiresAt, nowIso)))
      .get();
    return row?.user ?? null;
  }

  async deleteSession(tokenHash: string) {
    this.db.delete(sessionsAuth).where(eq(sessionsAuth.tokenHash, tokenHash)).run();
  }

  async deleteUserSessions(userId: string) {
    this.db.delete(sessionsAuth).where(eq(sessionsAuth.userId, userId)).run();
  }

  async listApiKeys() {
    return this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .all();
  }

  async createApiKey(key: typeof apiKeys.$inferInsert) {
    this.db.insert(apiKeys).values(key).run();
  }

  async touchApiKey(tokenHash: string, nowIso: string) {
    const result = this.db
      .update(apiKeys)
      .set({ lastUsedAt: nowIso })
      .where(eq(apiKeys.tokenHash, tokenHash))
      .run();
    return result.changes > 0;
  }

  async deleteApiKey(id: string) {
    return this.db.delete(apiKeys).where(eq(apiKeys.id, id)).run().changes > 0;
  }
}
