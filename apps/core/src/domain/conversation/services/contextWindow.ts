import type { LlmMessage } from '../../llm/LlmProvider.js';

/** French prose averages about 3.5 characters per token; exactness is not needed here. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.5);

const RESPONSE_RESERVE_RATIO = 0.25;
/** Without the last exchanges, "et à Bailleul ?" means nothing, however large the tools are. */
const MIN_HISTORY_RATIO = 0.2;

function latestWithin(history: LlmMessage[], budget: number) {
  const kept: LlmMessage[] = [];
  let used = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    used += estimateTokens(message.content + JSON.stringify(message.toolCalls ?? ''));
    if (used > budget) break;
    kept.unshift(message);
  }
  return kept;
}

/**
 * Keeps the most recent messages that fit the window. Truncation rather than summary:
 * on a CPU model, a summary would add a whole extra inference to every long conversation.
 */
export function fitHistory(
  history: LlmMessage[],
  systemPrompt: string,
  userText: string,
  numCtx: number,
  /** Tool schemas travel with every request and grow with each MCP server. */
  tools: unknown[] = [],
): LlmMessage[] {
  const budget = Math.max(
    numCtx * MIN_HISTORY_RATIO,
    numCtx * (1 - RESPONSE_RESERVE_RATIO) -
      estimateTokens(systemPrompt) -
      estimateTokens(userText) -
      estimateTokens(tools.length > 0 ? JSON.stringify(tools) : ''),
  );
  const kept = latestWithin(history, budget);
  if (kept.some((message) => message.role === 'user')) return kept;
  // Tool details filled the budget: the words of the conversation matter more.
  return latestWithin(
    history.filter((message) => message.role !== 'tool' && !message.toolCalls),
    budget,
  );
}
