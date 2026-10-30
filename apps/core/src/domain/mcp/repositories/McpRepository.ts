import type { McpTool, Page, ToolCallLog, ToolPolicy } from '@ayko/contracts';

export interface McpServerRecord {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  envSecretId: string | null;
  headersSecretId: string | null;
  envNames: string[];
  headerNames: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type McpToolRecord = Omit<McpTool, 'serverName' | 'contextSource'> & {
  schemaHash: string;
  serverName: string;
  contextSource: boolean | null;
};

export interface NewToolCall {
  id: string;
  requestId: string | null;
  roomId: string | null;
  serverId: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  result: string | null;
  isError: boolean;
  durationMs: number;
  source: 'llm' | 'cache' | 'tester' | 'widget';
  createdAt: string;
}

export interface ToolCallFilter {
  serverName?: string;
  toolName?: string;
  roomId?: string;
  errorsOnly?: boolean;
}

export interface McpRepository {
  listServers(): Promise<McpServerRecord[]>;
  findServer(id: string): Promise<McpServerRecord | null>;
  saveServer(server: McpServerRecord): Promise<void>;
  deleteServer(id: string): Promise<boolean>;
  listTools(serverId?: string): Promise<McpToolRecord[]>;
  findTool(id: string): Promise<McpToolRecord | null>;
  insertTool(tool: McpToolRecord): Promise<void>;
  /** Refreshes what the server declares, leaving admin choices untouched. */
  updateToolDefinition(
    id: string,
    definition: Pick<McpToolRecord, 'description' | 'inputSchema' | 'schemaHash' | 'readOnly'>,
  ): Promise<void>;
  updateToolPolicy(
    id: string,
    update: Partial<
      Pick<
        McpToolRecord,
        | 'enabled'
        | 'policy'
        | 'aliasName'
        | 'customDescription'
        | 'cacheEnabled'
        | 'cacheTtlSeconds'
        | 'contextSource'
      >
    >,
  ): Promise<void>;
  deleteTool(id: string): Promise<void>;
  setRoomOverrides(
    toolId: string,
    overrides: { roomId: string; policy: ToolPolicy }[],
  ): Promise<void>;
  recordCall(call: NewToolCall): Promise<void>;
  listCalls(filter: ToolCallFilter, limit: number, cursor?: string): Promise<Page<ToolCallLog>>;
}
