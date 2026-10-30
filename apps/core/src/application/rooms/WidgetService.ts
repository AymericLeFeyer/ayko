import type { Block, HomeWidget, WidgetData } from '@ayko/contracts';
import { blocksFromResult } from '../../domain/mcp/services/toolBlocks.js';
import type { Logger } from '../../domain/system/Logger.js';
import type { McpRegistry } from '../mcp/McpRegistry.js';
import type { SettingsService } from '../system/SettingsService.js';
import type { RoomService } from './RoomService.js';

const CACHE_MS = 60_000;

/** Feeds the home screen from read-only tools chosen per room in the backoffice. */
export class WidgetService {
  private readonly cache = new Map<string, { at: number; blocks: Block[] }>();

  constructor(
    private readonly rooms: RoomService,
    private readonly registry: McpRegistry,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
  ) {}

  async forRoom(roomId: string | null): Promise<WidgetData> {
    if (!roomId) return { widgets: [] };
    const { config } = await this.rooms.getRoom(roomId);
    const entries = Object.entries(config.widgetTools) as [HomeWidget, string][];
    const results = await Promise.all(
      entries
        .filter(([widget]) => config.widgets.includes(widget))
        .map(async ([widget, toolId]) => ({
          widget,
          blocks: await this.load(toolId, roomId),
        })),
    );
    return { widgets: results.filter((item) => item.blocks.length > 0) };
  }

  private async load(toolId: string, roomId: string): Promise<Block[]> {
    const key = `${toolId}|${roomId}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.blocks;
    const tool = await this.registry.getTool(toolId);
    // Widgets run unattended, so they can never reach a tool that changes something.
    if (
      !tool?.readOnly ||
      !this.registry.isConnected(tool.serverId) ||
      this.registry.policyFor(tool, roomId) !== 'auto'
    ) {
      return [];
    }
    const { agent } = await this.settings.get();
    const result = await this.registry.call(
      tool,
      {},
      { requestId: null, roomId, source: 'widget', timeoutMs: agent.toolTimeoutMs },
    );
    if (result.isError) {
      this.logger.log('warn', 'rooms', `Widget ${tool.name} : ${result.text}`, { roomId });
      return cached?.blocks ?? [];
    }
    const structured = blocksFromResult(result.raw);
    const blocks = structured.length > 0 ? structured : [{ type: 'text', text: result.text }];
    this.cache.set(key, { at: Date.now(), blocks });
    return blocks;
  }
}
