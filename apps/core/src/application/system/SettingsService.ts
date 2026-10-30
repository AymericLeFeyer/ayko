import { randomUUID } from 'node:crypto';
import type { LogLevel, SystemSettings } from '@ayko/contracts';
import type { SystemRepository } from '../../domain/system/repositories/SystemRepository.js';
import type { LogContext, Logger } from '../../domain/system/Logger.js';
import type { EventBus } from './EventBus.js';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const DEFAULT_SETTINGS: SystemSettings = {
  agent: {
    maxIterations: 6,
    toolTimeoutMs: 30_000,
    totalTimeoutMs: 300_000,
    maxConcurrentRequests: 1,
    confirmTimeoutSeconds: 60,
    routingEnabled: false,
    historyMessages: 16,
    toolResultMaxChars: 4000,
    sessionMinutes: 30,
    homeContextMaxChars: 4000,
    memoryEnabled: true,
    memoryMaxItems: 8,
  },
  logRetentionDays: 14,
  traceRetentionDays: 30,
  logLevel: 'info',
  ownerName: 'Admin',
};

export class SettingsService {
  private cached: SystemSettings | null = null;

  constructor(private readonly repository: SystemRepository) {}

  async get(): Promise<SystemSettings> {
    if (!this.cached) {
      const stored = await this.repository.getSetting<Partial<SystemSettings>>('system');
      this.cached = {
        ...DEFAULT_SETTINGS,
        ...stored,
        agent: { ...DEFAULT_SETTINGS.agent, ...stored?.agent },
      };
    }
    return this.cached;
  }

  async update(settings: SystemSettings) {
    await this.repository.setSetting('system', settings);
    this.cached = settings;
  }
}

export class DbLogger implements Logger {
  /** Runtime threshold, updated when the admin changes the log level. */
  threshold: LogLevel;

  constructor(
    private readonly repository: SystemRepository,
    private readonly bus: EventBus,
    threshold: LogLevel,
  ) {
    this.threshold = threshold;
  }

  log(level: LogLevel, component: string, message: string, context: LogContext = {}) {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(this.threshold)) return;
    const entry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      level,
      component,
      message,
      roomId: context.roomId ?? null,
      requestId: context.requestId ?? null,
      data: context.data ?? null,
    };
    console[level === 'debug' ? 'log' : level](`[${level}] ${component}: ${message}`);
    try {
      this.repository.appendLog(entry);
    } catch (error) {
      // Logging must never take a request down, e.g. while the database is closing.
      console.error('Unable to persist log entry', error);
    }
    this.bus.publish({ topic: 'log', entry });
  }
}
