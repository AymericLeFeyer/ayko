import { join } from 'node:path';
import { AgentService } from './application/agent/AgentService.js';
import { HomeContextService } from './application/agent/HomeContextService.js';
import { CacheService } from './application/cache/CacheService.js';
import { CameraService } from './application/cameras/CameraService.js';
import { AuthService } from './application/identity/AuthService.js';
import { OllamaService } from './application/llm/OllamaService.js';
import { McpRegistry } from './application/mcp/McpRegistry.js';
import { MemoryService } from './application/memory/MemoryService.js';
import { PersonaService } from './application/persona/PersonaService.js';
import { DeviceHub } from './application/rooms/DeviceHub.js';
import { RoomService } from './application/rooms/RoomService.js';
import { WidgetService } from './application/rooms/WidgetService.js';
import { EventBus } from './application/system/EventBus.js';
import { DbLogger, SettingsService } from './application/system/SettingsService.js';
import { SystemService } from './application/system/SystemService.js';
import { VoiceService } from './application/voice/VoiceService.js';
import type { CameraSource } from './domain/cameras/CameraProvider.js';
import type { LlmProviderFactory } from './domain/llm/LlmProvider.js';
import type { McpConnectionFactory } from './domain/mcp/McpConnection.js';
import {
  HomeAssistantCameras,
  homeAssistantSource,
} from './infrastructure/cameras/HomeAssistantCameras.js';
import { openDatabase } from './infrastructure/db/client.js';
import { DrizzleCacheRepository } from './infrastructure/db/repositories/DrizzleCacheRepository.js';
import { ReportService } from './application/conversation/ReportService.js';
import { DrizzleCameraRepository } from './infrastructure/db/repositories/DrizzleCameraRepository.js';
import { DrizzleConversationRepository } from './infrastructure/db/repositories/DrizzleConversationRepository.js';
import { DrizzleReportRepository } from './infrastructure/db/repositories/DrizzleReportRepository.js';
import { DrizzleIdentityRepository } from './infrastructure/db/repositories/DrizzleIdentityRepository.js';
import { DrizzleLlmRepository } from './infrastructure/db/repositories/DrizzleLlmRepository.js';
import { DrizzleMcpRepository } from './infrastructure/db/repositories/DrizzleMcpRepository.js';
import { DrizzleMemoryRepository } from './infrastructure/db/repositories/DrizzleMemoryRepository.js';
import { DrizzlePersonaRepository } from './infrastructure/db/repositories/DrizzlePersonaRepository.js';
import { DrizzleRoomRepository } from './infrastructure/db/repositories/DrizzleRoomRepository.js';
import { DrizzleSystemRepository } from './infrastructure/db/repositories/DrizzleSystemRepository.js';
import { DrizzleVoiceRepository } from './infrastructure/db/repositories/DrizzleVoiceRepository.js';
import { seedDefaults, seedDemo } from './infrastructure/db/seed.js';
import { SdkMcpConnection } from './infrastructure/mcp/SdkMcpConnection.js';
import { FAKE_HA_TOKEN, FakeHomeAssistant } from './infrastructure/mock/fakeHomeAssistant.js';
import { FakeOllama } from './infrastructure/mock/fakeOllama.js';
import { fetchHostMetrics } from './infrastructure/ollama/fetchHostMetrics.js';
import { OllamaProvider } from './infrastructure/ollama/OllamaProvider.js';
import { AesVault } from './infrastructure/system/AesVault.js';
import { createVoiceEngine } from './infrastructure/voice/FakeVoiceEngine.js';
import type { Env } from './shared/env.js';

const VERSION = '0.1.0';
const HEALTH_INTERVAL_MS = 30_000;
const PING_INTERVAL_MS = 15_000;
const HOST_METRICS_INTERVAL_MS = 5000;
const RETENTION_INTERVAL_MS = 3_600_000;

export interface ContainerOverrides {
  databaseFile?: string;
  createLlmProvider?: LlmProviderFactory;
  createMcpConnection?: McpConnectionFactory;
}

