import { z } from 'zod';
import { isoDate, uuid } from './common.js';
import { cacheSettings } from './cache.js';

export const health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  mock: z.boolean(),
});
export type Health = z.infer<typeof health>;

export const componentHealth = z.object({
  id: z.string(),
  kind: z.enum(['database', 'ollama', 'mcp', 'rooms']),
  name: z.string(),
  status: z.enum(['up', 'degraded', 'down', 'disabled']),
  detail: z.string().nullable(),
  latencyMs: z.number().nullable(),
});
export type ComponentHealth = z.infer<typeof componentHealth>;

export const recentRequest = z.object({
  requestId: uuid,
  text: z.string(),
  roomName: z.string().nullable(),
  status: z.enum(['running', 'done', 'error', 'cancelled']),
  durationMs: z.number().nullable(),
  tokensPerSecond: z.number().nullable(),
  cacheHit: z.boolean(),
  createdAt: isoDate,
});
export type RecentRequest = z.infer<typeof recentRequest>;

export const metrics = z.object({
  components: z.array(componentHealth),
  requests24h: z.number().int(),
  errors24h: z.number().int(),
  avgTokensPerSecond: z.number().nullable(),
  cacheHitRate: z.number().nullable(),
  queueDepth: z.number().int(),
  recentRequests: z.array(recentRequest),
  recentErrors: z.array(
    z.object({ id: uuid, component: z.string(), message: z.string(), ts: isoDate }),
  ),
});
export type Metrics = z.infer<typeof metrics>;

export const logLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof logLevel>;

export const logEntry = z.object({
  id: uuid,
  ts: isoDate,
  level: logLevel,
  component: z.string(),
  message: z.string(),
  roomId: uuid.nullable(),
  requestId: uuid.nullable(),
  data: z.unknown().nullable(),
});
export type LogEntry = z.infer<typeof logEntry>;

export const logQuery = z.object({
  level: logLevel.optional(),
  component: z.string().optional(),
  roomId: uuid.optional(),
  requestId: uuid.optional(),
  search: z.string().optional(),
});

export const auditEntry = z.object({
  id: uuid,
  ts: isoDate,
  actor: z.string(),
  action: z.string(),
  target: z.string().nullable(),
  details: z.unknown().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;

export const agentSettings = z.object({
  maxIterations: z.number().int().min(1).max(50),
  toolTimeoutMs: z.number().int().min(100),
  totalTimeoutMs: z.number().int().min(1000),
  maxConcurrentRequests: z.number().int().min(1).max(16),
  confirmTimeoutSeconds: z.number().int().min(5).max(600),
  routingEnabled: z.boolean(),
  historyMessages: z.number().int().min(0).max(200),
  /** Tool output is capped so one big result cannot evict the whole prompt. */
  toolResultMaxChars: z.number().int().min(100),
});
export type AgentSettings = z.infer<typeof agentSettings>;

export const systemSettings = z.object({
  agent: agentSettings,
  logRetentionDays: z.number().int().min(1),
  traceRetentionDays: z.number().int().min(1),
  logLevel: logLevel,
  ownerName: z.string(),
});
export type SystemSettings = z.infer<typeof systemSettings>;

export const configBundle = z.object({
  format: z.literal('ayko-config'),
  version: z.literal(1),
  exportedAt: isoDate,
  /** Secrets stay AES-GCM encrypted: restoring them needs the same master key. */
  encryptedSecrets: z.boolean(),
  data: z.object({
    settings: systemSettings,
    cacheSettings,
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});
export type ConfigBundle = z.infer<typeof configBundle>;

export const configExportRequest = z.object({ includeSecrets: z.boolean().default(false) });
export const configImportResult = z.object({
  restoredTables: z.record(z.string(), z.number()),
  skippedSecrets: z.boolean(),
});
export type ConfigImportResult = z.infer<typeof configImportResult>;

export const setupWizardState = z.object({
  hasEndpoint: z.boolean(),
  hasConversationModel: z.boolean(),
  hasMcpServer: z.boolean(),
  hasRoom: z.boolean(),
  completed: z.boolean(),
});
export type SetupWizardState = z.infer<typeof setupWizardState>;
