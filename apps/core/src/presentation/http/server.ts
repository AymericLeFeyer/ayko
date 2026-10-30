import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import type { Container } from '../../container.js';
import { AppError } from '../../shared/errors.js';
import { handleDisplaySocket } from '../ws/displaySocket.js';
import { adminAuthRoutes, publicAuthRoutes } from './routes/authRoutes.js';
import { cacheRoutes } from './routes/cacheRoutes.js';
import { chatRoutes } from './routes/chatRoutes.js';
import { mcpRoutes } from './routes/mcpRoutes.js';
import { ollamaRoutes } from './routes/ollamaRoutes.js';
import { personaRoutes } from './routes/personaRoutes.js';
import { adminRoomRoutes, publicRoomRoutes } from './routes/roomRoutes.js';
import { systemRoutes } from './routes/systemRoutes.js';
import { authenticate, requireAdmin } from './support.js';

/** POST routes that read or stream rather than change the configuration. */
const NOT_AUDITED = /\/(chat|models\/test|preview|test|call|config\/export)/;

export async function buildServer(container: Container) {
  const { env, logger, system } = container;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  app.decorateRequest('actor', null as never);
  await app.register(cookie);
  await app.register(helmet, {
    // LAN deployment over plain HTTP: these two would break every asset on http://.
    strictTransportSecurity: false,
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  });
  await app.register(cors, { origin: env.corsOrigins.length > 0 ? env.corsOrigins : false, credentials: true });
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send({ code: 'validation_error', message: 'Données invalides', details: error.issues });
    }
    if (error instanceof AppError) {
      return reply
        .status(error.status)
        .send({ code: error.code, message: error.message, details: error.details });
    }
    if (error.statusCode && error.statusCode < 500) {
      const tooMany = error.statusCode === 429;
      return reply.status(error.statusCode).send({
        code: tooMany ? 'rate_limited' : 'bad_request',
        message: tooMany ? 'Trop de tentatives, réessayez dans une minute' : error.message,
      });
    }
    logger.log('error', 'http', `${request.method} ${request.url} : ${error.message}`);
    return reply
      .status(503)
      .send({ code: 'internal_error', message: error.message || 'Erreur interne' });
  });

  app.get('/health', () => system.health());

  app.register(
    async (api) => {
      api.get('/health', () => system.health());
      publicAuthRoutes(api, container);
      publicRoomRoutes(api, container);

      api.register(async (admin) => {
        admin.addHook('preHandler', requireAdmin(container));
        admin.addHook('onResponse', async (request, reply) => {
          const { method, url } = request;
          if (method === 'GET' || reply.statusCode >= 400 || NOT_AUDITED.test(url)) return;
          // Bodies are left out on purpose: they may carry secrets.
          await system
            .audit(request.actor.name, `${method} ${request.routeOptions.url}`, url)
            .catch(() => {});
        });
        adminAuthRoutes(admin, container);
        adminRoomRoutes(admin, container);
        ollamaRoutes(admin, container);
        mcpRoutes(admin, container);
        personaRoutes(admin, container);
        chatRoutes(admin, container);
        cacheRoutes(admin, container);
        systemRoutes(admin, container);
      });
    },
    { prefix: '/api/v1' },
  );

  app.get('/ws/display', { websocket: true }, async (socket, request) => {
    const header = request.headers.authorization?.replace(/^Bearer /, '');
    const token = header ?? (request.query as { token?: string }).token ?? '';
    const device = await container.rooms.authenticateDevice(token);
    if (!device) return socket.close(4401, 'unauthorized');
    return handleDisplaySocket(socket, device, container);
  });

  app.get('/ws/admin', { websocket: true }, async (socket, request) => {
    const actor = await authenticate(container, request);
    if (!actor) return socket.close(4401, 'unauthorized');
    const unsubscribe = container.bus.subscribe((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on('close', unsubscribe);
    return undefined;
  });

  if (env.backofficeDir) {
    await app.register(fastifyStatic, { root: resolve(env.backofficeDir), wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      const isSpaRoute =
        request.method === 'GET' && !/^\/(api|ws)\//.test(request.url) && !request.url.includes('.');
      if (isSpaRoute) return reply.sendFile('index.html');
      return reply.status(404).send({ code: 'not_found', message: 'Route introuvable' });
    });
  } else {
    app.setNotFoundHandler((_request, reply) =>
      reply.status(404).send({ code: 'not_found', message: 'Route introuvable' }),
    );
  }

  return app;
}
