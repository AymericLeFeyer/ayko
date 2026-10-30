import { z } from 'zod';

export const uuid = z.uuid();
export const isoDate = z.iso.datetime();

/** Normalised error body returned by every REST route. */
export const apiError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiError>;

export const pageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type Page<T> = { items: T[]; nextCursor: string | null };

/** Secret values are write-only: the API only ever reveals which keys are set. */
export const secretMap = z.record(z.string(), z.string());
export type SecretMap = z.infer<typeof secretMap>;
