import type { LlmTool, LlmToolCall } from '../LlmProvider.js';

/** Fallback for models without native tool calling: the catalogue goes in the prompt. */
export function structuredToolPrompt(tools: LlmTool[]): string {
  const catalogue = tools
    .map(
      (tool) =>
        `- ${tool.name} : ${tool.description}\n  paramètres : ${JSON.stringify(tool.parameters)}`,
    )
    .join('\n');
  return [
    'Tu disposes des outils suivants :',
    catalogue,
    'Pour appeler un outil, réponds uniquement avec un objet JSON :',
    '{"tool": "nom_outil", "arguments": {...}}',
    'Sinon, réponds normalement en texte, sans JSON.',
  ].join('\n');
}

/** True while the buffered output may still turn out to be a JSON tool call. */
export const mayBeStructuredCall = (text: string): boolean => /^\s*(`{1,3}(json)?\s*)?\{?\s*$|^\s*(```(json)?\s*)?\{/.test(text);

export function parseStructuredCall(text: string, tools: LlmTool[]): LlmToolCall | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]) as { tool?: unknown; arguments?: unknown };
    if (typeof value.tool !== 'string') return null;
    if (!tools.some((tool) => tool.name === value.tool)) return null;
    const args =
      typeof value.arguments === 'object' && value.arguments !== null ? value.arguments : {};
    return { name: value.tool, arguments: args as Record<string, unknown> };
  } catch {
    return null;
  }
}
