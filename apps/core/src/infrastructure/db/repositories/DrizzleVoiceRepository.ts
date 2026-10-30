import { eq } from 'drizzle-orm';
import type { VoiceProvider } from '@ayko/contracts';
import type { VoiceRepository } from '../../../domain/voice/VoiceProviders.js';
import type { Db } from '../client.js';
import { voiceProviders } from '../schema.js';

export class DrizzleVoiceRepository implements VoiceRepository {
  constructor(private readonly db: Db) {}

  async list() {
    return this.db.select().from(voiceProviders).all();
  }

  async find(id: string) {
    return this.db.select().from(voiceProviders).where(eq(voiceProviders.id, id)).get() ?? null;
  }

  async replaceAll(providers: VoiceProvider[]) {
    this.db.transaction((tx) => {
      tx.delete(voiceProviders).run();
      if (providers.length > 0) tx.insert(voiceProviders).values(providers).run();
    });
  }
}
