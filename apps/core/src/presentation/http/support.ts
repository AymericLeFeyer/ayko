import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { unauthorized } from '../../shared/errors.js';
import type { Container } from '../../container.js';

export const SESSION_COOKIE = 'ayko_session';

declare module 'fastify' {
  interface FastifyRequest {
    actor: { id: string | null; name: string };
  }
}

export const body = <T extends z.ZodType>(schema: T, request: FastifyRequest): z.output<T> =>
  schema.parse(request.body ?? {});

export const query = <T extends z.ZodType>(schema: T, request: FastifyRequest): z.output<T> =>
  schema.parse(request.query ?? {});

export const param = (request: FastifyRequest, name = 'id'): string =>
  (request.params as Record<string, string>)[name] as string;

export function setSessionCookie(
  reply: FastifyReply,
  container: Container,
  session: { token: string; expiresAt: Date },
) {
  reply.setCookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: container.env.publicUrl.startsWith('https://'),
    path: '/',
    expires: session.expiresAt,
  });
}

/** Resolves the admin from the session cookie, or from a bearer API key. */
export async function authenticate(container: Container, request: FastifyRequest) {
  const cookie = request.cookies[SESSION_COOKIE];
  if (cookie) {
    const user = await container.auth.userFromSession(cookie);
    if (user) return { id: user.id, name: user.username };
  }
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ') && (await container.auth.verifyApiKey(header.slice(7)))) {
    return { id: null, name: 'api-key' };
  }
  return null;
}

export function requireAdmin(container: Container) {
  return async (request: FastifyRequest) => {
    const actor = await authenticate(container, request);
    if (!actor) throw unauthorized();
    request.actor = actor;
  };
}

/** Server-sent events over a hijacked reply, for token and progress streams. */
export function openSse(reply: FastifyReply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  let closed = false;
  reply.raw.once('close', () => {
    closed = true;
  });
  return {
    send(event: unknown) {
      if (!closed) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      if (!closed) reply.raw.end();
    },
    get closed() {
      return closed;
    },
    onClose(listener: () => void) {
      reply.raw.once('close', listener);
    },
  };
}
