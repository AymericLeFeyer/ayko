import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { looksReadOnly } from '../../domain/mcp/services/toolPolicy.js';
import type {
  McpCallOutcome,
  McpConnection,
  McpRemoteTool,
  McpServerConfig,
} from '../../domain/mcp/McpConnection.js';

function buildTransport(config: McpServerConfig): Transport {
  if (config.transport === 'stdio') {
    if (!config.command) throw new Error('A stdio server needs a command');
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...getDefaultEnvironment(), ...config.env },
      stderr: 'pipe',
    });
  }
  if (!config.url) throw new Error('This transport needs a URL');
  const requestInit = { headers: config.headers };
  return config.transport === 'sse'
    ? new SSEClientTransport(new URL(config.url), { requestInit })
    : new StreamableHTTPClientTransport(new URL(config.url), { requestInit });
}

const extractText = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((part: { type?: string; text?: string }) =>
      part.type === 'text' ? (part.text ?? '') : `[${part.type ?? 'contenu'}]`,
    )
    .join('\n');
};

export class SdkMcpConnection implements McpConnection {
  private readonly client = new Client({ name: 'ayko-core', version: '0.1.0' });
  private closeListener: ((reason: string | null) => void) | null = null;
  private lastError: string | null = null;

  constructor(private readonly config: McpServerConfig) {
    this.client.onerror = (error) => {
      this.lastError = error.message;
    };
    this.client.onclose = () => this.closeListener?.(this.lastError);
  }

  async connect() {
    await this.client.connect(buildTransport(this.config));
  }

  private supports(capability: 'tools' | 'resources' | 'prompts') {
    return this.client.getServerCapabilities()?.[capability] !== undefined;
  }

  async listTools(): Promise<McpRemoteTool[]> {
    if (!this.supports('tools')) return [];
    const tools: McpRemoteTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools({ cursor });
      for (const tool of page.tools) {
        tools.push({
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema as Record<string, unknown>,
          readOnly: tool.annotations?.readOnlyHint ?? looksReadOnly(tool.name),
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async listResources() {
    if (!this.supports('resources')) return [];
    const { resources } = await this.client.listResources();
    return resources.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description ?? null,
      mimeType: resource.mimeType ?? null,
    }));
  }

  async listPrompts() {
    if (!this.supports('prompts')) return [];
    const { prompts } = await this.client.listPrompts();
    return prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description ?? null,
      arguments: (prompt.arguments ?? []).map((argument) => ({
        name: argument.name,
        description: argument.description ?? null,
        required: argument.required ?? false,
      })),
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<McpCallOutcome> {
    const result = await this.client.callTool({ name, arguments: args }, undefined, {
      timeout: options.timeoutMs,
      signal: options.signal,
    });
    return {
      isError: result.isError === true,
      raw: result,
      text: extractText(result.content),
    };
  }

  async ping() {
    await this.client.ping({ timeout: 5000 });
  }

  async close() {
    this.closeListener = null;
    await this.client.close();
  }

  onClose(listener: (reason: string | null) => void) {
    this.closeListener = listener;
  }

  onToolsChanged(listener: () => void) {
    if (this.client.getServerCapabilities()?.tools?.listChanged) {
      this.client.setNotificationHandler(ToolListChangedNotificationSchema, listener);
    }
  }
}
