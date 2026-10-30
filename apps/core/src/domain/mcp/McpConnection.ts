import type { McpPrompt, McpResource } from '@ayko/contracts';

export interface McpServerConfig {
  transport: 'stdio' | 'sse' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  headers: Record<string, string>;
}

export interface McpRemoteTool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpCallOutcome {
  isError: boolean;
  raw: unknown;
  text: string;
}

/** A live link to one MCP server, whatever its transport. */
export interface McpConnection {
  connect(): Promise<void>;
  listTools(): Promise<McpRemoteTool[]>;
  listResources(): Promise<McpResource[]>;
  listPrompts(): Promise<McpPrompt[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<McpCallOutcome>;
  ping(): Promise<void>;
  close(): Promise<void>;
  onClose(listener: (reason: string | null) => void): void;
  onToolsChanged(listener: () => void): void;
}

export type McpConnectionFactory = (config: McpServerConfig) => McpConnection;
