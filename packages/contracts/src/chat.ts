import { z } from 'zod';
import { isoDate, uuid } from './common.js';

/** Rich block rendered by the tablets; an unknown type must fall back to raw text. */
export const block = z.object({ type: z.string() }).catchall(z.unknown());
export type Block = z.infer<typeof block>;

export const stepKind = z.enum([
  'queue',
  'cache_hit',
  'cache_miss',
  'routing',
  'thinking',
  'tool_call',
  'tool_result',
  'confirm',
  'answer',
  'error',
]);
export type StepKind = z.infer<typeof stepKind>;

export const stepStatus = z.enum(['running', 'done', 'error', 'cancelled']);
export type StepStatus = z.infer<typeof stepStatus>;

export const screenState = z.enum(['idle', 'awake', 'listening', 'thinking', 'answering', 'error']);
export type ScreenState = z.infer<typeof screenState>;

export const answerStats = z.object({
  durationMs: z.number(),
  ttftMs: z.number().nullable(),
  tokensPerSecond: z.number().nullable(),
  outputTokens: z.number().nullable(),
  model: z.string().nullable(),
  cacheHit: z.boolean(),
});
export type AnswerStats = z.infer<typeof answerStats>;

/** Payloads shared by the SSE playground stream and the tablet WebSocket. */
export const agentEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('request.accepted'), requestId: uuid, conversationId: uuid }),
  z.object({ type: z.literal('state.changed'), requestId: uuid, state: screenState }),
  z.object({
    type: z.literal('activity.step'),
    requestId: uuid,
    stepId: uuid,
    kind: stepKind,
    label: z.string(),
    status: stepStatus,
    durationMs: z.number().optional(),
  }),
  z.object({ type: z.literal('answer.delta'), requestId: uuid, text: z.string() }),
  z.object({ type: z.literal('answer.blocks'), requestId: uuid, blocks: z.array(block) }),
  z.object({ type: z.literal('answer.done'), requestId: uuid, stats: answerStats }),
  z.object({
    type: z.literal('confirm.request'),
    requestId: uuid,
    confirmId: uuid,
    label: z.string(),
    expiresAt: isoDate,
  }),
  z.object({
    type: z.literal('request.failed'),
    requestId: uuid,
    code: z.string(),
    message: z.string(),
  }),
]);
export type AgentEvent = z.infer<typeof agentEvent>;

export const chatRequest = z.object({
  text: z.string().min(1).max(8000),
  roomId: uuid.nullable().optional(),
  conversationId: uuid.nullable().optional(),
  model: z.string().nullable().optional(),
  personaId: uuid.nullable().optional(),
  /** Skips the shortcut cache, useful to compare a replay against the LLM. */
  bypassCache: z.boolean().optional(),
});
export type ChatRequest = z.input<typeof chatRequest>;

export const confirmAnswer = z.object({ confirmId: uuid, accepted: z.boolean() });

export const message = z.object({
  id: uuid,
  conversationId: uuid,
  requestId: uuid.nullable(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  createdAt: isoDate,
});
export type Message = z.infer<typeof message>;

export const conversation = z.object({
  id: uuid,
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  title: z.string(),
  source: z.enum(['playground', 'display', 'api']),
  messageCount: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Conversation = z.infer<typeof conversation>;

export const conversationDetail = conversation.extend({ messages: z.array(message) });
export type ConversationDetail = z.infer<typeof conversationDetail>;

export const conversationQuery = z.object({
  search: z.string().optional(),
  roomId: uuid.optional(),
});

export const traceStep = z.object({
  id: uuid,
  kind: stepKind,
  label: z.string(),
  status: stepStatus,
  detail: z.unknown().nullable(),
  startedAt: isoDate,
  durationMs: z.number().nullable(),
});
export type TraceStep = z.infer<typeof traceStep>;

export const traceToolCall = z.object({
  id: uuid,
  serverName: z.string(),
  toolName: z.string(),
  arguments: z.unknown(),
  result: z.string().nullable(),
  isError: z.boolean(),
  durationMs: z.number(),
  source: z.enum(['llm', 'cache', 'tester']),
});
export type TraceToolCall = z.infer<typeof traceToolCall>;

export const requestStatus = z.enum(['running', 'done', 'error', 'cancelled']);

export const trace = z.object({
  requestId: uuid,
  conversationId: uuid.nullable(),
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  text: z.string(),
  status: requestStatus,
  model: z.string().nullable(),
  personaName: z.string().nullable(),
  prompt: z.unknown().nullable(),
  reasoning: z.string().nullable(),
  answer: z.string().nullable(),
  error: z.string().nullable(),
  cache: z.object({
    outcome: z.enum(['hit', 'miss', 'skipped']),
    entryId: uuid.nullable(),
    matchType: z.enum(['exact', 'approximate']).nullable(),
    durationMs: z.number().nullable(),
  }),
  ttftMs: z.number().nullable(),
  tokensPerSecond: z.number().nullable(),
  durationMs: z.number().nullable(),
  createdAt: isoDate,
  steps: z.array(traceStep),
  toolCalls: z.array(traceToolCall),
});
export type Trace = z.infer<typeof trace>;
