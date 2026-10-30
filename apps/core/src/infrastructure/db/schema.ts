import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  CachedCall,
  CacheSettings,
  McpTransport,
  ModelParams,
  PersonaFields,
  RoomConfig,
  ToolPolicy,
  VoiceProviderConfig,
} from '@ayko/contracts';

const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const bool = (name: string) => integer(name, { mode: 'boolean' });

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

export const sessionsAuth = sqliteTable('sessions_auth', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  createdAt: text('created_at').notNull(),
});

export const ollamaEndpoints = sqliteTable('ollama_endpoints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  enabled: bool('enabled').notNull(),
  priority: integer('priority').notNull(),
  connectTimeoutMs: integer('connect_timeout_ms').notNull(),
  headersSecretId: text('headers_secret_id'),
  headerNames: json<string[]>('header_names').notNull(),
  lastStatus: text('last_status').$type<'unknown' | 'up' | 'down'>().notNull(),
  lastLatencyMs: real('last_latency_ms'),
  lastCheckedAt: text('last_checked_at'),
  version: text('version'),
  metricsUrl: text('metrics_url'),
  createdAt: text('created_at').notNull(),
});

export const modelRoles = sqliteTable('model_roles', {
  role: text('role').primaryKey(),
  model: text('model'),
  params: json<ModelParams>('params').notNull(),
});

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  transport: text('transport').$type<McpTransport>().notNull(),
  command: text('command'),
  args: json<string[]>('args').notNull(),
  url: text('url'),
  envSecretId: text('env_secret_id'),
  headersSecretId: text('headers_secret_id'),
  envNames: json<string[]>('env_names').notNull(),
  headerNames: json<string[]>('header_names').notNull(),
  enabled: bool('enabled').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const mcpTools = sqliteTable(
  'mcp_tools',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    inputSchema: json<Record<string, unknown>>('input_schema').notNull(),
    schemaHash: text('schema_hash').notNull(),
    readOnly: bool('read_only').notNull(),
    aliasName: text('alias_name'),
    customDescription: text('custom_description'),
    enabled: bool('enabled').notNull(),
    policy: text('policy').$type<ToolPolicy>().notNull(),
    cacheEnabled: bool('cache_enabled').notNull(),
    cacheTtlSeconds: integer('cache_ttl_seconds'),
  },
  (table) => [index('mcp_tools_server_idx').on(table.serverId)],
);

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  icon: text('icon').notNull(),
  config: json<RoomConfig>('config').notNull(),
  createdAt: text('created_at').notNull(),
});

export const toolPolicyOverrides = sqliteTable(
  'tool_policy_overrides',
  {
    toolId: text('tool_id')
      .notNull()
      .references(() => mcpTools.id, { onDelete: 'cascade' }),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    policy: text('policy').$type<ToolPolicy>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.toolId, table.roomId] })],
);

export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  language: text('language').notNull(),
  responseLength: text('response_length').$type<PersonaFields['responseLength']>().notNull(),
  address: text('address').$type<PersonaFields['address']>().notNull(),
  isDefault: bool('is_default').notNull(),
  version: integer('version').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const personaVersions = sqliteTable('persona_versions', {
  id: text('id').primaryKey(),
  personaId: text('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: json<PersonaFields>('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  tokenHash: text('token_hash').notNull().unique(),
  lastSeenAt: text('last_seen_at'),
  uiVersion: text('ui_version'),
  revoked: bool('revoked').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pairingRequests = sqliteTable('pairing_requests', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  deviceName: text('device_name'),
  deviceId: text('device_id'),
  /** Encrypted until the tablet collects it, then wiped. */
  deviceTokenCipher: text('device_token_cipher'),
  status: text('status').$type<'pending' | 'confirmed' | 'expired'>().notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  source: text('source').$type<'playground' | 'display' | 'api'>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    requestId: text('request_id'),
    role: text('role').$type<'system' | 'user' | 'assistant' | 'tool'>().notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('messages_conversation_idx').on(table.conversationId)],
);

export const requests = sqliteTable(
  'requests',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id'),
    roomId: text('room_id'),
    deviceId: text('device_id'),
    text: text('text').notNull(),
    status: text('status').$type<'running' | 'done' | 'error' | 'cancelled'>().notNull(),
    model: text('model'),
    personaName: text('persona_name'),
    prompt: json<unknown>('prompt'),
    reasoning: text('reasoning'),
    answer: text('answer'),
    error: text('error'),
    cacheOutcome: text('cache_outcome').$type<'hit' | 'miss' | 'skipped'>().notNull(),
    cacheEntryId: text('cache_entry_id'),
    cacheMatchType: text('cache_match_type').$type<'exact' | 'approximate'>(),
    cacheDurationMs: real('cache_duration_ms'),
    ttftMs: real('ttft_ms'),
    tokensPerSecond: real('tokens_per_second'),
    outputTokens: integer('output_tokens'),
    durationMs: real('duration_ms'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('requests_created_idx').on(table.createdAt)],
);

export const traceSteps = sqliteTable(
  'trace_steps',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    status: text('status').$type<'running' | 'done' | 'error' | 'cancelled'>().notNull(),
    detail: json<unknown>('detail'),
    startedAt: text('started_at').notNull(),
    durationMs: real('duration_ms'),
  },
  (table) => [index('trace_steps_request_idx').on(table.requestId)],
);

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id'),
    roomId: text('room_id'),
    serverId: text('server_id'),
    serverName: text('server_name').notNull(),
    toolName: text('tool_name').notNull(),
    arguments: json<unknown>('arguments'),
    result: text('result'),
    isError: bool('is_error').notNull(),
    durationMs: real('duration_ms').notNull(),
    source: text('source').$type<'llm' | 'cache' | 'tester' | 'widget'>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('tool_calls_request_idx').on(table.requestId),
    index('tool_calls_created_idx').on(table.createdAt),
  ],
);

