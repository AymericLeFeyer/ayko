import { randomUUID } from 'node:crypto';
import type {
  ComponentHealth,
  ConfigBundle,
  ConfigImportResult,
  Metrics,
  SetupWizardState,
  SystemSettings,
} from '@ayko/contracts';
import type { Logger } from '../../domain/system/Logger.js';
import type { SystemRepository } from '../../domain/system/repositories/SystemRepository.js';
import type { CacheService } from '../cache/CacheService.js';
import type { OllamaService } from '../llm/OllamaService.js';
import type { McpRegistry } from '../mcp/McpRegistry.js';
import type { DeviceHub } from '../rooms/DeviceHub.js';
import type { RoomService } from '../rooms/RoomService.js';
import { DbLogger, type SettingsService } from './SettingsService.js';

const DAY_MS = 86_400_000;
const WIZARD_KEY = 'wizard_completed';

export class SystemService {
  private readonly bootedAt = Date.now();

  constructor(
    private readonly repository: SystemRepository,
    private readonly settings: SettingsService,
    private readonly ollama: OllamaService,
    private readonly registry: McpRegistry,
    private readonly rooms: RoomService,
    private readonly hub: DeviceHub,
    private readonly cache: CacheService,
    private readonly logger: Logger,
    private readonly pingDatabase: () => number,
    private readonly queueDepth: () => number,
    private readonly version: string,
    private readonly mock: boolean,
  ) {}

  private async components(): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];
    try {
      const latencyMs = this.pingDatabase();
      components.push({
        id: 'database',
        kind: 'database',
        name: 'Base de données',
        status: 'up',
        detail: 'SQLite',
        latencyMs,
      });
    } catch (error) {
      components.push({
        id: 'database',
        kind: 'database',
        name: 'Base de données',
        status: 'down',
        detail: String(error),
        latencyMs: null,
      });
    }
    for (const endpoint of await this.ollama.listEndpoints()) {
      const status = !endpoint.enabled
        ? 'disabled'
        : endpoint.lastStatus === 'up'
          ? 'up'
          : endpoint.lastStatus === 'down'
            ? 'down'
            : 'degraded';
      components.push({
        id: endpoint.id,
        kind: 'ollama',
        name: endpoint.name,
        status,
        detail: endpoint.version ? `Ollama ${endpoint.version}` : endpoint.url,
        latencyMs: endpoint.lastLatencyMs,
      });
    }
    for (const server of await this.registry.listServers()) {
      const status =
        server.status === 'connected'
          ? 'up'
          : server.status === 'connecting'
            ? 'degraded'
            : server.status === 'disabled'
              ? 'disabled'
              : 'down';
      components.push({
        id: server.id,
        kind: 'mcp',
        name: server.name,
        status,
        detail: server.lastError ?? `${server.toolCount} outils`,
        latencyMs: server.latencyMs,
      });
    }
    const devices = (await this.rooms.listDevices()).filter((device) => !device.revoked);
    components.push({
      id: 'rooms',
      kind: 'rooms',
      name: 'Tablettes',
      status: devices.length === 0 || this.hub.onlineCount > 0 ? 'up' : 'degraded',
      detail: `${this.hub.onlineCount} / ${devices.length} en ligne`,
      latencyMs: null,
    });
    return components;
  }

  async health() {
    const components = await this.components();
    const degraded = components.some((item) => item.kind === 'database' && item.status === 'down');
    return {
      status: degraded ? ('degraded' as const) : ('ok' as const),
      version: this.version,
      uptimeSeconds: Math.round((Date.now() - this.bootedAt) / 1000),
      mock: this.mock,
    };
  }

  async metrics(): Promise<Metrics> {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const [components, stats, recentRequests, errors] = await Promise.all([
      this.components(),
      this.repository.requestStats(since),
      this.repository.recentRequests(10),
      this.repository.recentErrors(10),
    ]);
    const lookups = stats.hits + stats.misses;
    return {
      components,
      requests24h: stats.total,
      errors24h: stats.errors,
      avgTokensPerSecond: stats.avgTokensPerSecond,
      cacheHitRate: lookups > 0 ? stats.hits / lookups : null,
      queueDepth: this.queueDepth(),
      recentRequests,
      recentErrors: errors.map(({ id, component, message, ts }) => ({
        id,
        component,
        message,
        ts,
      })),
    };
  }

  async audit(actor: string, action: string, target: string | null, details: unknown = null) {
    await this.repository.appendAudit({
      id: randomUUID(),
      ts: new Date().toISOString(),
      actor,
      action,
      target,
      details,
    });
  }

  listLogs(...args: Parameters<SystemRepository['listLogs']>) {
    return this.repository.listLogs(...args);
  }

  listAudit(limit: number, cursor?: string) {
    return this.repository.listAudit(limit, cursor);
  }

  getSettings() {
    return this.settings.get();
  }

  async updateSettings(settings: SystemSettings) {
    await this.settings.update(settings);
    if (this.logger instanceof DbLogger) this.logger.threshold = settings.logLevel;
    return settings;
  }

  async exportConfig(includeSecrets: boolean): Promise<ConfigBundle> {
    return {
      format: 'ayko-config',
      version: 1,
      exportedAt: new Date().toISOString(),
      encryptedSecrets: includeSecrets,
      data: {
        settings: await this.settings.get(),
        cacheSettings: await this.cache.settings(),
        tables: await this.repository.exportTables(includeSecrets),
      },
    };
  }

  async importConfig(bundle: ConfigBundle): Promise<ConfigImportResult> {
    const restoredTables = await this.repository.importTables(bundle.data.tables);
    await this.updateSettings(bundle.data.settings);
    await this.cache.updateSettings(bundle.data.cacheSettings);
    return { restoredTables, skippedSecrets: !bundle.encryptedSecrets };
  }

  async wizardState(): Promise<SetupWizardState> {
    const [endpoints, roles, servers, rooms, completed] = await Promise.all([
      this.ollama.listEndpoints(),
      this.ollama.listRoles(),
      this.registry.listServers(),
      this.rooms.listRooms(),
      this.repository.getSetting<boolean>(WIZARD_KEY),
    ]);
    return {
      hasEndpoint: endpoints.length > 0,
      hasConversationModel: roles.some((role) => role.role === 'conversation' && role.model),
      hasMcpServer: servers.length > 0,
      hasRoom: rooms.length > 0,
      completed: completed === true,
    };
  }

  async completeWizard() {
    await this.repository.setSetting(WIZARD_KEY, true);
    return this.wizardState();
  }

  async runRetention() {
    const { logRetentionDays, traceRetentionDays } = await this.settings.get();
    const now = Date.now();
    await this.repository.purge({
      logs: new Date(now - logRetentionDays * DAY_MS).toISOString(),
      traces: new Date(now - traceRetentionDays * DAY_MS).toISOString(),
    });
    await this.cache.purgeHistory();
  }
}
