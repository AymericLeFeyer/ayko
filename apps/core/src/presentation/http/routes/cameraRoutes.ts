import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { cameraUpdate } from '@ayko/contracts';
import { z } from 'zod';
import type { Container } from '../../../container.js';
import { body, param, query } from '../support.js';

const streamQuery = z.object({ ticket: z.string() });

/** The ticket stands for the bearer token an `<img>` cannot send. */
export function publicCameraRoutes(app: FastifyInstance, { cameras }: Container) {
  app.get('/device/cameras/:id/stream', async (request, reply) => {
    const { ticket } = query(streamQuery, request);
    const viewer = new AbortController();
    const stream = await cameras.openStream(param(request), ticket, viewer.signal);
    reply.hijack();
    reply.raw.once('close', () => viewer.abort());
    reply.raw.writeHead(200, {
      'content-type': stream.contentType,
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    });
    // The viewer leaving breaks the pipe: that is how every stream ends.
    await pipeline(stream.body, reply.raw).catch(() => {});
  });
}

export function adminCameraRoutes(app: FastifyInstance, { cameras }: Container) {
  app.get('/cameras', () => cameras.list());
  app.get('/cameras/source', () => cameras.source());
  app.post('/cameras/sync', () => cameras.sync());
  app.patch('/cameras/:id', (request) =>
    cameras.update(param(request), body(cameraUpdate, request)),
  );
  app.get('/cameras/:id/snapshot', async (request, reply) => {
    const { data, contentType } = await cameras.snapshot(param(request));
    return reply.type(contentType).header('cache-control', 'no-store').send(data);
  });
}
