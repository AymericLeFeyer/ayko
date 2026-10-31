import type {
  ApiKey,
  ApiKeyCreated,
  AuditEntry,
  CacheClear,
  CacheEntry,
  CacheEntryUpdate,
  CacheSettings,
  CacheStats,
  Camera,
  CameraSourceStatus,
  CameraUpdate,
  ChatRequest,
  ConfigBundle,
  ConfigImportResult,
  Conversation,
  ConversationDetail,
  Credentials,
  Device,
  DeviceCommand,
  DeviceUpdate,
  EndpointTestResult,
  HistoryEntry,
  LogEntry,
  McpExplorer,
  McpServer,
  McpServerInput,
  McpTemplate,
  McpTool,
  Memory,
  MemoryInput,
  Metrics,
  ModelRole,
  ModelTestEvent,
  ModelTestRequest,
  OllamaEndpoint,
  OllamaEndpointInput,
  OllamaModel,
  OllamaModelDetail,
  Page,
  PairingConfirm,
  PairingPending,
  Persona,
  PersonaBody,
  PersonaPreview,
  PersonaPreviewRequest,
  PersonaVersion,
  PullProgress,
  Report,
  Room,
  RoomInput,
  RunningModel,
  SetupStatus,
  SetupWizardState,
  SystemSettings,
  ToolCallLog,
  ToolCallResult,
  ToolPolicyUpdate,
  Trace,
  User,
  VoiceProvider,
  VoiceProvidersUpdate,
  VoiceTestResult,
  AgentEvent,
} from '@ayko/contracts';
import { get, http, streamEvents, withQuery } from './http/client';

