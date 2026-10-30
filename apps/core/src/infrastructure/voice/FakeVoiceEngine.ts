import { connect } from 'node:net';
import type { VoiceProviderConfig, VoiceSlot } from '@ayko/contracts';
import type {
  SttEngine,
  TtsEngine,
  VoiceEngine,
  VoiceEngineFactory,
  VoiceProbeResult,
  WakeWordEngine,
} from '../../domain/voice/VoiceProviders.js';

/** Shipped default: satisfies every slot so the pipeline is wired before real engines exist. */
export class FakeVoiceEngine implements WakeWordEngine, SttEngine, TtsEngine {
  constructor(readonly slot: VoiceSlot) {}

  async probe(): Promise<VoiceProbeResult> {
    return { ok: true, implemented: true, message: 'Fournisseur factice opérationnel' };
  }

  async *detect(): AsyncGenerator<{ word: string }> {
    yield { word: 'ayko' };
  }

  async *transcribe(): AsyncGenerator<{ text: string; final: boolean }> {
    yield { text: 'allume', final: false };
    yield { text: 'allume la lumière', final: true };
  }

  async *synthesize(): AsyncGenerator<Uint8Array> {
    yield new Uint8Array();
  }
}

const probeTcp = (host: string, port: number) =>
  new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port, timeout: 3000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('délai dépassé'));
    });
    socket.once('error', reject);
  });

/**
 * Real engines arrive with the voice phase; until then the test button still tells
 * the admin whether the configured address answers.
 */
class ReachabilityOnlyEngine implements VoiceEngine {
  constructor(
    readonly slot: VoiceSlot,
    private readonly kind: string,
  ) {}

  async probe(config: VoiceProviderConfig): Promise<VoiceProbeResult> {
    const pending = `Le moteur « ${this.kind} » sera branché dans la phase voix.`;
    if (this.kind === 'stdio') {
      return { ok: Boolean(config.address), implemented: false, message: pending };
    }
    if (!config.address) {
      return { ok: false, implemented: false, message: 'Adresse manquante.' };
    }
    try {
      const url = new URL(
        config.address.includes('://') ? config.address : `tcp://${config.address}`,
      );
      await probeTcp(url.hostname, Number(url.port) || (url.protocol === 'https:' ? 443 : 80));
      return { ok: true, implemented: false, message: `Adresse joignable. ${pending}` };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, implemented: false, message: `Adresse injoignable : ${reason}` };
    }
  }
}

export const createVoiceEngine: VoiceEngineFactory = ({ kind, slot }) =>
  kind === 'fake' ? new FakeVoiceEngine(slot) : new ReachabilityOnlyEngine(slot, kind);
