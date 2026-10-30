import { randomUUID } from 'node:crypto';
import type { VoiceProvider, VoiceProvidersUpdate, VoiceTestResult } from '@ayko/contracts';
import type {
  VoiceEngineFactory,
  VoiceRepository,
} from '../../domain/voice/VoiceProviders.js';
import { AppError, notFound } from '../../shared/errors.js';

export class VoiceService {
  constructor(
    private readonly repository: VoiceRepository,
    private readonly createEngine: VoiceEngineFactory,
  ) {}

  list() {
    return this.repository.list();
  }

  async replace(update: VoiceProvidersUpdate) {
    for (const slot of ['wake_word', 'stt', 'tts'] as const) {
      if (update.filter((item) => item.slot === slot && item.active).length > 1) {
        throw new AppError('multiple_active', 'Un seul fournisseur actif par emplacement');
      }
    }
    const providers: VoiceProvider[] = update.map((item) => ({
      ...item,
      id: item.id ?? randomUUID(),
      updatedAt: new Date().toISOString(),
    }));
    await this.repository.replaceAll(providers);
    return providers;
  }

  async test(id: string): Promise<VoiceTestResult> {
    const provider = await this.repository.find(id);
    if (!provider) throw notFound('Fournisseur');
    const started = performance.now();
    const result = await this.createEngine(provider).probe(provider.config);
    return { ...result, latencyMs: performance.now() - started };
  }
}
