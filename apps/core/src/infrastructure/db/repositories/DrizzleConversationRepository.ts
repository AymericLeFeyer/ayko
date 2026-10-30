import { and, asc, count, desc, eq, like, or, type SQL } from 'drizzle-orm';
import type { Conversation, Message, StepKind } from '@ayko/contracts';
import type {
  ConversationRepository,
  RequestRecord,
  RequestUpdate,
  StepRecord,
} from '../../../domain/conversation/repositories/ConversationRepository.js';
import type { Db } from '../client.js';
import { cursorCondition, newestFirst, toPage } from '../pagination.js';
import { conversations, messages, requests, rooms, toolCalls, traceSteps } from '../schema.js';

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: Db) {}

  async createConversation(
    conversation: Parameters<ConversationRepository['createConversation']>[0],
  ) {
    this.db
      .insert(conversations)
      .values({ ...conversation, updatedAt: conversation.createdAt })
      .run();
  }

  private toConversation(row: {
    conversation: typeof conversations.$inferSelect;
    roomName: string | null;
  }): Conversation {
    const messageCount =
      this.db
        .select({ value: count() })
        .from(messages)
        .where(eq(messages.conversationId, row.conversation.id))
        .get()?.value ?? 0;
    return { ...row.conversation, roomName: row.roomName, messageCount };
  }

  async findConversation(id: string) {
    const row = this.db
      .select({ conversation: conversations, roomName: rooms.name })
      .from(conversations)
      .leftJoin(rooms, eq(rooms.id, conversations.roomId))
      .where(eq(conversations.id, id))
      .get();
    if (!row) return null;
    const items = this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .all();
    return { ...this.toConversation(row), messages: items };
  }

  async listConversations(
    filter: { search?: string; roomId?: string },
    limit: number,
    cursor?: string,
  ) {
    const conditions: (SQL | undefined)[] = [
      filter.roomId ? eq(conversations.roomId, filter.roomId) : undefined,
      filter.search ? like(conversations.title, `%${filter.search}%`) : undefined,
      cursorCondition(conversations.updatedAt, conversations.id, cursor),
    ];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions[1] = or(
        like(conversations.title, pattern),
        eq(
          conversations.id,
          this.db
            .select({ id: messages.conversationId })
            .from(messages)
            .where(
              and(like(messages.content, pattern), eq(messages.conversationId, conversations.id)),
            )
            .limit(1),
        ),
      );
    }
    const rows = this.db
      .select({ conversation: conversations, roomName: rooms.name })
      .from(conversations)
      .leftJoin(rooms, eq(rooms.id, conversations.roomId))
      .where(and(...conditions))
      .orderBy(...newestFirst(conversations.updatedAt, conversations.id))
      .limit(limit + 1)
      .all();
    return toPage(
      rows,
      limit,
      (row) => this.toConversation(row),
      ({ conversation }) => [conversation.updatedAt, conversation.id],
    );
  }

  async addMessage(message: Message) {
    this.db.transaction((tx) => {
      tx.insert(messages).values(message).run();
      tx.update(conversations)
        .set({ updatedAt: message.createdAt })
        .where(eq(conversations.id, message.conversationId))
        .run();
    });
  }

  async recentMessages(conversationId: string, limit: number) {
    const rows = this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
    return rows.reverse();
  }

  async createRequest(request: RequestRecord) {
    this.db
      .insert(requests)
      .values({ ...request, cacheOutcome: 'skipped' })
      .run();
  }

  async updateRequest(id: string, update: RequestUpdate) {
    this.db.update(requests).set(update).where(eq(requests.id, id)).run();
  }

  async addStep(step: StepRecord) {
    this.db.insert(traceSteps).values(step).run();
  }

  async finishStep(id: string, update: Parameters<ConversationRepository['finishStep']>[1]) {
    this.db.update(traceSteps).set(update).where(eq(traceSteps.id, id)).run();
  }

  async findTrace(requestId: string) {
    const row = this.db
      .select({ request: requests, roomName: rooms.name })
      .from(requests)
      .leftJoin(rooms, eq(rooms.id, requests.roomId))
      .where(eq(requests.id, requestId))
      .get();
    if (!row) return null;
    const { request, roomName } = row;
    const steps = this.db
      .select()
      .from(traceSteps)
      .where(eq(traceSteps.requestId, requestId))
      .orderBy(asc(traceSteps.startedAt))
      .all();
    const calls = this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.requestId, requestId))
      .orderBy(asc(toolCalls.createdAt))
      .all();
    return {
      requestId: request.id,
      conversationId: request.conversationId,
      roomId: request.roomId,
      roomName,
      text: request.text,
      status: request.status,
      model: request.model,
      personaName: request.personaName,
      prompt: request.prompt,
      reasoning: request.reasoning,
      answer: request.answer,
      error: request.error,
      cache: {
        outcome: request.cacheOutcome,
        entryId: request.cacheEntryId,
        matchType: request.cacheMatchType,
        durationMs: request.cacheDurationMs,
      },
      ttftMs: request.ttftMs,
      tokensPerSecond: request.tokensPerSecond,
      durationMs: request.durationMs,
      createdAt: request.createdAt,
      steps: steps.map((step) => ({ ...step, kind: step.kind as StepKind })),
      toolCalls: calls.map((call) => ({
        id: call.id,
        serverName: call.serverName,
        toolName: call.toolName,
        arguments: call.arguments,
        result: call.result,
        isError: call.isError,
        durationMs: call.durationMs,
        source: call.source,
      })),
    };
  }
}
