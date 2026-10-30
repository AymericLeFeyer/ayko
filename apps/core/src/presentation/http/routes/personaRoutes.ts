import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { personaBody, personaPreviewRequest } from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { body, param } from '../support.js';

const rollback = z.object({ version: z.number().int().min(1) });

export function personaRoutes(app: FastifyInstance, { personas }: Container) {
  app.get('/personas', () => personas.list());
  app.post('/personas', (request) => personas.create(body(personaBody, request)));
  app.get('/personas/:id', (request) => personas.get(param(request)));
  app.patch('/personas/:id', (request) =>
    personas.update(param(request), body(personaBody.partial(), request)),
  );
  app.delete('/personas/:id', async (request) => {
    await personas.delete(param(request));
    return { ok: true };
  });
  app.post('/personas/:id/default', (request) => personas.setDefault(param(request)));
  app.get('/personas/:id/versions', (request) => personas.listVersions(param(request)));
  app.post('/personas/:id/rollback', (request) =>
    personas.rollback(param(request), body(rollback, request).version),
  );
  app.post('/personas/:id/preview', (request) =>
    personas.preview(param(request), body(personaPreviewRequest, request)),
  );
}
