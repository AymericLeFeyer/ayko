import { z } from 'zod';
import { isoDate, secretMap, uuid } from './common.js';

export const mcpTransport = z.enum(['stdio', 'sse', 'http']);
export type McpTransport = z.infer<typeof mcpTransport>;

export const mcpStatus = z.enum(['disabled', 'connecting', 'connected', 'error']);
export type McpStatus = z.infer<typeof mcpStatus>;

export const toolPolicy = z.enum(['auto', 'confirm', 'forbidden']);
export type ToolPolicy = z.infer<typeof toolPolicy>;

export const mcpServer = z.object({
  id: uuid,
  name: z.string(),
  transport: mcpTransport,
  command: z.string().nullable(),
  args: z.array(z.string()),
  url: z.string().nullable(),
  /** Names only: the values are encrypted at rest and never returned. */
  envNames: z.array(z.string()),
  headerNames: z.array(z.string()),
  enabled: z.boolean(),
  status: mcpStatus,
  lastError: z.string().nullable(),
  latencyMs: z.number().nullable(),
  toolCount: z.number().int(),
  createdAt: isoDate,
});
export type McpServer = z.infer<typeof mcpServer>;

export const mcpServerInput = z.object({
  name: z.string().min(1).max(64),
  transport: mcpTransport,
  command: z.string().nullable().optional(),
  args: z.array(z.string()).default([]),
  url: z.url().nullable().optional(),
  env: secretMap.optional(),
  headers: secretMap.optional(),
  enabled: z.boolean().default(true),
});
export type McpServerInput = z.input<typeof mcpServerInput>;

export const mcpTool = z.object({
  id: uuid,
  serverId: uuid,
  serverName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  inputSchema: z.record(z.string(), z.unknown()),
  readOnly: z.boolean(),
  aliasName: z.string().nullable(),
  customDescription: z.string().nullable(),
  enabled: z.boolean(),
  policy: toolPolicy,
  cacheEnabled: z.boolean(),
  /** Read tools only: seconds a live result may be reused. Null means never. */
  cacheTtlSeconds: z.number().int().nullable(),
  /** Its output describes the house and goes into every prompt. */
  contextSource: z.boolean(),
  roomOverrides: z.array(z.object({ roomId: uuid, policy: toolPolicy })),
});
export type McpTool = z.infer<typeof mcpTool>;

export const toolPolicyUpdate = z.object({
  enabled: z.boolean().optional(),
  policy: toolPolicy.optional(),
  aliasName: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .nullable()
    .optional(),
  customDescription: z.string().max(2000).nullable().optional(),
  cacheEnabled: z.boolean().optional(),
  cacheTtlSeconds: z.number().int().min(1).nullable().optional(),
  contextSource: z.boolean().optional(),
  roomOverrides: z.array(z.object({ roomId: uuid, policy: toolPolicy })).optional(),
});
export type ToolPolicyUpdate = z.infer<typeof toolPolicyUpdate>;

export const mcpResource = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mimeType: z.string().nullable(),
});
export type McpResource = z.infer<typeof mcpResource>;

export const mcpPrompt = z.object({
  name: z.string(),
  description: z.string().nullable(),
  arguments: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      required: z.boolean(),
    }),
  ),
});
export type McpPrompt = z.infer<typeof mcpPrompt>;

export const mcpExplorer = z.object({
  tools: z.array(mcpTool),
  resources: z.array(mcpResource),
  prompts: z.array(mcpPrompt),
});
export type McpExplorer = z.infer<typeof mcpExplorer>;

export const toolCallRequest = z.object({ arguments: z.record(z.string(), z.unknown()) });

export const toolCallResult = z.object({
  isError: z.boolean(),
  durationMs: z.number(),
  raw: z.unknown(),
  text: z.string(),
});
export type ToolCallResult = z.infer<typeof toolCallResult>;

export const toolCallLog = z.object({
  id: uuid,
  requestId: uuid.nullable(),
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  serverName: z.string(),
  toolName: z.string(),
  arguments: z.unknown(),
  result: z.string().nullable(),
  isError: z.boolean(),
  durationMs: z.number(),
  source: z.enum(['llm', 'cache', 'tester', 'widget']),
  createdAt: isoDate,
});
export type ToolCallLog = z.infer<typeof toolCallLog>;

export const mcpTemplate = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  input: mcpServerInput,
  /** Keys the admin has to fill before the template can connect. */
  requiredSecrets: z.array(z.string()),
});
export type McpTemplate = z.infer<typeof mcpTemplate>;
