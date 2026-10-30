import { createHash, randomUUID } from 'node:crypto';
import type {
  McpExplorer,
  McpServer,
  McpStatus,
  McpTool,
  mcpServerInput,
  ToolCallResult,
  ToolPolicyUpdate,
} from '@ayko/contracts';
import type { z } from 'zod';
import type { McpConnection, McpConnectionFactory } from '../../domain/mcp/McpConnection.js';
import type {
  McpRepository,
  McpServerRecord,
  McpToolRecord,
} from '../../domain/mcp/repositories/McpRepository.js';
import {
  defaultPolicy,
  isContextTool,
  resolvePolicy,
} from '../../domain/mcp/services/toolPolicy.js';
import type { Logger } from '../../domain/system/Logger.js';
import type { Vault } from '../../domain/system/Vault.js';
import { AppError, errorMessage, notFound } from '../../shared/errors.js';
import type { EventBus } from '../system/EventBus.js';

type ServerInput = z.output<typeof mcpServerInput>;

interface Runtime {
  status: McpStatus;
  lastError: string | null;
  latencyMs: number | null;
  connection: McpConnection | null;
  /** Bumped on every (re)start so a stale reconnect loop stops itself. */
  generation: number;
}

export interface ExposedTool {
  tool: McpToolRecord;
  exposedName: string;
  description: string;
}

export interface CallContext {
  requestId: string | null;
  roomId: string | null;
  source: 'llm' | 'cache' | 'tester' | 'widget';
  timeoutMs: number;
  signal?: AbortSignal;
}

const RESULT_LOG_MAX = 20_000;

const schemaHash = (description: string | null, schema: unknown) =>
  createHash('sha256')
    .update(JSON.stringify([description, schema]))
    .digest('hex');

const invalidExposedChars = /[^a-zA-Z0-9_-]/g;

export class McpRegistry {
  private readonly runtime = new Map<string, Runtime>();
  private invalidateTool: (toolId: string) => Promise<void> = async () => {};
  private invalidateServer: (serverId: string) => Promise<void> = async () => {};
  private closing = false;

  constructor(
    private readonly repository: McpRepository,
    private readonly vault: Vault,
    private readonly createConnection: McpConnectionFactory,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}

  /** Set by the composition root; the cache depends on MCP, not the reverse. */
  bindInvalidation(hooks: {
    tool: (toolId: string) => Promise<void>;
    server: (serverId: string) => Promise<void>;
  }) {
    this.invalidateTool = hooks.tool;
    this.invalidateServer = hooks.server;
  }

  private state(id: string): Runtime {
    let state = this.runtime.get(id);
    if (!state) {
      state = {
        status: 'disabled',
        lastError: null,
        latencyMs: null,
        connection: null,
        generation: 0,
      };
      this.runtime.set(id, state);
    }
    return state;
  }

  private setStatus(id: string, status: McpStatus, lastError: string | null = null) {
    const state = this.state(id);
    state.status = status;
    state.lastError = lastError;
    this.bus.publish({ topic: 'mcp.changed', serverId: id });
  }

  private async toDto(record: McpServerRecord, toolCount: number): Promise<McpServer> {
    const { envSecretId: _env, headersSecretId: _headers, updatedAt: _updated, ...server } = record;
    const state = this.state(record.id);
    return {
      ...server,
      status: state.status,
      lastError: state.lastError,
      latencyMs: state.latencyMs,
      toolCount,
    };
  }

  async listServers() {
    const [servers, tools] = await Promise.all([
      this.repository.listServers(),
      this.repository.listTools(),
    ]);
    return Promise.all(
      servers.map((server) =>
        this.toDto(server, tools.filter((tool) => tool.serverId === server.id).length),
      ),
    );
  }

  async getServer(id: string) {
    const server = await this.repository.findServer(id);
    if (!server) throw notFound('Serveur MCP');
    return this.toDto(server, (await this.repository.listTools(id)).length);
  }

