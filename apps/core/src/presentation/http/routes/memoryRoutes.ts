import type { FastifyInstance } from 'fastify';
import { memoryInput } from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { body, param } from '../support.js';

export function memoryRoutes(app: FastifyInstance, { memory }: Container) {
  app.get('/memories', () => memory.list());
  app.post('/memories', (request) => memory.create(body(memoryInput, request)));
  app.patch('/memories/:id', (request) =>
    memory.update(param(request), body(memoryInput.partial(), request)),
  );
  app.delete('/memories/:id', async (request) => {
    await memory.delete(param(request));
    return { ok: true };
  });
}
