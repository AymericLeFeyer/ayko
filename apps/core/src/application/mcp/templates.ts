import type { McpTemplate } from '@ayko/contracts';

/** Starting points only: every field stays editable before the server is created. */
export const MCP_TEMPLATES: McpTemplate[] = [
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    description:
      "Serveur MCP intégré à Home Assistant. Remplacez l'hôte et créez un jeton longue durée.",
    input: {
      name: 'Home Assistant',
      transport: 'http',
      url: 'http://homeassistant.local:8123/api/mcp',
      args: [],
      enabled: true,
    },
    requiredSecrets: ['Authorization'],
  },
  {
    id: 'web-search',
    name: 'Recherche web',
    description: 'Recherche via une instance SearXNG locale. Seul ce serveur sort vers Internet.',
    input: {
      name: 'Recherche web',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-searxng'],
      enabled: true,
    },
    requiredSecrets: ['SEARXNG_URL'],
  },
  {
    id: 'calendar',
    name: 'Calendriers',
    description: 'Calendriers CalDAV (Nextcloud, Radicale…). Adaptez la commande à votre serveur.',
    input: {
      name: 'Calendriers',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-caldav'],
      enabled: true,
    },
    requiredSecrets: ['CALDAV_URL', 'CALDAV_USERNAME', 'CALDAV_PASSWORD'],
  },
];
