import { and, eq, type SQL } from 'drizzle-orm';
import type { ToolPolicy } from '@ayko/contracts';
import type {
  McpRepository,
  McpServerRecord,
  McpToolRecord,
  NewToolCall,
  ToolCallFilter,
} from '../../../domain/mcp/repositories/McpRepository.js';
import type { Db } from '../client.js';
import { cursorCondition, newestFirst, toPage } from '../pagination.js';
import { mcpServers, mcpTools, rooms, toolCalls, toolPolicyOverrides } from '../schema.js';

export class DrizzleMcpRepository implements McpRepository {
  constructor(private readonly db: Db) {}

  async listServers() {
    return this.db.select().from(mcpServers).all();
  }

  async findServer(id: string) {
    return this.db.select().from(mcpServers).where(eq(mcpServers.id, id)).get() ?? null;
  }

  async saveServer(server: McpServerRecord) {
    const { id: _id, createdAt: _createdAt, ...update } = server;
    this.db
      .insert(mcpServers)
      .values(server)
      .onConflictDoUpdate({ target: mcpServers.id, set: update })
      .run();
  }

  async deleteServer(id: string) {
    return this.db.delete(mcpServers).where(eq(mcpServers.id, id)).run().changes > 0;
  }

  async listTools(serverId?: string): Promise<McpToolRecord[]> {
    const rows = this.db
      .select({ tool: mcpTools, serverName: mcpServers.name })
      .from(mcpTools)
      .innerJoin(mcpServers, eq(mcpServers.id, mcpTools.serverId))
      .where(serverId ? eq(mcpTools.serverId, serverId) : undefined)
      .all();
    const overrides = this.db.select().from(toolPolicyOverrides).all();
    return rows.map(({ tool, serverName }) => ({
      ...tool,
      serverName,
      roomOverrides: overrides
        .filter((item) => item.toolId === tool.id)
        .map(({ roomId, policy }) => ({ roomId, policy })),
    }));
  }

  async findTool(id: string) {
    return (await this.listTools()).find((tool) => tool.id === id) ?? null;
  }

  async insertTool(tool: McpToolRecord) {
    const { serverName: _serverName, roomOverrides: _overrides, ...row } = tool;
    this.db.insert(mcpTools).values(row).run();
  }

  async updateToolDefinition(
    id: string,
    definition: Parameters<McpRepository['updateToolDefinition']>[1],
  ) {
    this.db.update(mcpTools).set(definition).where(eq(mcpTools.id, id)).run();
  }

  async updateToolPolicy(id: string, update: Parameters<McpRepository['updateToolPolicy']>[1]) {
    if (Object.keys(update).length > 0) {
      this.db.update(mcpTools).set(update).where(eq(mcpTools.id, id)).run();
    }
  }

  async deleteTool(id: string) {
    this.db.delete(mcpTools).where(eq(mcpTools.id, id)).run();
  }

  async setRoomOverrides(toolId: string, overrides: { roomId: string; policy: ToolPolicy }[]) {
    this.db.transaction((tx) => {
      tx.delete(toolPolicyOverrides).where(eq(toolPolicyOverrides.toolId, toolId)).run();
      for (const override of overrides) {
        tx.insert(toolPolicyOverrides)
          .values({ toolId, ...override })
          .run();
      }
    });
  }

  async recordCall(call: NewToolCall) {
    this.db.insert(toolCalls).values(call).run();
  }

  async listCalls(filter: ToolCallFilter, limit: number, cursor?: string) {
    const conditions: (SQL | undefined)[] = [
      filter.serverName ? eq(toolCalls.serverName, filter.serverName) : undefined,
      filter.toolName ? eq(toolCalls.toolName, filter.toolName) : undefined,
      filter.roomId ? eq(toolCalls.roomId, filter.roomId) : undefined,
      filter.errorsOnly ? eq(toolCalls.isError, true) : undefined,
      cursorCondition(toolCalls.createdAt, toolCalls.id, cursor),
    ];
    const rows = this.db
      .select({ call: toolCalls, roomName: rooms.name })
      .from(toolCalls)
      .leftJoin(rooms, eq(rooms.id, toolCalls.roomId))
      .where(and(...conditions))
      .orderBy(...newestFirst(toolCalls.createdAt, toolCalls.id))
      .limit(limit + 1)
      .all();
    return toPage(
      rows,
      limit,
      ({ call, roomName }) => ({
        id: call.id,
        requestId: call.requestId,
        roomId: call.roomId,
        roomName,
        serverName: call.serverName,
        toolName: call.toolName,
        arguments: call.arguments,
        result: call.result,
        isError: call.isError,
        durationMs: call.durationMs,
        source: call.source,
        createdAt: call.createdAt,
      }),
      ({ call }) => [call.createdAt, call.id],
    );
  }
}
