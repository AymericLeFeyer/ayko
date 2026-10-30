import type { LogLevel } from '@ayko/contracts';

export interface LogContext {
  roomId?: string | null;
  requestId?: string | null;
  data?: unknown;
}

export interface Logger {
  log(level: LogLevel, component: string, message: string, context?: LogContext): void;
}