  async createServer(input: ServerInput) {
    this.assertTransport(input);
    const now = new Date().toISOString();
    const record: McpServerRecord = {
      id: randomUUID(),
      name: input.name,
      transport: input.transport,
      command: input.command ?? null,
      args: input.args,
      url: input.url ?? null,
      envSecretId: input.env ? await this.vault.store(input.env) : null,
      headersSecretId: input.headers ? await this.vault.store(input.headers) : null,
      envNames: Object.keys(input.env ?? {}),
      headerNames: Object.keys(input.headers ?? {}),
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveServer(record);
    void this.start(record.id);
    return this.toDto(record, 0);
  }

  private assertTransport(input: Pick<ServerInput, 'transport' | 'command' | 'url'>) {
    if (input.transport === 'stdio' ? !input.command : !input.url) {
      throw new AppError(
        'invalid_transport',
        input.transport === 'stdio' ? 'Commande requise' : 'URL requise',
      );
    }
  }

  async updateServer(id: string, input: Partial<ServerInput>) {
    const current = await this.repository.findServer(id);
    if (!current) throw notFound('Serveur MCP');
    const { env, headers, ...fields } = input;
    const record: McpServerRecord = {
      ...current,
      ...fields,
      command: fields.command === undefined ? current.command : fields.command,
      url: fields.url === undefined ? current.url : fields.url,
      updatedAt: new Date().toISOString(),
    };
    this.assertTransport(record);
    if (env) {
      record.envSecretId = await this.vault.store(env, current.envSecretId);
      record.envNames = Object.keys(env);
    }
    if (headers) {
      record.headersSecretId = await this.vault.store(headers, current.headersSecretId);
      record.headerNames = Object.keys(headers);
    }
    await this.repository.saveServer(record);
    await this.invalidateServer(id);
    await this.stop(id);
    void this.start(id);
    return this.getServer(id);
  }

  async deleteServer(id: string) {
    const current = await this.repository.findServer(id);
    if (!current) throw notFound('Serveur MCP');
    await this.stop(id);
    await this.invalidateServer(id);
    await this.repository.deleteServer(id);
    await this.vault.remove(current.envSecretId);
    await this.vault.remove(current.headersSecretId);
    this.runtime.delete(id);
    this.bus.publish({ topic: 'mcp.changed' });
  }

  async restart(id: string) {
    if (!(await this.repository.findServer(id))) throw notFound('Serveur MCP');
    await this.stop(id);
    await this.start(id);
    return this.getServer(id);
  }

  async startAll() {
    for (const server of await this.repository.listServers()) void this.start(server.id);
  }

  /** After a configuration restore: servers may have appeared, changed or vanished. */
  async restartAll() {
    for (const id of [...this.runtime.keys()]) await this.stop(id);
    await this.startAll();
  }

  private async stop(id: string) {
    const state = this.state(id);
    state.generation += 1;
    const connection = state.connection;
    state.connection = null;
    state.latencyMs = null;
    if (connection) await connection.close().catch(() => {});
    this.setStatus(id, 'disabled');
  }

  private async start(id: string) {
    const server = await this.repository.findServer(id);
    if (!server?.enabled) return;
    const state = this.state(id);
    state.generation += 1;
    await this.connect(server, state.generation);
  }

  /**
   * One attempt only: reconnecting is the admin's call. Automatic retries can get an IP
   * banned by a server such as Home Assistant when a token is refused.
   */
  private async connect(server: McpServerRecord, generation: number) {
    const state = this.state(server.id);
    const current = () => !this.closing && state.generation === generation;
    this.setStatus(server.id, 'connecting');
    try {
      const connection = this.createConnection({
        transport: server.transport,
        command: server.command,
        args: server.args,
        url: server.url,
        env: await this.vault.read(server.envSecretId),
        headers: await this.vault.read(server.headersSecretId),
      });
      await connection.connect();
      if (!current()) {
        await connection.close().catch(() => {});
        return;
      }
      connection.onClose((reason) => {
        if (!current()) return;
        state.connection = null;
        state.latencyMs = null;
        this.setStatus(server.id, 'error', reason ?? 'Connexion perdue');
        this.logger.log('warn', 'mcp', `${server.name} déconnecté`, { data: { reason } });
      });
      connection.onToolsChanged(() => void this.syncTools(server.id, connection));
      state.connection = connection;
      await this.syncTools(server.id, connection);
      await this.measure(server.id);
      this.setStatus(server.id, 'connected');
      this.logger.log('info', 'mcp', `${server.name} connecté`);
    } catch (error) {
      const message = errorMessage(error);
      state.connection = null;
      this.setStatus(server.id, 'error', message);
      this.logger.log('error', 'mcp', `${server.name} : ${message}`);
    }
  }

  /** Aligns stored tools with the server, keeping admin choices and flagging changes. */
  private async syncTools(serverId: string, connection: McpConnection) {
    const remote = await connection.listTools();
    const stored = await this.repository.listTools(serverId);
    for (const tool of remote) {
      const hash = schemaHash(tool.description, tool.inputSchema);
      const existing = stored.find((item) => item.name === tool.name);
      if (!existing) {
        await this.repository.insertTool({
          id: randomUUID(),
          serverId,
          serverName: '',
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          schemaHash: hash,
          readOnly: tool.readOnly,
          aliasName: null,
          customDescription: null,
          enabled: true,
          policy: defaultPolicy(tool.name),
          cacheEnabled: true,
          cacheTtlSeconds: null,
          contextSource: null,
          roomOverrides: [],
        });
      } else if (existing.schemaHash !== hash) {
        await this.repository.updateToolDefinition(existing.id, {
          description: tool.description,
          inputSchema: tool.inputSchema,
          schemaHash: hash,
          readOnly: tool.readOnly,
        });
        await this.invalidateTool(existing.id);
      }
    }
    for (const tool of stored) {
      if (!remote.some((item) => item.name === tool.name)) {
        await this.invalidateTool(tool.id);
        await this.repository.deleteTool(tool.id);
      }
    }
    this.bus.publish({ topic: 'mcp.changed', serverId });
  }

  private async measure(id: string) {
    const state = this.state(id);
    if (!state.connection) return;
    const started = performance.now();
    await state.connection.ping();
    state.latencyMs = performance.now() - started;
  }

  async pingAll() {
    for (const [id, state] of this.runtime) {
      if (state.status !== 'connected') continue;
      await this.measure(id).catch((error: unknown) => {
        this.logger.log('warn', 'mcp', `Ping échoué : ${errorMessage(error)}`);
      });
    }
    this.bus.publish({ topic: 'mcp.changed' });
  }

  async listTools(serverId?: string): Promise<McpTool[]> {
    const tools = await this.repository.listTools(serverId);
    return tools.map(({ schemaHash: _hash, ...tool }) => ({
      ...tool,
      contextSource: isContextTool(tool),
    }));
  }

  getTool(id: string) {
    return this.repository.findTool(id);
  }

  async explore(serverId: string): Promise<McpExplorer> {
    const connection = this.state(serverId).connection;
    const tools = await this.listTools(serverId);
    if (!connection) return { tools, resources: [], prompts: [] };
    const [resources, prompts] = await Promise.all([
      connection.listResources().catch(() => []),
      connection.listPrompts().catch(() => []),
    ]);
    return { tools, resources, prompts };
  }

  async updatePolicy(toolId: string, update: ToolPolicyUpdate) {
    const tool = await this.repository.findTool(toolId);
    if (!tool) throw notFound('Outil');
    const { roomOverrides, ...fields } = update;
    await this.repository.updateToolPolicy(toolId, fields);
    if (roomOverrides) await this.repository.setRoomOverrides(toolId, roomOverrides);
    this.bus.publish({ topic: 'mcp.changed', serverId: tool.serverId });
    return (await this.listTools(tool.serverId)).find((item) => item.id === toolId);
  }

  /** Tools the LLM may see from a room, under stable and unique names. */
  async toolsFor(roomId: string | null): Promise<ExposedTool[]> {
    const tools = await this.repository.listTools();
    const reachable = tools.filter(
      (tool) =>
        this.state(tool.serverId).status === 'connected' &&
        resolvePolicy(tool, roomId) !== 'forbidden',
    );
    const seen = new Map<string, number>();
    for (const tool of reachable) {
      const name = tool.aliasName ?? tool.name;
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    return reachable.map((tool) => {
      const name = tool.aliasName ?? tool.name;
      const exposedName =
        (seen.get(name) ?? 0) > 1
          ? `${tool.serverName}_${name}`.replace(invalidExposedChars, '_')
          : name;
      return {
        tool,
        exposedName,
        description: tool.customDescription ?? tool.description ?? tool.name,
      };
    });
  }

  policyFor(tool: McpToolRecord, roomId: string | null) {
    return resolvePolicy(tool, roomId);
  }

  isConnected(serverId: string) {
    return this.state(serverId).status === 'connected';
  }

  async call(
    tool: McpToolRecord,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult> {
    const connection = this.state(tool.serverId).connection;
    const started = performance.now();
    let result: ToolCallResult;
    try {
      if (!connection) throw new Error(`Serveur ${tool.serverName} non connecté`);
      const outcome = await connection.callTool(tool.name, args, {
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      result = { ...outcome, durationMs: performance.now() - started };
    } catch (error) {
      if (context.signal?.aborted) throw error;
      result = {
        isError: true,
        raw: null,
        text: errorMessage(error),
        durationMs: performance.now() - started,
      };
    }
    await this.repository.recordCall({
      id: randomUUID(),
      requestId: context.requestId,
      roomId: context.roomId,
      serverId: tool.serverId,
      serverName: tool.serverName,
      toolName: tool.name,
      arguments: args,
      result: result.text.slice(0, RESULT_LOG_MAX),
      isError: result.isError,
      durationMs: result.durationMs,
      source: context.source,
      createdAt: new Date().toISOString(),
    });
    return result;
  }

  listCalls(...args: Parameters<McpRepository['listCalls']>) {
    return this.repository.listCalls(...args);
  }

  async shutdown() {
    this.closing = true;
    await Promise.all(
      [...this.runtime.values()].map((state) => state.connection?.close().catch(() => {})),
    );
  }
}
