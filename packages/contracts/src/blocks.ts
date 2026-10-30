import { z } from 'zod';
import { block } from './chat.js';
import { isoDate } from './common.js';
import { homeWidget } from './rooms.js';

/** A rendered entity; `action.text` is sent as a user message when tapped. */
export const entityBlock = z.object({
  type: z.literal('entity'),
  name: z.string(),
  state: z.string(),
  unit: z.string().optional(),
  action: z.object({ label: z.string(), text: z.string() }).optional(),
});

/** Blocks the Display knows how to draw. Anything else falls back on raw text. */
export const knownBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  entityBlock,
  z.object({
    type: z.literal('entity_list'),
    title: z.string().optional(),
    items: z.array(entityBlock.omit({ type: true })),
  }),
  z.object({
    type: z.literal('calendar_events'),
    events: z.array(
      z.object({
        title: z.string(),
        start: z.string(),
        end: z.string().optional(),
        location: z.string().optional(),
        color: z.string().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal('weather'),
    location: z.string().optional(),
    temperature: z.number(),
    condition: z.string(),
    forecast: z
      .array(z.object({ label: z.string(), temperature: z.number(), condition: z.string() }))
      .optional(),
  }),
  z.object({ type: z.literal('list'), title: z.string().optional(), items: z.array(z.string()) }),
  z.object({
    type: z.literal('table'),
    title: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({ type: z.literal('image'), url: z.string(), alt: z.string().optional() }),
  z.object({ type: z.literal('confirm'), label: z.string() }),
  z.object({ type: z.literal('progress'), label: z.string(), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal('timer'), label: z.string(), endsAt: isoDate }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    action: z.object({ label: z.string(), text: z.string() }).optional(),
  }),
]);
export type KnownBlock = z.infer<typeof knownBlock>;

export const widgetData = z.object({
  widgets: z.array(z.object({ widget: homeWidget, blocks: z.array(block) })),
});
export type WidgetData = z.infer<typeof widgetData>;
