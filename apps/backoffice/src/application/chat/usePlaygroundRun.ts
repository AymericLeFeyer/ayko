import { useCallback, useRef, useState } from 'react';
import type { AgentEvent, AnswerStats, ChatRequest, StepKind, StepStatus } from '@ayko/contracts';
import { chatApi } from '@/infrastructure/api';

export interface Step {
  stepId: string;
  kind: StepKind;
  label: string;
  status: StepStatus;
  durationMs?: number;
}

export interface Exchange {
  id: string;
  question: string;
  requestId: string | null;
  answer: string;
  steps: Step[];
  stats: AnswerStats | null;
  error: string | null;
  pending: boolean;
}

export interface PendingConfirm {
  confirmId: string;
  label: string;
  expiresAt: string;
}

/** Orchestrates one playground conversation over the /chat event stream. */
export function usePlaygroundRun() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const conversationId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);

  const patchLast = (update: (exchange: Exchange) => Exchange) =>
    setExchanges((list) =>
      list.map((item, index) => (index === list.length - 1 ? update(item) : item)),
    );

  const apply = (event: AgentEvent) => {
    switch (event.type) {
      case 'request.accepted':
        conversationId.current = event.conversationId;
        requestId.current = event.requestId;
        patchLast((item) => ({ ...item, requestId: event.requestId }));
        break;
      case 'activity.step':
        patchLast((item) => {
          const known = item.steps.some((step) => step.stepId === event.stepId);
          return {
            ...item,
            steps: known
              ? item.steps.map((step) => (step.stepId === event.stepId ? event : step))
              : [...item.steps, event],
          };
        });
        break;
      case 'answer.delta':
        patchLast((item) => ({ ...item, answer: item.answer + event.text }));
        break;
      case 'answer.done':
        patchLast((item) => ({ ...item, stats: event.stats, pending: false }));
        break;
      case 'confirm.request':
        setConfirm(event);
        break;
      case 'request.failed':
        setConfirm(null);
        patchLast((item) => ({ ...item, error: event.message, pending: false }));
        break;
      default:
        break;
    }
  };

  const send = useCallback(async (input: Omit<ChatRequest, 'conversationId'>) => {
    setExchanges((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        question: input.text,
        requestId: null,
        answer: '',
        steps: [],
        stats: null,
        error: null,
        pending: true,
      },
    ]);
    try {
      for await (const event of chatApi.send({
        ...input,
        conversationId: conversationId.current,
      })) {
        apply(event);
      }
    } catch (error) {
      patchLast((item) => ({ ...item, error: (error as Error).message, pending: false }));
    }
    requestId.current = null;
  }, []);

  const cancel = () => {
    if (requestId.current) void chatApi.cancel(requestId.current);
  };

  const answerConfirm = (accepted: boolean) => {
    if (confirm) void chatApi.confirm(confirm.confirmId, accepted);
    setConfirm(null);
  };

  const reset = () => {
    conversationId.current = null;
    setExchanges([]);
  };

  return { exchanges, confirm, send, cancel, answerConfirm, reset };
}
