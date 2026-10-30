import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const memorySource = z.enum(['user', 'learned', 'admin']);

export const memory = z.object({
  id: uuid,
  content: z.string(),
  /** Null means valid in the whole house. */
  roomId: uuid.nullable(),
  roomName: z.string().nullable(),
  source: memorySource,
  /** Sent with every request, whatever the sentence. */
  pinned: z.boolean(),
  useCount: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
  lastUsedAt: isoDate.nullable(),
});
export type Memory = z.infer<typeof memory>;

export const memoryInput = z.object({
  content: z.string().trim().min(1).max(500),
  roomId: uuid.nullable().default(null),
  pinned: z.boolean().default(false),
});
export type MemoryInput = z.input<typeof memoryInput>;
