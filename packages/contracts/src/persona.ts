import { z } from 'zod';
import { isoDate, uuid } from './common.js';

export const personaBody = z.object({
  name: z.string().min(1).max(64),
  systemPrompt: z.string().min(1),
  language: z.string().min(2).max(16).default('fr'),
  responseLength: z.enum(['short', 'normal', 'detailed']).default('short'),
  address: z.enum(['tu', 'vous']).default('tu'),
});
export type PersonaBody = z.input<typeof personaBody>;
export type PersonaFields = z.output<typeof personaBody>;

export const persona = z.object({
  ...personaBody.shape,
  id: uuid,
  isDefault: z.boolean(),
  version: z.number().int(),
  updatedAt: isoDate,
});
export type Persona = z.infer<typeof persona>;

export const personaVersion = z.object({
  id: uuid,
  personaId: uuid,
  version: z.number().int(),
  snapshot: personaBody,
  createdAt: isoDate,
});
export type PersonaVersion = z.infer<typeof personaVersion>;

export const personaPreviewRequest = z.object({
  roomId: uuid.nullable().optional(),
  user: z.string().optional(),
  /** Unsaved editor content, so the preview reflects what is being typed. */
  draft: personaBody.partial().optional(),
});
export type PersonaPreviewRequest = z.infer<typeof personaPreviewRequest>;

export const personaPreview = z.object({
  prompt: z.string(),
  variables: z.record(z.string(), z.string()),
  unknownVariables: z.array(z.string()),
});
export type PersonaPreview = z.infer<typeof personaPreview>;
