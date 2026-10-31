import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const camera = z.object({
  id: uuid,
  /** Home Assistant entity, such as `camera.porte`. */
  entityId: z.string(),
  name: z.string(),
  /** Other words the family uses for it; each one is matched as a whole phrase. */
  aliases: z.array(z.string()),
  /** Opens full screen when asked to be shown. Looking at it never does. */
  fullscreenByDefault: z.boolean(),
  enabled: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Camera = z.infer<typeof camera>;

export const cameraUpdate = z
  .object({
    name: z.string().trim().min(1).max(80),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20),
    fullscreenByDefault: z.boolean(),
    enabled: z.boolean(),
  })
  .partial();
export type CameraUpdate = z.infer<typeof cameraUpdate>;

/** Where cameras are read from: the Home Assistant found among the MCP servers. */
export const cameraSource = z.object({
  name: z.string().nullable(),
  url: z.string().nullable(),
  /** The token was refused: nothing reaches Home Assistant until the next sync. */
  refused: z.boolean(),
});
export type CameraSourceStatus = z.infer<typeof cameraSource>;

/** Short-lived and single-use: an `<img>` cannot send the tablet's bearer token. */
export const cameraTicket = z.object({ url: z.string() });
export type CameraTicket = z.infer<typeof cameraTicket>;