export const voiceProviders = sqliteTable('voice_providers', {
  id: text('id').primaryKey(),
  slot: text('slot').$type<'wake_word' | 'stt' | 'tts'>().notNull(),
  kind: text('kind').$type<'fake' | 'wyoming' | 'openai_http' | 'stdio'>().notNull(),
  name: text('name').notNull(),
  active: bool('active').notNull(),
  config: json<VoiceProviderConfig>('config').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: json<unknown>('value').notNull(),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    details: json<unknown>('details'),
  },
  (table) => [index('audit_ts_idx').on(table.ts)],
);

export const logs = sqliteTable(
  'logs',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    level: text('level').$type<'debug' | 'info' | 'warn' | 'error'>().notNull(),
    component: text('component').notNull(),
    message: text('message').notNull(),
    roomId: text('room_id'),
    requestId: text('request_id'),
    data: json<unknown>('data'),
  },
  (table) => [index('logs_ts_idx').on(table.ts)],
);

export type HistoryCallRow = {
  toolId: string | null;
  serverId: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  result: string | null;
};

export const mcpRequestHistory = sqliteTable(
  'mcp_request_history',
  {
    id: text('id').primaryKey(),
    /** normalised text + room + calls: identical requests aggregate into one row. */
    groupKey: text('group_key').notNull().unique(),
    rawText: text('raw_text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    roomId: text('room_id'),
    deviceId: text('device_id'),
    calls: json<HistoryCallRow[]>('calls').notNull(),
    occurrences: integer('occurrences').notNull(),
    totalDurationMs: real('total_duration_ms').notNull(),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    cacheEntryId: text('cache_entry_id'),
  },
  (table) => [index('history_last_seen_idx').on(table.lastSeenAt)],
);

export const requestCacheEntries = sqliteTable(
  'request_cache_entries',
  {
    id: text('id').primaryKey(),
    /** `normalised|roomId`, or `normalised|*` for an entry marked global. */
    cacheKey: text('cache_key').notNull().unique(),
    normalizedText: text('normalized_text').notNull(),
    sampleText: text('sample_text').notNull(),
    roomId: text('room_id'),
    global: bool('global').notNull(),
    kind: text('kind').$type<'action' | 'read'>().notNull(),
    calls: json<CachedCall[]>('calls').notNull(),
    response: text('response').notNull(),
    aliases: json<string[]>('aliases').notNull(),
    aliasKeys: json<string[]>('alias_keys').notNull(),
    status: text('status')
      .$type<'active' | 'pinned' | 'excluded' | 'doubtful' | 'invalidated'>()
      .notNull(),
    hits: integer('hits').notNull(),
    failures: integer('failures').notNull(),
    occurrences: integer('occurrences').notNull(),
    ttlSeconds: integer('ttl_seconds'),
    lastResult: text('last_result'),
    lastResultAt: text('last_result_at'),
    llmDurationMs: real('llm_duration_ms'),
    embedding: json<number[]>('embedding'),
    createdAt: text('created_at').notNull(),
    lastHitAt: text('last_hit_at'),
  },
  (table) => [index('cache_room_idx').on(table.roomId)],
);

/** Single row (`id = 1`) holding the cache switches, N and thresholds. */
export const cacheSettingsTable = sqliteTable('cache_settings', {
  id: integer('id').primaryKey(),
  value: json<CacheSettings>('value').notNull(),
});
