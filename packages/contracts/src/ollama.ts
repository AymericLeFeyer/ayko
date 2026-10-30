import { z } from 'zod';
import { isoDate, secretMap, uuid } from './common.js';

export const ollamaEndpoint = z.object({
  id: uuid,
  name: z.string(),
  url: z.url(),
  enabled: z.boolean(),
  priority: z.number().int(),
  connectTimeoutMs: z.number().int(),
  headerNames: z.array(z.string()),
  lastStatus: z.enum(['unknown', 'up', 'down']),
  lastLatencyMs: z.number().nullable(),
  lastCheckedAt: isoDate.nullable(),
  version: z.string().nullable(),
});
export type OllamaEndpoint = z.infer<typeof ollamaEndpoint>;

export const ollamaEndpointInput = z.object({
  name: z.string().min(1).max(64),
  url: z.url(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  connectTimeoutMs: z.number().int().min(100).max(60_000).default(3000),
  /** Omitted means "keep existing headers"; values are stored encrypted. */
  headers: secretMap.optional(),
});
export type OllamaEndpointInput = z.input<typeof ollamaEndpointInput>;

export const endpointTestResult = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  version: z.string().nullable(),
  error: z.string().nullable(),
});
export type EndpointTestResult = z.infer<typeof endpointTestResult>;

export const ollamaModel = z.object({
  name: z.string(),
  sizeBytes: z.number(),
  modifiedAt: z.string().nullable(),
  family: z.string().nullable(),
  parameterSize: z.string().nullable(),
  quantization: z.string().nullable(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  supportsEmbedding: z.boolean(),
});
export type OllamaModel = z.infer<typeof ollamaModel>;

export const ollamaModelDetail = ollamaModel.extend({
  template: z.string().nullable(),
  parameters: z.string().nullable(),
  license: z.string().nullable(),
  contextLength: z.number().nullable(),
});
export type OllamaModelDetail = z.infer<typeof ollamaModelDetail>;

export const runningModel = z.object({
  name: z.string(),
  sizeBytes: z.number(),
  sizeVramBytes: z.number(),
  expiresAt: z.string().nullable(),
});
export type RunningModel = z.infer<typeof runningModel>;

export const pullRequest = z.object({ name: z.string().min(1).max(200) });

export const pullProgress = z.object({
  status: z.string(),
  completed: z.number().optional(),
  total: z.number().optional(),
  error: z.string().optional(),
});
export type PullProgress = z.infer<typeof pullProgress>;

export const modelRoleName = z.enum(['conversation', 'routing', 'embeddings', 'vision']);
export type ModelRoleName = z.infer<typeof modelRoleName>;

export const modelParams = z.object({
  temperature: z.number().min(0).max(2).nullable().default(null),
  numCtx: z.number().int().min(256).nullable().default(null),
  keepAlive: z.string().nullable().default(null),
  topP: z.number().min(0).max(1).nullable().default(null),
  maxTokens: z.number().int().min(1).nullable().default(null),
  systemPrompt: z.string().nullable().default(null),
});
export type ModelParams = z.infer<typeof modelParams>;

export const modelRole = z.object({
  role: modelRoleName,
  model: z.string().nullable(),
  params: modelParams,
});
export type ModelRole = z.infer<typeof modelRole>;
export const modelRolesUpdate = z.array(modelRole);

export const modelTestRequest = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  params: modelParams.partial().optional(),
});
export type ModelTestRequest = z.input<typeof modelTestRequest>;

export const modelTestEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    ttftMs: z.number().nullable(),
    tokensPerSecond: z.number().nullable(),
    totalMs: z.number(),
    outputTokens: z.number(),
    memoryBytes: z.number().nullable(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ModelTestEvent = z.infer<typeof modelTestEvent>;
