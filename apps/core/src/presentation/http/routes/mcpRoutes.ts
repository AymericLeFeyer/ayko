import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mcpServerInput, pageQuery, toolCallRequest, toolPolicyUpdate } from '@ayko/contracts';
import { MCP_TEMPLATES } from '../../../application/mcp/templates.js';
import type { Container } from '../../../container.js';
import { notFound } from '../../../shared/errors.js';
import { body, param, query } from '../support.js';

const callsQuery = pageQuery.extend({
  serverName: z.string().optional(),
  toolName: z.string().optional(),
  roomId: z.uuid().optional(),
  errorsOnly: z.stringbool().optional(),
});

export function mcpRoutes(app: FastifyInstance, { registry, system }: Container) {
  app.get('/mcp/templates', () => MCP_TEMPLATES);
  app.get('/mcp/servers', () => registry.listServers());
  app.post('/mcp/servers', (request) => registry.createServer(body(mcpServerInput, request)));
  app.get('/mcp/servers/:id', (request) => registry.getServer(param(request)));
  app.patch('/mcp/servers/:id', (request) =>
    registry.updateServer(param(request), body(mcpServerInput.partial(), request)),
  );
  app.delete('/mcp/servers/:id', async (request) => {
    await registry.deleteServer(param(request));
    return { ok: true };
  });
  app.post('/mcp/servers/:id/restart', (request) => registry.restart(param(request)));
  app.get('/mcp/servers/:id/tools', (request) => registry.listTools(param(request)));
  app.get('/mcp/servers/:id/explore', (request) => registry.explore(param(request)));

  app.put('/mcp/tools/:id/policy', (request) =>
    registry.updatePolicy(param(request), body(toolPolicyUpdate, request)),
  );

  /** Manual tester: an admin action, so it deliberately bypasses policies and rooms. */
  app.post('/mcp/tools/:id/call', async (request) => {
    const tool = await registry.getTool(param(request));
    if (!tool) throw notFound('Outil');
    const { agent } = await system.getSettings();
    const { arguments: args } = body(toolCallRequest, request);
    return registry.call(tool, args, {
      requestId: null,
      roomId: null,
      source: 'tester',
      timeoutMs: agent.toolTimeoutMs,
    });
  });

  app.get('/mcp/calls', (request) => {
    const { cursor, limit, ...filter } = query(callsQuery, request);
    return registry.listCalls(filter, limit, cursor);
  });
}
