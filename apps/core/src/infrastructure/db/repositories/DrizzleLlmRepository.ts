import { asc, eq } from 'drizzle-orm';
import { modelParams, type ModelRole, type ModelRoleName } from '@ayko/contracts';
import type {
  EndpointRecord,
  LlmRepository,
} from '../../../domain/llm/repositories/LlmRepository.js';
import type { Db } from '../client.js';
import { modelRoles, ollamaEndpoints } from '../schema.js';

const ROLE_NAMES: ModelRoleName[] = ['conversation', 'routing', 'embeddings', 'vision'];

export class DrizzleLlmRepository implements LlmRepository {
  constructor(private readonly db: Db) {}

  async listEndpoints() {
    return this.db.select().from(ollamaEndpoints).orderBy(asc(ollamaEndpoints.priority)).all();
  }

  async findEndpoint(id: string) {
    return this.db.select().from(ollamaEndpoints).where(eq(ollamaEndpoints.id, id)).get() ?? null;
  }

  async saveEndpoint(endpoint: EndpointRecord) {
    const row = { ...endpoint, createdAt: new Date().toISOString() };
    const { createdAt: _createdAt, id: _id, ...update } = row;
    this.db
      .insert(ollamaEndpoints)
      .values(row)
      .onConflictDoUpdate({ target: ollamaEndpoints.id, set: update })
      .run();
  }

  async deleteEndpoint(id: string) {
    return this.db.delete(ollamaEndpoints).where(eq(ollamaEndpoints.id, id)).run().changes > 0;
  }

  async recordHealth(id: string, health: Parameters<LlmRepository['recordHealth']>[1]) {
    this.db.update(ollamaEndpoints).set(health).where(eq(ollamaEndpoints.id, id)).run();
  }

  async listRoles() {
    const rows = this.db.select().from(modelRoles).all();
    return ROLE_NAMES.map((role) => {
      const row = rows.find((item) => item.role === role);
      return { role, model: row?.model ?? null, params: row?.params ?? modelParams.parse({}) };
    });
  }

  async findRole(role: ModelRoleName) {
    return (await this.listRoles()).find((item) => item.role === role) ?? null;
  }

  async saveRole(role: ModelRole) {
    this.db
      .insert(modelRoles)
      .values(role)
      .onConflictDoUpdate({
        target: modelRoles.role,
        set: { model: role.model, params: role.params },
      })
      .run();
  }
}
