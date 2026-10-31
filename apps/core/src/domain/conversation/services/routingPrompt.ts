const TOOLS_PER_SERVER = 8;

export interface RoutingCapability {
  server: string;
  tools: string[];
}

/**
 * Built from the connected servers: a fixed sentence about the house would send every
 * request for a new server (agenda, mail…) straight past its tools.
 */
export function routingPrompt(capabilities: RoutingCapability[]): string {
  const lines = capabilities.map(({ server, tools }) => {
    const shown = tools.slice(0, TOOLS_PER_SERVER).join(', ');
    return `- ${server} : ${shown}${tools.length > TOOLS_PER_SERVER ? ', …' : ''}`;
  });
  return [
    'Outils disponibles :',
    ...lines,
    "Détermine si la demande suivante a besoin de l'un de ces outils, pour agir ou pour obtenir " +
      'une information. Réponds par un seul mot : OUTILS ou DIRECT.',
  ].join('\n');
}

export function capabilitiesOf(tools: { serverName: string; exposedName: string }[]) {
  const servers = new Map<string, string[]>();
  for (const { serverName, exposedName } of tools) {
    servers.set(serverName, [...(servers.get(serverName) ?? []), exposedName]);
  }
  return [...servers].map(([server, names]) => ({ server, tools: names }));
}
