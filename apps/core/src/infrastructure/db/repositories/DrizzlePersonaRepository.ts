import { desc, eq, ne } from 'drizzle-orm';
import type { Persona, PersonaVersion } from '@ayko/contracts';
import type { PersonaRepository } from '../../../domain/persona/repositories/PersonaRepository.js';
import type { Db } from '../client.js';
import { personas, personaVersions } from '../schema.js';

export class DrizzlePersonaRepository implements PersonaRepository {
  constructor(private readonly db: Db) {}

  async list() {
    return this.db.select().from(personas).all();
  }

  async find(id: string) {
    return this.db.select().from(personas).where(eq(personas.id, id)).get() ?? null;
  }

  async findDefault() {
    return this.db.select().from(personas).where(eq(personas.isDefault, true)).get() ?? null;
  }

  async save(persona: Persona) {
    const { id: _id, ...update } = persona;
    this.db
      .insert(personas)
      .values(persona)
      .onConflictDoUpdate({ target: personas.id, set: update })
      .run();
  }

  async delete(id: string) {
    return this.db.delete(personas).where(eq(personas.id, id)).run().changes > 0;
  }

  async setDefault(id: string) {
    this.db.transaction((tx) => {
      tx.update(personas).set({ isDefault: false }).where(ne(personas.id, id)).run();
      tx.update(personas).set({ isDefault: true }).where(eq(personas.id, id)).run();
    });
  }

  async listVersions(personaId: string) {
    return this.db
      .select()
      .from(personaVersions)
      .where(eq(personaVersions.personaId, personaId))
      .orderBy(desc(personaVersions.version))
      .all();
  }

  async addVersion(version: PersonaVersion) {
    this.db.insert(personaVersions).values(version).run();
  }
}
