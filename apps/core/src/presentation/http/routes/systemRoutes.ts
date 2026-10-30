import type { FastifyInstance } from 'fastify';
import {
  configBundle,
  configExportRequest,
  logQuery,
  pageQuery,
  systemSettings,
  voiceProvidersUpdate,
} from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { body, param, query } from '../support.js';

export function systemRoutes(app: FastifyInstance, { system, voice, registry }: Container) {
  app.get('/metrics', () => system.metrics());

  app.get('/logs', (request) => {
    const { cursor, limit, ...filter } = query(pageQuery.extend(logQuery.shape), request);
    return system.listLogs(filter, limit, cursor);
  });

  app.get('/audit', (request) => {
    const { cursor, limit } = query(pageQuery, request);
    return system.listAudit(limit, cursor);
  });

  app.get('/settings', () => system.getSettings());
  app.put('/settings', (request) => system.updateSettings(body(systemSettings, request)));

  app.post('/config/export', (request) =>
    system.exportConfig(body(configExportRequest, request).includeSecrets),
  );
  app.post('/config/import', { bodyLimit: 32 * 1024 * 1024 }, async (request) => {
    const result = await system.importConfig(body(configBundle, request));
    await registry.restartAll();
    return result;
  });

  app.get('/setup/wizard', () => system.wizardState());
  app.post('/setup/wizard/complete', () => system.completeWizard());

  app.get('/voice/providers', () => voice.list());
  app.put('/voice/providers', (request) => voice.replace(body(voiceProvidersUpdate, request)));
  app.post('/voice/providers/:id/test', (request) => voice.test(param(request)));
}
