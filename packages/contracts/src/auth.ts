import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const credentials = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
});
export type Credentials = z.infer<typeof credentials>;

export const setupStatus = z.object({ needsSetup: z.boolean(), mock: z.boolean() });
export type SetupStatus = z.infer<typeof setupStatus>;

export const user = z.object({ id: uuid, username: z.string(), createdAt: isoDate });
export type User = z.infer<typeof user>;

export const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});
export type ChangePassword = z.infer<typeof changePassword>;

export const apiKey = z.object({
  id: uuid,
  name: z.string(),
  prefix: z.string(),
  createdAt: isoDate,
  lastUsedAt: isoDate.nullable(),
});
export type ApiKey = z.infer<typeof apiKey>;

export const apiKeyCreate = z.object({ name: z.string().min(1).max(64) });
export const apiKeyCreated = apiKey.extend({ token: z.string() });
export type ApiKeyCreated = z.infer<typeof apiKeyCreated>;
