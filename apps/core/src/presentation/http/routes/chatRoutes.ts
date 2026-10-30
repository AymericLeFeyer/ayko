import type { FastifyInstance } from 'fastify';
import { chatRequest, confirmAnswer, conversationQuery, pageQuery } from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { notFound } from '../../../shared/errors.js';
import { body, openSse, param, query } from '../support.js';

export function chatRoutes(app: FastifyInstance, { agent, conversations }: Container) {
  app.post('/chat', async (request, reply) => {
    const input = body(chatRequest, request);
    const sse = openSse(reply);
    let requestId: string | null = null;
    let finished = false;
    // Closing the tab cancels the run: a CPU model should not keep working for nobody.
    sse.onClose(() => {
      if (!finished && requestId) agent.cancel(requestId);
    });
    await agent.run(
      { ...input, source: request.actor.name === 'api-key' ? 'api' : 'playground' },
      (event) => {
        if (event.type === 'request.accepted') requestId = event.requestId;
        sse.send(event);
      },
    );
    finished = true;
    sse.end();
  });

  app.post('/chat/:id/cancel', (request) => {
    if (!agent.cancel(param(request))) throw notFound('Requête en cours');
    return { ok: true };
  });

  app.post('/chat/confirm', (request) => {
    const { confirmId, accepted } = body(confirmAnswer, request);
    if (!agent.answerConfirmation(confirmId, accepted)) throw notFound('Confirmation');
    return { ok: true };
  });

  app.get('/conversations', (request) => {
    const { cursor, limit, ...filter } = query(pageQuery.extend(conversationQuery.shape), request);
    return conversations.listConversations(filter, limit, cursor);
  });

  app.get('/conversations/:id', async (request) => {
    const conversation = await conversations.findConversation(param(request));
    if (!conversation) throw notFound('Conversation');
    return conversation;
  });

  app.get('/traces/:requestId', async (request) => {
    const trace = await conversations.findTrace(param(request, 'requestId'));
    if (!trace) throw notFound('Trace');
    return trace;
  });
}
