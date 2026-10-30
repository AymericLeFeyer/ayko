import type { Block } from '@ayko/contracts';

/**
 * Rich blocks travel in the standard MCP `structuredContent` field, under `blocks`.
 * Servers that do not know this convention simply produce text.
 */
export function blocksFromResult(raw: unknown): Block[] {
  const content = (raw as { structuredContent?: { blocks?: unknown } } | null)?.structuredContent;
  if (!Array.isArray(content?.blocks)) return [];
  return content.blocks.filter(
    (item): item is Block =>
      typeof item === 'object' && item !== null && typeof (item as Block).type === 'string',
  );
}
