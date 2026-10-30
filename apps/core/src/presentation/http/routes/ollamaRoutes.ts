import type { FastifyInstance } from 'fastify';
import {
  modelParams,
  modelRolesUpdate,
  modelTestRequest,
  ollamaEndpointInput,
  pullRequest,
} from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { errorMessage } from '../../../shared/errors.js';
import { body, openSse, param } from '../support.js';

export function ollamaRoutes(app: FastifyInstance, { ollama }: Container) {
  app.get('/ollama/endpoints', () => ollama.listEndpoints());
  app.post('/ollama/endpoints', (request) =>
    ollama.createEndpoint(body(ollamaEndpointInput, request)),
  );
  app.patch('/ollama/endpoints/:id', (request) =>
    ollama.updateEndpoint(param(request), body(ollamaEndpointInput.partial(), request)),
  );
  app.delete('/ollama/endpoints/:id', async (request) => {
    await ollama.deleteEndpoint(param(request));
    return { ok: true };
  });
  app.post('/ollama/endpoints/:id/test', (request) => ollama.testEndpoint(param(request)));

  app.get('/ollama/models', () => ollama.listModels());
  app.get('/ollama/models/*', (request) => ollama.showModel(param(request, '*')));
  app.delete('/ollama/models/*', async (request) => {
    await ollama.deleteModel(param(request, '*'));
    return { ok: true };
  });
  app.get('/ollama/running', () => ollama.running());
  app.get('/ollama/roles', () => ollama.listRoles());
  app.put('/ollama/roles', (request) => ollama.saveRoles(body(modelRolesUpdate, request)));

  app.post('/ollama/models/pull', async (request, reply) => {
    const { name } = body(pullRequest, request);
    const sse = openSse(reply);
    const controller = new AbortController();
    sse.onClose(() => controller.abort());
    try {
      for await (const progress of ollama.pull(name, controller.signal)) sse.send(progress);
    } catch (error) {
      sse.send({ status: 'error', error: errorMessage(error) });
    }
    sse.end();
  });

  app.post('/ollama/models/test', async (request, reply) => {
    const input = body(modelTestRequest, request);
    const sse = openSse(reply);
    const controller = new AbortController();
    sse.onClose(() => controller.abort());
    const params = modelParams.partial().parse(input.params ?? {});
    for await (const event of ollama.testModel({ ...input, params }, controller.signal)) {
      sse.send(event);
    }
    sse.end();
  });
}
