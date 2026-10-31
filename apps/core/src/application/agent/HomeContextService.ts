import { parseLiveContext, renderHomeContext } from '../../domain/home/services/homeContext.js';
import { isContextTool } from '../../domain/mcp/services/toolPolicy.js';
import type { McpToolRecord } from '../../domain/mcp/repositories/McpRepository.js';
import type { Logger } from '../../domain/system/Logger.js';
import { errorMessage } from '../../shared/errors.js';
import type { McpRegistry } from '../mcp/McpRegistry.js';

const CACHE_MS = 20_000;
const TIMEOUT_MS = 5000;

/**
 * Tells the model what exists in the house, so it stops guessing device names. Any
 * read-only tool flagged as a context source works; Home Assistant's is found by name.
 */
export class HomeContextService {
  private cached: { at: number; texts: string[] } | null = null;

  constructor(
    private readonly registry: McpRegistry,
    private readonly logger: Logger,
  ) {}

  /** States changed: the next request must not read the old list. */
  invalidate() {
    this.cached = null;
  }

  private async load(tools: McpToolRecord[], roomId: string | null, signal?: AbortSignal) {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.texts;
    const results = await Promise.all(
      tools.map(async (tool) => {
        const result = await this.registry.call(
          tool,
          {},
          { requestId: null, roomId, source: 'widget', timeoutMs: TIMEOUT_MS, signal },
        );
        if (result.isError) throw new Error(result.text);
        return result.text;
      }),
    );
    this.cached = { at: Date.now(), texts: results };
    return results;
  }

  /**
   * Devices a stored call may name, and the servers they belong to: another server's
   * `name` argument (a task, a contact) has nothing to do with this list. Null when unknown.
   */
  async targets(tools: McpToolRecord[], roomId: string | null, signal?: AbortSignal) {
    const sources = tools.filter((tool) => tool.readOnly && isContextTool(tool));
    if (sources.length === 0) return null;
    try {
      const devices = (await this.load(sources, roomId, signal)).flatMap(parseLiveContext);
      if (devices.length === 0) return null;
      return { serverIds: new Set(sources.map((tool) => tool.serverId)), devices };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.log('warn', 'agent', `Contexte maison indisponible : ${errorMessage(error)}`);
      return null;
    }
  }

  /** Never fails a request: without the list, the model is merely back to guessing. */
  async forPrompt(
    tools: McpToolRecord[],
    roomId: string | null,
    roomName: string | null,
    maxChars: number,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const sources = tools.filter((tool) => tool.readOnly && isContextTool(tool));
    if (sources.length === 0) return null;
    try {
      const texts = await this.load(sources, roomId, signal);
      const devices = texts.flatMap(parseLiveContext);
      if (devices.length > 0) return renderHomeContext(devices, roomName, maxChars);
      return `État de la maison :\n${texts.join('\n').slice(0, maxChars)}`;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.log('warn', 'agent', `Contexte maison indisponible : ${errorMessage(error)}`);
      return null;
    }
  }
}
