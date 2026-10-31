import type { FastifyInstance } from 'fastify';
import { pageQuery } from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { param, query } from '../support.js';

export function reportRoutes(app: FastifyInstance, { reports }: Container) {
  app.get('/reports', (request) => {
    const { limit } = query(pageQuery.pick({ limit: true }), request);
    return reports.list(limit);
  });
  app.delete('/reports/:id', async (request) => {
    await reports.delete(param(request));
    return { ok: true };
  });
}
