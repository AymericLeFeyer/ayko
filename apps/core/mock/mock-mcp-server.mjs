// Fake home automation MCP server used by mock mode, over the real stdio transport.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'mock-home', version: '0.1.0' });
const lights = new Map();
const text = (value) => ({ content: [{ type: 'text', text: value }] });

server.registerTool(
  'light_turn_on',
  {
    description: "Allume la lumière d'une pièce",
    inputSchema: { room: z.string().describe('Nom de la pièce') },
  },
  async ({ room }) => {
    lights.set(room, true);
    return text(`Lumière ${room} allumée.`);
  },
);

server.registerTool(
  'light_turn_off',
  {
    description: "Éteint la lumière d'une pièce",
    inputSchema: { room: z.string().describe('Nom de la pièce') },
  },
  async ({ room }) => {
    lights.set(room, false);
    return text(`Lumière ${room} éteinte.`);
  },
);

server.registerTool(
  'cover_set',
  {
    description: "Règle la position d'un volet (0 fermé, 100 ouvert)",
    inputSchema: { room: z.string(), position: z.number().min(0).max(100) },
  },
  async ({ room, position }) => text(`Volet ${room} réglé à ${position} %.`),
);

server.registerTool(
  'get_temperature',
  {
    description: "Donne la température d'une pièce",
    inputSchema: { room: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ room }) => text(`Il fait ${(19 + Math.random() * 3).toFixed(1)} °C dans ${room}.`),
);

server.registerTool(
  'get_calendar_events',
  {
    description: 'Liste les prochains rendez-vous',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => text('Dentiste à 14 h, réunion parents-profs à 18 h.'),
);

server.registerTool(
  'lock_door',
  { description: 'Verrouille une porte', inputSchema: { door: z.string() } },
  async ({ door }) => text(`Porte ${door} verrouillée.`),
);

server.registerResource(
  'lights',
  'home://lights',
  { description: 'État des lumières', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(Object.fromEntries(lights)) }],
  }),
);

server.registerPrompt(
  'bilan',
  { description: 'Résume la maison', argsSchema: { piece: z.string().optional() } },
  ({ piece }) => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: `Fais le bilan de ${piece ?? 'la maison'}.` },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
