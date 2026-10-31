import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, Camera, CameraSourceStatus, Trace } from '@ayko/contracts';
import { CameraService } from '../src/application/cameras/CameraService.js';
import { CameraAccessRefused, type CameraProvider } from '../src/domain/cameras/CameraProvider.js';
import type { CameraRepository } from '../src/domain/cameras/repositories/CameraRepository.js';
import { parseCameraCommand } from '../src/domain/cameras/services/cameraCommand.js';
import { homeAssistantSource } from '../src/infrastructure/cameras/HomeAssistantCameras.js';
import { answerOf, requestIdOf, startHarness, type Harness } from './harness.js';

const camera = (name: string, aliases: string[] = []): Camera => ({
  id: name,
  entityId: `camera.${name}`,
  name,
  aliases,
  fullscreenByDefault: false,
  enabled: true,
  createdAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T10:00:00.000Z',
});

describe('parseCameraCommand', () => {
  const cameras = [camera('Porte', ['sonnette']), camera('Caméra salon'), camera('Porte garage')];
  const parse = (text: string) => parseCameraCommand(text, cameras);

  it.each([
    ['Montre-moi la porte', 'Porte'],
    ['montre moi la porte', 'Porte'],
    ['caméra salon', 'Caméra salon'],
    ['Affiche la sonnette', 'Porte'],
    ['je veux voir la porte du garage', 'Porte'],
    ['Montre la porte garage', 'Porte garage'],
  ])('shows a camera for « %s »', (text, name) => {
    expect(parse(text)).toMatchObject({ intent: 'show', camera: { name }, fullscreen: false });
  });

  it.each([
    'Qui est devant la porte ?',
    "Y a quelqu'un au salon ?",
    "Qu'est-ce que tu vois à la porte ?",
    'Il y a un colis devant la porte ?',
    'Regarde la sonnette',
  ])('looks at the image for « %s »', (text) => {
    expect(parse(text)).toMatchObject({ intent: 'look', fullscreen: false });
  });

  it('understands full screen, with or without a name', () => {
    expect(parse('Mets la porte en plein écran')).toMatchObject({ camera: { name: 'Porte' } });
    expect(parse('Mets la porte en plein écran')?.fullscreen).toBe(true);
    expect(parse('Mets la caméra en grand')).toEqual({
      intent: 'show',
      camera: null,
      fullscreen: true,
    });
  });

  it.each([
    'Ouvre la porte',
    'Ferme la porte',
    'Verrouille la porte',
    'Éteins la caméra du salon',
    'Allume le salon',
    'Est-ce que la porte est fermée ?',
    'Il y a une lampe allumée au salon ?',
    'Montre du markdown',
  ])('leaves « %s » to the model', (text) => {
    expect(parse(text)).toBeNull();
  });
});

describe('homeAssistantSource', () => {
  it('finds the MCP server of Home Assistant and keeps its token', () => {
    const headers = { Authorization: 'Bearer secret' };
    expect(
      homeAssistantSource([
        { name: 'Autre', url: 'http://search.local/mcp', headers: {} },
        { name: 'HA', url: 'http://192.168.1.122:8123/api/mcp', headers },
      ]),
    ).toEqual({ name: 'HA', url: 'http://192.168.1.122:8123', headers });
    expect(homeAssistantSource([])).toBeNull();
  });
});

describe('a refused token', () => {
  it('reaches Home Assistant once, then again only on an explicit sync', async () => {
    const repository: CameraRepository = {
      list: async () => [camera('Porte')],
      find: async () => camera('Porte'),
      save: async () => {},
      delete: async () => {},
    };
    const provider: CameraProvider = {
      list: vi.fn(async () => {
        throw new CameraAccessRefused('Jeton Home Assistant refusé');
      }),
      snapshot: vi.fn(async () => {
        throw new CameraAccessRefused('Jeton Home Assistant refusé');
      }),
      stream: vi.fn(async () => ({ body: Readable.from([]), contentType: 'image/jpeg' })),
    };
    const service = new CameraService(
      repository,
      provider,
      async () => ({ name: 'HA', url: 'http://ha', headers: {} }),
      { log: () => {} } as never,
    );

    await expect(service.snapshot('Porte')).rejects.toThrow('refusé');
    await expect(service.snapshot('Porte')).rejects.toThrow('synchronisez');
    expect(provider.snapshot).toHaveBeenCalledTimes(1);
    expect((await service.source()).refused).toBe(true);

    await expect(service.sync()).rejects.toThrow('refusé');
    expect(provider.list).toHaveBeenCalledTimes(1);
  });
});

