import type { Message } from '@ayko/contracts';
import type { LlmMessage } from '../../llm/LlmProvider.js';

export interface PastToolCall {
  requestId: string;
  toolName: string;
  arguments: unknown;
  result: string | null;
  isError: boolean;
}

const RECENT_REQUESTS = 3;
const RESULT_MAX_CHARS = 1500;
const CUT_NOTICE = "\n[Résultat coupé : rappelle l'outil pour lire la suite, n'invente rien.]";

/** A cut must show: a model that believes it has everything fills the gap by inventing. */
export const cutResult = (result: string, maxChars: number) =>
  result.length > maxChars ? result.slice(0, maxChars) + CUT_NOTICE : result;

/**
 * Rebuilds history with what the tools answered. Without it the model loses each turn
 * what it just found out, such as the real name of a device. Only the last requests
 * keep this detail, since older results cost context for little use.
 */
export function withToolHistory(
  messages: Pick<Message, 'role' | 'content' | 'requestId'>[],
  calls: PastToolCall[],
  exposedName: (toolName: string) => string,
): LlmMessage[] {
  const answered = messages.filter((message) => message.role === 'assistant');
  const recent = new Set(answered.slice(-RECENT_REQUESTS).map((message) => message.requestId));
  const history: LlmMessage[] = [];
  for (const { role, content, requestId } of messages) {
    if (role !== 'user' && role !== 'assistant') continue;
    const own = role === 'assistant' && recent.has(requestId) ? calls : [];
    const replayed = own.filter((call) => call.requestId === requestId);
    if (replayed.length > 0) {
      history.push({
        role: 'assistant',
        content: '',
        toolCalls: replayed.map((call) => ({
          name: exposedName(call.toolName),
          arguments: (call.arguments ?? {}) as Record<string, unknown>,
        })),
      });
      for (const call of replayed) {
        history.push({
          role: 'tool',
          toolName: exposedName(call.toolName),
          content: cutResult(call.result ?? '', RESULT_MAX_CHARS),
        });
      }
    }
    history.push({ role, content });
  }
  return history;
}
