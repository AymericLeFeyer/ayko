import type { FastifyInstance } from 'fastify';
import { apiKeyCreate, changePassword, credentials } from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { unauthorized } from '../../../shared/errors.js';
import { authenticate, body, param, SESSION_COOKIE, setSessionCookie } from '../support.js';

const STRICT_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export function publicAuthRoutes(app: FastifyInstance, container: Container) {
  const { auth } = container;

  app.get('/setup/status', async () => ({
    needsSetup: await auth.needsSetup(),
    mock: container.env.mock,
  }));

  app.post('/auth/setup', STRICT_LIMIT, async (request, reply) => {
    const session = await auth.createFirstAdmin(body(credentials, request));
    setSessionCookie(reply, container, session);
    return session.user;
  });

  app.post('/auth/login', STRICT_LIMIT, async (request, reply) => {
    const session = await auth.login(body(credentials, request));
    setSessionCookie(reply, container, session);
    return session.user;
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const actor = await authenticate(container, request);
    if (!actor) throw unauthorized();
    return actor;
  });
}

export function adminAuthRoutes(app: FastifyInstance, container: Container) {
  const { auth } = container;

  app.post('/auth/password', async (request, reply) => {
    const input = body(changePassword, request);
    if (!request.actor.id) throw unauthorized();
    const session = await auth.changePassword(
      request.actor.id,
      input.currentPassword,
      input.newPassword,
    );
    setSessionCookie(reply, container, session);
    return { ok: true };
  });

  app.get('/api-keys', () => auth.listApiKeys());
  app.post('/api-keys', (request) => auth.createApiKey(body(apiKeyCreate, request).name));
  app.delete('/api-keys/:id', async (request) => {
    await auth.deleteApiKey(param(request));
    return { ok: true };
  });
}
