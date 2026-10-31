import type { Block } from '@ayko/contracts';

/**
 * Rich blocks travel in the standard MCP `structuredContent` field, under `blocks`.
 * Servers that do not know this convention simply produce text.
 */
const ACTION_STATES: { pattern: RegExp; state: string; undo: { label: string; verb: string } }[] = [
  { pattern: /turn_?on/i, state: 'Allumé', undo: { label: 'Éteindre', verb: 'Éteins' } },
  { pattern: /turn_?off/i, state: 'Éteint', undo: { label: 'Allumer', verb: 'Allume' } },
];

/**
 * Home Assistant answers actions in plain text: the tablet still gets a card to show.
 * With a known target, tapping the card sends the opposite order.
 */
export function actionBlock(toolName: string, label: string, args: Record<string, unknown>): Block {
  const target = [args.name, args.area, args.room].find((value) => typeof value === 'string') as
    string | undefined;
  const known = ACTION_STATES.find(({ pattern }) => pattern.test(toolName));
  return {
    type: 'entity',
    name: target ?? label,
    state: known?.state ?? 'Fait',
    ...(known &&
      target && { action: { label: known.undo.label, text: `${known.undo.verb} ${target}` } }),
  };
}

export function blocksFromResult(raw: unknown): Block[] {
  const content = (raw as { structuredContent?: { blocks?: unknown } } | null)?.structuredContent;
  if (!Array.isArray(content?.blocks)) return [];
  return content.blocks.filter(
    (item): item is Block =>
      typeof item === 'object' && item !== null && typeof (item as Block).type === 'string',
  );
}