export async function createContainer(env: Env, overrides: ContainerOverrides = {}) {
  const handle = openDatabase(overrides.databaseFile ?? join(env.dataDir, 'ayko.sqlite'));
  const { db } = handle;

  const bus = new EventBus();
  const systemRepository = new DrizzleSystemRepository(db);
  const logger = new DbLogger(systemRepository, bus, env.logLevel);
  const vault = new AesVault(db, env.masterKey);
  const settings = new SettingsService(systemRepository);

  const auth = new AuthService(new DrizzleIdentityRepository(db));
  const ollama = new OllamaService(
    new DrizzleLlmRepository(db),
    vault,
    overrides.createLlmProvider ?? ((config) => new OllamaProvider(config)),
    bus,
    logger,
    fetchHostMetrics,
  );
  const registry = new McpRegistry(
    new DrizzleMcpRepository(db),
    vault,
    overrides.createMcpConnection ?? ((config) => new SdkMcpConnection(config)),
    bus,
    logger,
  );
  const hub = new DeviceHub(bus);
  const roomRepository = new DrizzleRoomRepository(db);
  const rooms = new RoomService(roomRepository, vault, hub, bus, logger);
  const widgets = new WidgetService(rooms, registry, settings, logger);
  const personaRepository = new DrizzlePersonaRepository(db);
  const personas = new PersonaService(personaRepository);
  const cache = new CacheService(
    new DrizzleCacheRepository(db),
    systemRepository,
    ollama,
    bus,
    logger,
    async (roomId) => (await roomRepository.findRoom(roomId))?.name ?? null,
  );
  const memory = new MemoryService(
    new DrizzleMemoryRepository(db),
    ollama,
    rooms,
    settings,
    logger,
  );
  const homeContext = new HomeContextService(registry, logger);
  const fakeHomeAssistant = env.mock ? new FakeHomeAssistant() : null;
  const fakeCameraSource: CameraSource | null = fakeHomeAssistant && {
    name: 'Home Assistant simulé',
    url: `http://127.0.0.1:${await fakeHomeAssistant.listen()}`,
    headers: { authorization: FAKE_HA_TOKEN },
  };
  const cameras = new CameraService(
    new DrizzleCameraRepository(db),
    new HomeAssistantCameras(),
    async () => fakeCameraSource ?? homeAssistantSource(await registry.httpEndpoints()),
    logger,
  );
  const agent = new AgentService(
    new DrizzleConversationRepository(db),
    ollama,
    registry,
    personas,
    rooms,
    cache,
    memory,
    homeContext,
    cameras,
    settings,
    bus,
    logger,
  );
  const voiceRepository = new DrizzleVoiceRepository(db);
  const voice = new VoiceService(voiceRepository, createVoiceEngine);
  const system = new SystemService(
    systemRepository,
    settings,
    ollama,
    registry,
    rooms,
    hub,
    cache,
    logger,
    handle.ping,
    () => agent.queueDepth,
    VERSION,
    env.mock,
  );
  const conversations = new DrizzleConversationRepository(db);
  const reports = new ReportService(new DrizzleReportRepository(db), conversations, rooms);

  registry.bindInvalidation({
    tool: (toolId) => cache.invalidateTool(toolId),
    server: (serverId) => cache.invalidateServer(serverId),
  });
  rooms.bindInvalidation((roomId) => cache.invalidateRoom(roomId));
  personas.bind({
    context: async (roomId, user) => {
      const [room, { ownerName }] = await Promise.all([rooms.describeRoom(roomId), settings.get()]);
      return {
        now: new Date(),
        roomName: room.name,
        userName: user ?? ownerName,
        devices: room.devices,
      };
    },
    changed: () => void rooms.broadcastConfigs(),
  });

  await seedDefaults({ personaRepository, voiceRepository });

  let fakeOllama: FakeOllama | null = null;
  if (env.mock) {
    fakeOllama = new FakeOllama();
    const port = await fakeOllama.listen(env.fakeOllamaPort);
    await seedDemo({ rooms, ollama, registry }, `http://127.0.0.1:${port}`);
    await cameras.sync();
  }
  const { logLevel } = await settings.get();
  logger.threshold = logLevel;

  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, work: () => Promise<unknown>) => {
    const timer = setInterval(() => {
      work().catch((error: unknown) => logger.log('error', 'system', String(error)));
    }, ms);
    timer.unref();
    timers.push(timer);
  };

  return {
    env,
    bus,
    logger,
    auth,
    ollama,
    registry,
    hub,
    rooms,
    widgets,
    personas,
    cache,
    memory,
    cameras,
    fakeHomeAssistant,
    agent,
    voice,
    system,
    conversations,
    reports,
    async start() {
      await cache.refreshIndex();
      await registry.startAll();
      await ollama.checkHealth();
      every(HEALTH_INTERVAL_MS, () => ollama.checkHealth());
      every(PING_INTERVAL_MS, () => registry.pingAll());
      every(HOST_METRICS_INTERVAL_MS, () => ollama.pollHostMetrics());
      every(RETENTION_INTERVAL_MS, () => system.runRetention());
      await system.runRetention();
      logger.log('info', 'system', `Ayko Core ${VERSION} démarré${env.mock ? ' (mode mock)' : ''}`);
    },
    async stop() {
      for (const timer of timers) clearInterval(timer);
      await registry.shutdown();
      await fakeOllama?.close();
      await fakeHomeAssistant?.close();
      handle.close();
    },
  };
}

export type Container = Awaited<ReturnType<typeof createContainer>>;
