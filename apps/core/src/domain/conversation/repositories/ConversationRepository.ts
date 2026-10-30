import type {
  Conversation,
  ConversationDetail,
  Message,
  Page,
  StepKind,
  StepStatus,
  Trace,
} from '@ayko/contracts';

export interface RequestRecord {
  id: string;
  conversationId: string | null;
  roomId: string | null;
  deviceId: string | null;
  text: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  createdAt: string;
}

export interface RequestUpdate {
  status?: RequestRecord['status'];
  model?: string | null;
  personaName?: string | null;
  prompt?: unknown;
  reasoning?: string | null;
  answer?: string | null;
  error?: string | null;
  cacheOutcome?: 'hit' | 'miss' | 'skipped';
  cacheEntryId?: string | null;
  cacheMatchType?: 'exact' | 'approximate' | null;
  cacheDurationMs?: number | null;
  ttftMs?: number | null;
  tokensPerSecond?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
}

export interface StepRecord {
  id: string;
  requestId: string;
  kind: StepKind;
  label: string;
  status: StepStatus;
  detail: unknown;
  startedAt: string;
  durationMs: number | null;
}

export interface ConversationRepository {
  createConversation(conversation: {
    id: string;
    roomId: string | null;
    title: string;
    source: Conversation['source'];
    createdAt: string;
  }): Promise<void>;
  findConversation(id: string): Promise<ConversationDetail | null>;
  listConversations(
    filter: { search?: string; roomId?: string },
    limit: number,
    cursor?: string,
  ): Promise<Page<Conversation>>;
  addMessage(message: Message): Promise<void>;
  /** Most recent messages in chronological order, for the context window. */
  recentMessages(conversationId: string, limit: number): Promise<Message[]>;
  createRequest(request: RequestRecord): Promise<void>;
  updateRequest(id: string, update: RequestUpdate): Promise<void>;
  addStep(step: StepRecord): Promise<void>;
  finishStep(
    id: string,
    update: { status: StepStatus; detail?: unknown; durationMs: number },
  ): Promise<void>;
  findTrace(requestId: string): Promise<Trace | null>;
}
