import type { FastifyInstance } from 'fastify';
import {
  deviceCommand,
  deviceUpdate,
  pairingConfirm,
  pairingRequestBody,
  roomInput,
} from '@ayko/contracts';
import type { Container } from '../../../container.js';
import { unauthorized } from '../../../shared/errors.js';
import { body, param } from '../support.js';

export function publicRoomRoutes(app: FastifyInstance, { rooms }: Container) {
  app.post(
    '/pairing/request',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    (request) => rooms.requestPairing(body(pairingRequestBody, request).deviceName),
  );
  app.get('/pairing/:id', (request) => rooms.pollPairing(param(request)));

  /** Device-token scope: a tablet can read its own configuration and nothing else. */
  app.get('/device/config', async (request) => {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const device = await rooms.authenticateDevice(token);
    if (!device) throw unauthorized();
    return {
      deviceId: device.id,
      room: device.roomId ? await rooms.getRoom(device.roomId) : null,
    };
  });
}

export function adminRoomRoutes(app: FastifyInstance, { rooms }: Container) {
  app.get('/pairing/pending', () => rooms.listPendingPairings());
  app.post('/pairing/confirm', (request) => rooms.confirmPairing(body(pairingConfirm, request)));

  app.get('/rooms', () => rooms.listRooms());
  app.post('/rooms', (request) => rooms.createRoom(body(roomInput, request)));
  app.get('/rooms/:id', (request) => rooms.getRoom(param(request)));
  app.patch('/rooms/:id', (request) =>
    rooms.updateRoom(param(request), body(roomInput.partial(), request)),
  );
  app.delete('/rooms/:id', async (request) => {
    await rooms.deleteRoom(param(request));
    return { ok: true };
  });

  app.get('/devices', () => rooms.listDevices());
  app.get('/devices/:id', (request) => rooms.getDevice(param(request)));
  app.patch('/devices/:id', (request) =>
    rooms.updateDevice(param(request), body(deviceUpdate, request)),
  );
  app.delete('/devices/:id', async (request) => {
    await rooms.deleteDevice(param(request));
    return { ok: true };
  });
  app.post('/devices/:id/command', async (request) => {
    await rooms.sendCommand(param(request), body(deviceCommand, request));
    return { ok: true };
  });
}
