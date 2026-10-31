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

const OPPOSITE: Record<string, string> = { on: 'off', off: 'on', On: 'Off', Off: 'On' };

/** `HassTurnOn` → `HassTurnOff`, `light_turn_off` → `light_turn_on`; null for anything else. */
export function oppositeToolName(toolName: string) {
  const swapped = toolName.replace(
    /(turn_?)(on|off)$/i,
    (_match, prefix: string, state: string) => `${prefix}${OPPOSITE[state] ?? state}`,
  );
  return swapped === toolName ? null : swapped;
}

/** Lets a tap on a card run the opposite tool itself, with the arguments of this call. */
export function withDirectCall(blocks: Block[], toolId: string, args: Record<string, unknown>) {
  return blocks.map((block) => {
    const action = block.action as { label: string; text: string } | undefined;
    if (block.type !== 'entity' || !action) return block;
    return { ...block, action: { ...action, call: { toolId, arguments: args } } };
  });
}

export function blocksFromResult(raw: unknown): Block[] {
  const content = (raw as { structuredContent?: { blocks?: unknown } } | null)?.structuredContent;
  if (!Array.isArray(content?.blocks)) return [];
  return content.blocks.filter(
    (item): item is Block =>
      typeof item === 'object' && item !== null && typeof (item as Block).type === 'string',
  );
}
