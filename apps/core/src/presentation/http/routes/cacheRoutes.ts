import type { FastifyInstance } from 'fastify';
import {
  cacheClear,
  cacheEntryQuery,
  cacheEntryUpdate,
  cachePromote,
  cacheSettings,
  historyQuery,
  pageQuery,
} from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { body, param, query } from '../support.js';

export function cacheRoutes(app: FastifyInstance, { cache }: Container) {
  app.get('/history/requests', (request) => {
    const { cursor, limit, ...filter } = query(pageQuery.extend(historyQuery.shape), request);
    return cache.listHistory(filter, limit, cursor);
  });
  app.get('/history/requests/:id', (request) => cache.getHistory(param(request)));

  app.get('/cache/entries', (request) => cache.listEntries(query(cacheEntryQuery, request)));
  app.get('/cache/entries/:id', (request) => cache.getEntry(param(request)));
  app.patch('/cache/entries/:id', (request) =>
    cache.updateEntry(param(request), body(cacheEntryUpdate, request)),
  );
  app.delete('/cache/entries/:id', async (request) => {
    await cache.deleteEntry(param(request));
    return { ok: true };
  });
  app.post('/cache/entries/:id/pin', (request) => cache.togglePin(param(request)));
  app.post('/cache/promote', (request) => cache.promote(body(cachePromote, request).historyId));
  app.post('/cache/clear', (request) => cache.clear(body(cacheClear, request)));
  app.get('/cache/settings', () => cache.settings());
  app.put('/cache/settings', (request) => cache.updateSettings(body(cacheSettings, request)));
  app.get('/cache/stats', () => cache.stats());
}