describe('cameras end to end', () => {
  let h: Harness;
  let porte: Camera;

  const say = async (text: string, roomId: string) => {
    const events: AgentEvent[] = [];
    await h.container.agent.run(
      { text, roomId, deviceId: null, source: 'api' },
      (event) => void events.push(event),
    );
    return events;
  };
  const blocksOf = (events: AgentEvent[]) =>
    events.flatMap((event) => (event.type === 'answer.blocks' ? event.blocks : []));

  beforeAll(async () => {
    h = await startHarness();
    const cameras = await h.api<Camera[]>('GET', '/cameras');
    porte = cameras.find((item) => item.name === 'Porte') as Camera;
  });
  afterAll(() => h.close());

  it('imports the cameras of Home Assistant and nothing else', async () => {
    const cameras = await h.api<Camera[]>('GET', '/cameras');
    expect(cameras.map((item) => item.entityId).sort()).toEqual(['camera.porte', 'camera.salon']);
    const source = await h.api<CameraSourceStatus>('GET', '/cameras/source');
    expect(source).toMatchObject({ name: 'Home Assistant simulé', refused: false });
  });

  it('keeps the choices of the admin across a sync', async () => {
    await h.api('PATCH', `/cameras/${porte.id}`, {
      fullscreenByDefault: true,
      aliases: ['entrée'],
    });
    await h.api('POST', '/cameras/sync');
    const cameras = await h.api<Camera[]>('GET', '/cameras');
    expect(cameras.find((item) => item.id === porte.id)).toMatchObject({
      fullscreenByDefault: true,
      aliases: ['entrée'],
    });
  });

  it('opens a camera as set by the admin, without the model', async () => {
    const salon = await h.room('Salon');
    const events = await say('Montre-moi la porte', salon.id);
    expect(blocksOf(events)).toEqual([
      { type: 'camera', cameraId: porte.id, name: 'Porte', fullscreen: true },
    ]);
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.model).toBeNull();
    const card = blocksOf(await say('caméra salon', salon.id))[0];
    expect(card).toMatchObject({ type: 'camera', name: 'Caméra salon', fullscreen: false });
  });

  it('looks at a snapshot, answers, and never goes full screen nor keeps the image', async () => {
    const salon = await h.room('Salon');
    const events = await say('Qui est devant la porte ?', salon.id);
    expect(blocksOf(events)[0]).toMatchObject({ cameraId: porte.id, fullscreen: false });
    expect(answerOf(events)).toBe('Je vois une personne avec un colis devant la porte.');
    const trace = await h.api<Trace>('GET', `/traces/${requestIdOf(events)}`);
    expect(trace.model).toBe('mock-vision:latest');
    expect(JSON.stringify(trace)).not.toContain('/9j/');
  });

  it('teaches nothing to the cache', async () => {
    const salon = await h.room('Salon');
    await say('Qui est devant la porte ?', salon.id);
    const second = await say('Qui est devant la porte ?', salon.id);
    expect(second.some((event) => event.type === 'answer.done' && event.stats.cacheHit)).toBe(
      false,
    );
  });

  it('streams once per ticket and stops when the viewer leaves', async () => {
    const { fakeHomeAssistant, cameras } = h.container;
    const { url } = await cameras.issueTicket(porte.id);
    const viewer = new AbortController();
    const response = await fetch(`${h.baseUrl}${url}`, { signal: viewer.signal });
    expect(response.headers.get('content-type')).toContain('multipart/x-mixed-replace');
    expect(fakeHomeAssistant?.openStreams).toBe(1);
    expect((await fetch(`${h.baseUrl}${url}`)).status).toBe(401);
    viewer.abort();
    await vi.waitFor(() => expect(fakeHomeAssistant?.openStreams).toBe(0));
  });

  it('needs a tablet token to get a ticket', async () => {
    const response = await fetch(`${h.baseUrl}/api/v1/device/cameras/${porte.id}/ticket`, {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('hides a disabled camera from the sentences', async () => {
    await h.api('PATCH', `/cameras/${porte.id}`, { enabled: false });
    const salon = await h.room('Salon');
    expect(blocksOf(await say('Montre-moi la porte', salon.id))).toEqual([]);
    await h.api('PATCH', `/cameras/${porte.id}`, { enabled: true });
  });
});
