import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const voiceSlot = z.enum(['wake_word', 'stt', 'tts']);
export type VoiceSlot = z.infer<typeof voiceSlot>;

export const voiceProviderKind = z.enum(['fake', 'wyoming', 'openai_http', 'stdio']);
export type VoiceProviderKind = z.infer<typeof voiceProviderKind>;

export const voiceProviderConfig = z.object({
  address: z.string().optional(),
  language: z.string().optional(),
  voice: z.string().optional(),
  sensitivity: z.number().min(0).max(1).optional(),
  wakeWord: z.string().optional(),
});
export type VoiceProviderConfig = z.infer<typeof voiceProviderConfig>;

export const voiceProvider = z.object({
  id: uuid,
  slot: voiceSlot,
  kind: voiceProviderKind,
  name: z.string(),
  active: z.boolean(),
  config: voiceProviderConfig,
  updatedAt: isoDate,
});
export type VoiceProvider = z.infer<typeof voiceProvider>;

export const voiceProvidersUpdate = z.array(
  z.object({
    id: uuid.optional(),
    slot: voiceSlot,
    kind: voiceProviderKind,
    name: z.string().min(1).max(64),
    active: z.boolean(),
    config: voiceProviderConfig,
  }),
);
export type VoiceProvidersUpdate = z.infer<typeof voiceProvidersUpdate>;

export const voiceTestResult = z.object({
  ok: z.boolean(),
  implemented: z.boolean(),
  message: z.string(),
  latencyMs: z.number(),
});
export type VoiceTestResult = z.infer<typeof voiceTestResult>;
