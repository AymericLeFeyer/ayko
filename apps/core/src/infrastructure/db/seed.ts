import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelParams, personaBody } from '@ayko/contracts';
import type { OllamaService } from '../../application/llm/OllamaService.js';
import type { McpRegistry } from '../../application/mcp/McpRegistry.js';
import { DEFAULT_PERSONA_PROMPT } from '../../application/persona/PersonaService.js';
import type { RoomService } from '../../application/rooms/RoomService.js';
import type { PersonaRepository } from '../../domain/persona/repositories/PersonaRepository.js';
import type { VoiceRepository } from '../../domain/voice/VoiceProviders.js';

const mockMcpServer = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../mock/mock-mcp-server.mjs',
);

/** Baseline every install needs: one persona and a fake provider in each voice slot. */
export async function seedDefaults(deps: {
  personaRepository: PersonaRepository;
  voiceRepository: VoiceRepository;
}) {
  const { personaRepository, voiceRepository } = deps;
  if ((await personaRepository.list()).length === 0) {
    const now = new Date().toISOString();
    const fields = personaBody.parse({ name: 'Ayko', systemPrompt: DEFAULT_PERSONA_PROMPT });
    const id = randomUUID();
    await personaRepository.save({ ...fields, id, isDefault: true, version: 1, updatedAt: now });
    await personaRepository.addVersion({
      id: randomUUID(),
      personaId: id,
      version: 1,
      snapshot: fields,
      createdAt: now,
    });
  }
  if ((await voiceRepository.list()).length === 0) {
    const updatedAt = new Date().toISOString();
    await voiceRepository.replaceAll(
      (['wake_word', 'stt', 'tts'] as const).map((slot) => ({
        id: randomUUID(),
        slot,
        kind: 'fake' as const,
        name: 'Factice',
        active: true,
        config: { language: 'fr' },
        updatedAt,
      })),
    );
  }
}

/** Demo data of mock mode: everything is testable with no Ollama and no MCP server. */
export async function seedDemo(
  deps: { rooms: RoomService; ollama: OllamaService; registry: McpRegistry },
  fakeOllamaUrl: string,
) {
  const { rooms, ollama, registry } = deps;
  const endpoints = await ollama.listEndpoints();
  if (endpoints.length > 0) {
    // The fake Ollama port can change between runs; keep the seeded endpoint in sync.
    const seeded = endpoints.find((endpoint) => endpoint.name === 'Ollama simulé');
    if (seeded && seeded.url !== fakeOllamaUrl) {
      await ollama.updateEndpoint(seeded.id, {
        url: fakeOllamaUrl,
        metricsUrl: `${fakeOllamaUrl}/metrics`,
      });
    }
    return;
  }
  await ollama.createEndpoint({
    name: 'Ollama simulé',
    url: fakeOllamaUrl,
    metricsUrl: `${fakeOllamaUrl}/metrics`,
    enabled: true,
    priority: 0,
    connectTimeoutMs: 3000,
  });
  await ollama.saveRoles([
    {
      role: 'conversation',
      model: 'mock-llama:latest',
      params: modelParams.parse({ numCtx: 4096 }),
    },
    { role: 'routing', model: 'mock-tiny:latest', params: modelParams.parse({}) },
    { role: 'embeddings', model: 'mock-embed:latest', params: modelParams.parse({}) },
  ]);
  await rooms.createRoom({
    name: 'Salon',
    icon: 'sofa',
    config: { suggestions: ['Allume le salon'] },
  });
  await rooms.createRoom({ name: 'Chambre', icon: 'bed' });
  await rooms.createRoom({ name: 'Entrée', icon: 'door-open' });
  await registry.createServer({
    name: 'Maison simulée',
    transport: 'stdio',
    command: process.execPath,
    args: [mockMcpServer],
    enabled: true,
  });
}