export const authApi = {
  status: () => get<SetupStatus>('/setup/status'),
  me: () => get<{ id: string | null; name: string }>('/auth/me'),
  setup: (input: Credentials) => http<User>('POST', '/auth/setup', input),
  login: (input: Credentials) => http<User>('POST', '/auth/login', input),
  logout: () => http('POST', '/auth/logout', {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    http('POST', '/auth/password', { currentPassword, newPassword }),
  listKeys: () => get<ApiKey[]>('/api-keys'),
  createKey: (name: string) => http<ApiKeyCreated>('POST', '/api-keys', { name }),
  deleteKey: (id: string) => http('DELETE', `/api-keys/${id}`),
};

export const ollamaApi = {
  endpoints: () => get<OllamaEndpoint[]>('/ollama/endpoints'),
  createEndpoint: (input: OllamaEndpointInput) =>
    http<OllamaEndpoint>('POST', '/ollama/endpoints', input),
  updateEndpoint: (id: string, input: Partial<OllamaEndpointInput>) =>
    http<OllamaEndpoint>('PATCH', `/ollama/endpoints/${id}`, input),
  deleteEndpoint: (id: string) => http('DELETE', `/ollama/endpoints/${id}`),
  testEndpoint: (id: string) =>
    http<EndpointTestResult>('POST', `/ollama/endpoints/${id}/test`, {}),
  models: () => get<OllamaModel[]>('/ollama/models'),
  model: (name: string) => get<OllamaModelDetail>(`/ollama/models/${encodeURIComponent(name)}`),
  deleteModel: (name: string) => http('DELETE', `/ollama/models/${encodeURIComponent(name)}`),
  running: () => get<RunningModel[]>('/ollama/running'),
  roles: () => get<ModelRole[]>('/ollama/roles'),
  saveRoles: (roles: ModelRole[]) => http<ModelRole[]>('PUT', '/ollama/roles', roles),
  pull: (name: string, signal?: AbortSignal) =>
    streamEvents<PullProgress>('/ollama/models/pull', { name }, signal),
  test: (input: ModelTestRequest, signal?: AbortSignal) =>
    streamEvents<ModelTestEvent>('/ollama/models/test', input, signal),
};

export const mcpApi = {
  templates: () => get<McpTemplate[]>('/mcp/templates'),
  servers: () => get<McpServer[]>('/mcp/servers'),
  createServer: (input: McpServerInput) => http<McpServer>('POST', '/mcp/servers', input),
  updateServer: (id: string, input: Partial<McpServerInput>) =>
    http<McpServer>('PATCH', `/mcp/servers/${id}`, input),
  deleteServer: (id: string) => http('DELETE', `/mcp/servers/${id}`),
  restart: (id: string) => http<McpServer>('POST', `/mcp/servers/${id}/restart`, {}),
  explore: (id: string) => get<McpExplorer>(`/mcp/servers/${id}/explore`),
  allTools: async () => {
    const servers = await mcpApi.servers();
    const lists = await Promise.all(
      servers.map((server) => get<McpTool[]>(`/mcp/servers/${server.id}/tools`)),
    );
    return lists.flat();
  },
  updatePolicy: (id: string, update: ToolPolicyUpdate) =>
    http<McpTool>('PUT', `/mcp/tools/${id}/policy`, update),
  callTool: (id: string, args: Record<string, unknown>) =>
    http<ToolCallResult>('POST', `/mcp/tools/${id}/call`, { arguments: args }),
  calls: (filter: { serverName?: string; errorsOnly?: boolean; cursor?: string }) =>
    get<Page<ToolCallLog>>(withQuery('/mcp/calls', { limit: 50, ...filter })),
};

export const personaApi = {
  list: () => get<Persona[]>('/personas'),
  create: (body: PersonaBody) => http<Persona>('POST', '/personas', body),
  update: (id: string, body: Partial<PersonaBody>) =>
    http<Persona>('PATCH', `/personas/${id}`, body),
  remove: (id: string) => http('DELETE', `/personas/${id}`),
  setDefault: (id: string) => http<Persona>('POST', `/personas/${id}/default`, {}),
  versions: (id: string) => get<PersonaVersion[]>(`/personas/${id}/versions`),
  rollback: (id: string, version: number) =>
    http<Persona>('POST', `/personas/${id}/rollback`, { version }),
  preview: (id: string, request: PersonaPreviewRequest) =>
    http<PersonaPreview>('POST', `/personas/${id}/preview`, request),
};

export const roomApi = {
  list: () => get<Room[]>('/rooms'),
  create: (input: RoomInput) => http<Room>('POST', '/rooms', input),
  update: (id: string, input: Partial<RoomInput>) => http<Room>('PATCH', `/rooms/${id}`, input),
  remove: (id: string) => http('DELETE', `/rooms/${id}`),
  devices: () => get<Device[]>('/devices'),
  updateDevice: (id: string, update: DeviceUpdate) =>
    http<Device>('PATCH', `/devices/${id}`, update),
  removeDevice: (id: string) => http('DELETE', `/devices/${id}`),
  command: (id: string, command: DeviceCommand['command']) =>
    http('POST', `/devices/${id}/command`, { command }),
  pendingPairings: () => get<PairingPending[]>('/pairing/pending'),
  confirmPairing: (input: PairingConfirm) => http<Device>('POST', '/pairing/confirm', input),
};

export const chatApi = {
  send: (input: ChatRequest, signal?: AbortSignal) =>
    streamEvents<AgentEvent>('/chat', input, signal),
  cancel: (requestId: string) => http('POST', `/chat/${requestId}/cancel`, {}),
  confirm: (confirmId: string, accepted: boolean) =>
    http('POST', '/chat/confirm', { confirmId, accepted }),
  conversations: (filter: { search?: string; roomId?: string; cursor?: string }) =>
    get<Page<Conversation>>(withQuery('/conversations', { limit: 30, ...filter })),
  conversation: (id: string) => get<ConversationDetail>(`/conversations/${id}`),
  trace: (requestId: string) => get<Trace>(`/traces/${requestId}`),
};

export const cacheApi = {
  history: (filter: object) =>
    get<Page<HistoryEntry>>(withQuery('/history/requests', { limit: 50, ...filter })),
  entries: (filter: object) => get<CacheEntry[]>(withQuery('/cache/entries', filter)),
  updateEntry: (id: string, update: CacheEntryUpdate) =>
    http<CacheEntry>('PATCH', `/cache/entries/${id}`, update),
  deleteEntry: (id: string) => http('DELETE', `/cache/entries/${id}`),
  pin: (id: string) => http<CacheEntry>('POST', `/cache/entries/${id}/pin`, {}),
  promote: (historyId: string) => http<CacheEntry>('POST', '/cache/promote', { historyId }),
  clear: (input: CacheClear) =>
    http<{ entries: number; history: number }>('POST', '/cache/clear', input),
  settings: () => get<CacheSettings>('/cache/settings'),
  saveSettings: (settings: CacheSettings) =>
    http<CacheSettings>('PUT', '/cache/settings', settings),
  stats: () => get<CacheStats>('/cache/stats'),
};

export const memoryApi = {
  list: () => get<Memory[]>('/memories'),
  create: (input: MemoryInput) => http<Memory>('POST', '/memories', input),
  update: (id: string, input: Partial<MemoryInput>) =>
    http<Memory>('PATCH', `/memories/${id}`, input),
  remove: (id: string) => http('DELETE', `/memories/${id}`),
};

export const cameraApi = {
  list: () => get<Camera[]>('/cameras'),
  source: () => get<CameraSourceStatus>('/cameras/source'),
  sync: () => http<Camera[]>('POST', '/cameras/sync', {}),
  update: (id: string, input: CameraUpdate) => http<Camera>('PATCH', `/cameras/${id}`, input),
  snapshotUrl: (id: string) => `/api/v1/cameras/${id}/snapshot`,
};

export const reportApi = {
  list: (limit?: number) => get<Report[]>(withQuery('/reports', { limit })),
  remove: (id: string) => http('DELETE', `/reports/${id}`),
};

export const voiceApi = {
  list: () => get<VoiceProvider[]>('/voice/providers'),
  save: (update: VoiceProvidersUpdate) => http<VoiceProvider[]>('PUT', '/voice/providers', update),
  test: (id: string) => http<VoiceTestResult>('POST', `/voice/providers/${id}/test`, {}),
};

export const systemApi = {
  metrics: () => get<Metrics>('/metrics'),
  logs: (filter: object) => get<Page<LogEntry>>(withQuery('/logs', { limit: 100, ...filter })),
  audit: (cursor?: string) => get<Page<AuditEntry>>(withQuery('/audit', { limit: 50, cursor })),
  settings: () => get<SystemSettings>('/settings'),
  saveSettings: (settings: SystemSettings) => http<SystemSettings>('PUT', '/settings', settings),
  exportConfig: (includeSecrets: boolean) =>
    http<ConfigBundle>('POST', '/config/export', { includeSecrets }),
  importConfig: (bundle: unknown) => http<ConfigImportResult>('POST', '/config/import', bundle),
  wizard: () => get<SetupWizardState>('/setup/wizard'),
  completeWizard: () => http<SetupWizardState>('POST', '/setup/wizard/complete', {}),
};
