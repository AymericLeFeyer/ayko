import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const homeWidget = z.enum(['clock', 'calendar', 'weather', 'home_state', 'suggestions']);
export type HomeWidget = z.infer<typeof homeWidget>;

export const roomConfig = z.object({
  personaId: uuid.nullable().default(null),
  theme: z.enum(['dark', 'midnight', 'light']).default('dark'),
  widgets: z.array(homeWidget).default(['clock', 'calendar', 'weather']),
  suggestions: z.array(z.string()).default([]),
  nightBrightness: z.number().int().min(0).max(100).default(30),
  idleTimeoutSeconds: z.number().int().min(5).default(60),
});
export type RoomConfig = z.infer<typeof roomConfig>;

export const room = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  icon: z.string(),
  config: roomConfig,
  deviceCount: z.number().int(),
  onlineCount: z.number().int(),
  createdAt: isoDate,
});
export type Room = z.infer<typeof room>;

export const roomInput = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  icon: z.string().min(1).max(32).default('home'),
  config: roomConfig.partial().optional(),
});
export type RoomInput = z.input<typeof roomInput>;

export const device = z.object({
  id: uuid,
  name: z.string(),
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  online: z.boolean(),
  lastSeenAt: isoDate.nullable(),
  uiVersion: z.string().nullable(),
  revoked: z.boolean(),
  createdAt: isoDate,
});
export type Device = z.infer<typeof device>;

export const deviceUpdate = z.object({
  name: z.string().min(1).max(64).optional(),
  roomId: uuid.nullable().optional(),
  revoked: z.boolean().optional(),
});
export type DeviceUpdate = z.infer<typeof deviceUpdate>;

export const deviceCommand = z.object({ command: z.enum(['reload', 'clear_cache', 'go_home']) });
export type DeviceCommand = z.infer<typeof deviceCommand>;

export const pairingRequestBody = z.object({ deviceName: z.string().min(1).max(64).optional() });

/** Sent back to the tablet, which shows `code` and polls with `pairingId`. */
export const pairingCreated = z.object({
  pairingId: uuid,
  code: z.string().length(6),
  expiresAt: isoDate,
});
export type PairingCreated = z.infer<typeof pairingCreated>;

export const pairingPending = z.object({
  pairingId: uuid,
  code: z.string(),
  deviceName: z.string().nullable(),
  expiresAt: isoDate,
});
export type PairingPending = z.infer<typeof pairingPending>;

export const pairingConfirm = z.object({
  code: z.string().regex(/^\d{6}$/),
  roomId: uuid,
  deviceName: z.string().min(1).max(64).optional(),
});
export type PairingConfirm = z.infer<typeof pairingConfirm>;

export const pairingPoll = z.object({
  status: z.enum(['pending', 'confirmed', 'expired']),
  /** Handed out exactly once, on the first poll after confirmation. */
  deviceToken: z.string().nullable(),
  deviceId: uuid.nullable(),
});
export type PairingPoll = z.infer<typeof pairingPoll>;
