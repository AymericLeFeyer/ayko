import type { VoiceProvider, VoiceProviderConfig, VoiceSlot } from '@ayko/contracts';

export interface VoiceProbeResult {
  ok: boolean;
  implemented: boolean;
  message: string;
}

/** Common surface of the three slots; only the probe is used before the voice phase. */
export interface VoiceEngine {
  readonly slot: VoiceSlot;
  probe(config: VoiceProviderConfig): Promise<VoiceProbeResult>;
}

export interface WakeWordEngine extends VoiceEngine {
  detect(audio: AsyncIterable<Uint8Array>): AsyncIterable<{ word: string }>;
}

export interface SttEngine extends VoiceEngine {
  transcribe(audio: AsyncIterable<Uint8Array>): AsyncIterable<{ text: string; final: boolean }>;
}

export interface TtsEngine extends VoiceEngine {
  synthesize(text: string): AsyncIterable<Uint8Array>;
}

export type VoiceEngineFactory = (provider: Pick<VoiceProvider, 'kind' | 'slot'>) => VoiceEngine;

export interface VoiceRepository {
  list(): Promise<VoiceProvider[]>;
  find(id: string): Promise<VoiceProvider | null>;
  replaceAll(providers: VoiceProvider[]): Promise<void>;
}
