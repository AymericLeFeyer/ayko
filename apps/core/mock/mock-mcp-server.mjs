// Fake home automation MCP server used by mock mode, over the real stdio transport.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'mock-home', version: '0.1.0' });
const lights = new Map();
const text = (value) => ({ content: [{ type: 'text', text: value }] });
const withBlocks = (value, blocks) => ({ ...text(value), structuredContent: { blocks } });

server.registerTool(
  'light_turn_on',
  {
    description: "Allume la lumière d'une pièce",
    inputSchema: { room: z.string().describe('Nom de la pièce') },
  },
  async ({ room }) => {
    lights.set(room, true);
    return withBlocks(`Lumière ${room} allumée.`, [
      {
        type: 'entity',
        name: `Lumière ${room}`,
        state: 'Allumée',
        action: { label: 'Éteindre', text: `Éteins la lumière du ${room}` },
      },
    ]);
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
    // An unknown block type on purpose: the Display must show it as text, not break.
    return withBlocks(`Lumière ${room} éteinte.`, [
      { type: 'hologram', text: `Bloc inconnu : ${room} dans le noir` },
    ]);
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
  async () =>
    withBlocks('Dentiste à 14 h, réunion parents-profs à 18 h.', [
      {
        type: 'calendar_events',
        events: [
          { title: 'Dentiste', start: '14:00', location: 'Cabinet', color: '#3f9d6e' },
          { title: 'Réunion parents-profs', start: '18:00', color: '#e2a03f' },
        ],
      },
    ]),
);

server.registerTool(
  'get_weather',
  {
    description: 'Donne la météo actuelle et les prévisions',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    withBlocks('Il fait 14 °C, ciel couvert.', [
      {
        type: 'weather',
        temperature: 14,
        condition: 'Couvert',
        forecast: [
          { label: 'Demain', temperature: 16, condition: 'Soleil' },
          { label: 'Après-demain', temperature: 12, condition: 'Pluie' },
        ],
      },
    ]),
);

// Same shape as Home Assistant's overview, so the real parser runs in mock mode.
server.registerTool(
  'GetLiveContext',
  {
    description: "Donne l'état de tous les appareils",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    text(
      JSON.stringify({
        result: [
          'Live Context: An overview of the areas and the devices in this smart home:',
          '- names: Lumière salon, spot',
          '  domain: light',
          `  state: '${lights.get('salon') ? 'on' : 'off'}'`,
          '  areas: Salon',
          '- names: light_desktop_lightstrip, ruban led',
          '  domain: light',
          "  state: 'off'",
          '  areas: Chambre',
        ].join('\n'),
      }),
    ),
);

server.registerTool(
  'HassTurnOn',
  {
    description: 'Allume un appareil par son nom',
    inputSchema: { name: z.string() },
  },
  async ({ name }) => text(`${name} allumé.`),
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
