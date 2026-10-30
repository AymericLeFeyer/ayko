import { z } from 'zod';
import { isoDate, uuid } from './common.js';
import { answerStats, block, screenState, stepKind, stepStatus } from './chat.js';
import { deviceCommand, roomConfig } from './rooms.js';
import { logEntry } from './system.js';

/** Envelope of every /ws/display frame. */
const envelope = {
  requestId: uuid.optional(),
  room: uuid.nullable(),
  ts: isoDate,
};

const frame = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ ...envelope, type: z.literal(type), payload });

export const displayClientMessage = z.discriminatedUnion('type', [
  frame('user.text', z.object({ text: z.string().min(1), sessionId: uuid.optional() })),
  frame('request.cancel', z.object({ requestId: uuid })),
  frame('confirm.answer', z.object({ confirmId: uuid, accepted: z.boolean() })),
  frame('device.hello', z.object({ version: z.string(), capabilities: z.array(z.string()) })),
  frame('device.heartbeat', z.object({})),
  /** Reserved for the voice phase: accepted by the contract, ignored by Core. */
  frame('audio.chunk', z.object({ format: z.string(), data: z.string() })),
]);
export type DisplayClientMessage = z.infer<typeof displayClientMessage>;

export const displayServerMessage = z.discriminatedUnion('type', [
  frame('state.changed', z.object({ state: screenState })),
  frame(
    'activity.step',
    z.object({
      stepId: uuid,
      kind: stepKind,
      label: z.string(),
      status: stepStatus,
      durationMs: z.number().optional(),
    }),
  ),
  frame('answer.delta', z.object({ requestId: uuid, text: z.string() })),
  frame('answer.blocks', z.object({ requestId: uuid, blocks: z.array(block) })),
  frame('answer.done', z.object({ requestId: uuid, stats: answerStats })),
  frame('confirm.request', z.object({ confirmId: uuid, label: z.string(), expiresAt: isoDate })),
  frame('config.updated', z.object({ roomConfig })),
  frame(
    'system.notice',
    z.object({ level: z.enum(['info', 'warn', 'error']), message: z.string() }),
  ),
  /** Extension of the spec: remote actions of section 4.6 need a server-to-tablet frame. */
  frame('device.command', deviceCommand),
  /** Reserved voice frames, typed now so the Display never has to change shape. */
  frame('voice.wake', z.object({ word: z.string() })),
  frame('voice.stt.partial', z.object({ text: z.string() })),
  frame('voice.stt.final', z.object({ text: z.string() })),
  frame('voice.tts.chunk', z.object({ format: z.string(), data: z.string() })),
  frame('voice.tts.stop', z.object({})),
]);
export type DisplayServerMessage = z.infer<typeof displayServerMessage>;

/** Topics pushed to the backoffice over /ws/admin to refresh its screens live. */
export const adminEvent = z.discriminatedUnion('topic', [
  z.object({ topic: z.literal('mcp.changed'), serverId: uuid.optional() }),
  z.object({ topic: z.literal('ollama.changed') }),
  z.object({ topic: z.literal('devices.changed') }),
  z.object({ topic: z.literal('pairing.changed') }),
  z.object({ topic: z.literal('cache.changed') }),
  z.object({ topic: z.literal('request.changed'), requestId: uuid }),
  z.object({ topic: z.literal('log'), entry: logEntry }),
]);
export type AdminEvent = z.infer<typeof adminEvent>;
