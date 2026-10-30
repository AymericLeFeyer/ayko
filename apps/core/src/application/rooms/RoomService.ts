import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  roomConfig,
  type Device,
  type DeviceCommand,
  type DeviceUpdate,
  type PairingConfirm,
  type PairingCreated,
  type PairingPoll,
  type Room,
  type RoomInput,
} from '@ayko/contracts';
import type {
  DeviceRecord,
  RoomRecord,
  RoomRepository,
} from '../../domain/rooms/repositories/RoomRepository.js';
import type { Logger } from '../../domain/system/Logger.js';
import type { Vault } from '../../domain/system/Vault.js';
import { stripAccents } from '../../domain/cache/services/normalizeText.js';
import { AppError, conflict, notFound } from '../../shared/errors.js';
import { hashToken } from '../identity/AuthService.js';
import type { EventBus } from '../system/EventBus.js';
import type { DeviceHub } from './DeviceHub.js';

const PAIRING_TTL_MS = 10 * 60_000;

const slugify = (name: string) =>
  stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export class RoomService {
  private onRoomDeleted: (roomId: string) => Promise<void> = async () => {};

  constructor(
    private readonly repository: RoomRepository,
    private readonly vault: Vault,
    private readonly hub: DeviceHub,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}

  bindInvalidation(hook: (roomId: string) => Promise<void>) {
    this.onRoomDeleted = hook;
  }

  private toRoom(record: RoomRecord, devices: DeviceRecord[]): Room {
    const own = devices.filter((device) => device.roomId === record.id && !device.revoked);
    return {
      ...record,
      // Rows written before a new setting existed get its default.
      config: roomConfig.parse(record.config),
      deviceCount: own.length,
      onlineCount: own.filter((device) => this.hub.isOnline(device.id)).length,
    };
  }

  async listRooms() {
    const [rooms, devices] = await Promise.all([
      this.repository.listRooms(),
      this.repository.listDevices(),
    ]);
    return rooms.map((room) => this.toRoom(room, devices));
  }

  async getRoom(id: string) {
    const room = await this.repository.findRoom(id);
    if (!room) throw notFound('Pièce');
    return this.toRoom(room, await this.repository.listDevices());
  }

  async createRoom(input: RoomInput) {
    const record: RoomRecord = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      icon: input.icon ?? 'home',
      config: roomConfig.parse(input.config ?? {}),
      createdAt: new Date().toISOString(),
    };
    const rooms = await this.repository.listRooms();
    if (rooms.some((room) => room.slug === record.slug)) {
      throw conflict('Une pièce porte déjà cet identifiant');
    }
    await this.repository.saveRoom(record);
    return this.toRoom(record, []);
  }

  async updateRoom(id: string, input: Partial<RoomInput>) {
    const current = await this.repository.findRoom(id);
    if (!current) throw notFound('Pièce');
    const record: RoomRecord = {
      ...current,
      name: input.name ?? current.name,
      slug: input.slug ?? current.slug,
      icon: input.icon ?? current.icon,
      config: roomConfig.parse({ ...current.config, ...input.config }),
    };
    await this.repository.saveRoom(record);
    this.hub.broadcastRoom(id, { type: 'config.updated', payload: { roomConfig: record.config } });
    return this.getRoom(id);
  }

  async deleteRoom(id: string) {
    await this.onRoomDeleted(id);
    if (!(await this.repository.deleteRoom(id))) throw notFound('Pièce');
    this.bus.publish({ topic: 'devices.changed' });
  }

  /** Persona edits reach tablets without a reload (acceptance criterion of phase 4). */
  async broadcastConfigs() {
    for (const room of await this.repository.listRooms()) {
      this.hub.broadcastRoom(room.id, {
        type: 'config.updated',
        payload: { roomConfig: roomConfig.parse(room.config) },
      });
    }
  }

  async listDevices(): Promise<Device[]> {
    const [devices, rooms] = await Promise.all([
      this.repository.listDevices(),
      this.repository.listRooms(),
    ]);
    return devices.map(({ tokenHash: _hash, ...device }) => ({
      ...device,
      roomName: rooms.find((room) => room.id === device.roomId)?.name ?? null,
      online: this.hub.isOnline(device.id),
    }));
  }

  async getDevice(id: string) {
    const device = (await this.listDevices()).find((item) => item.id === id);
    if (!device) throw notFound('Tablette');
    return device;
  }

  async updateDevice(id: string, update: DeviceUpdate) {
    const current = await this.repository.findDevice(id);
    if (!current) throw notFound('Tablette');
    await this.repository.saveDevice({ ...current, ...update });
    if (update.revoked) this.hub.disconnect(id, 'revoked');
    else if (update.roomId !== undefined && update.roomId !== current.roomId) {
      this.hub.disconnect(id, 'room_changed');
    }
    this.bus.publish({ topic: 'devices.changed' });
    return this.getDevice(id);
  }

  async deleteDevice(id: string) {
    this.hub.disconnect(id, 'revoked');
    if (!(await this.repository.deleteDevice(id))) throw notFound('Tablette');
    this.bus.publish({ topic: 'devices.changed' });
  }

  async sendCommand(id: string, { command }: DeviceCommand) {
    await this.getDevice(id);
    if (!this.hub.send(id, { type: 'device.command', payload: { command } })) {
      throw new AppError('device_offline', 'Tablette hors ligne', 409);
    }
  }

  async authenticateDevice(token: string) {
    const device = await this.repository.findDeviceByToken(hashToken(token));
    return device && !device.revoked ? device : null;
  }

  touchDevice(id: string, uiVersion?: string) {
    return this.repository.touchDevice(id, new Date().toISOString(), uiVersion);
  }

  async requestPairing(deviceName?: string): Promise<PairingCreated> {
    const now = new Date();
    const pending = await this.repository.listPendingPairings(now.toISOString());
    let code: string;
    do {
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    } while (pending.some((item) => item.code === code));
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
    const pairingId = randomUUID();
    await this.repository.createPairing({
      id: pairingId,
      code,
      deviceName: deviceName ?? null,
      deviceId: null,
      deviceTokenCipher: null,
      status: 'pending',
      expiresAt,
      createdAt: now.toISOString(),
    });
    this.bus.publish({ topic: 'pairing.changed' });
    return { pairingId, code, expiresAt };
  }

  async listPendingPairings() {
    const pending = await this.repository.listPendingPairings(new Date().toISOString());
    return pending.map(({ id, code, deviceName, expiresAt }) => ({
      pairingId: id,
      code,
      deviceName,
      expiresAt,
    }));
  }

  async confirmPairing({ code, roomId, deviceName }: PairingConfirm) {
    const pairing = await this.repository.findPendingByCode(code, new Date().toISOString());
    if (!pairing) throw new AppError('invalid_code', 'Code invalide ou expiré', 404);
    await this.getRoom(roomId);
    const token = randomBytes(32).toString('base64url');
    const deviceId = randomUUID();
    await this.repository.saveDevice({
      id: deviceId,
      name: deviceName ?? pairing.deviceName ?? `Tablette ${code.slice(0, 3)}`,
      roomId,
      tokenHash: hashToken(token),
      lastSeenAt: null,
      uiVersion: null,
      revoked: false,
      createdAt: new Date().toISOString(),
    });
    await this.repository.updatePairing(pairing.id, {
      status: 'confirmed',
      deviceId,
      deviceTokenCipher: this.vault.encrypt(token),
    });
    this.logger.log('info', 'rooms', `Tablette appairée (${code})`, { roomId });
    this.bus.publish({ topic: 'pairing.changed' });
    this.bus.publish({ topic: 'devices.changed' });
    return this.getDevice(deviceId);
  }

  async pollPairing(id: string): Promise<PairingPoll> {
    const pairing = await this.repository.findPairing(id);
    if (!pairing) throw notFound('Appairage');
    if (pairing.status === 'confirmed') {
      const cipher = pairing.deviceTokenCipher;
      if (cipher) await this.repository.updatePairing(id, { deviceTokenCipher: null });
      return {
        status: 'confirmed',
        deviceToken: cipher ? this.vault.decrypt(cipher) : null,
        deviceId: pairing.deviceId,
      };
    }
    const expired = pairing.expiresAt < new Date().toISOString();
    return { status: expired ? 'expired' : 'pending', deviceToken: null, deviceId: null };
  }

  /** Short context fragment listing the tablets the agent knows about in a room. */
  async describeRoom(roomId: string | null) {
    if (!roomId) return { name: null, config: null, devices: [] as string[] };
    const room = await this.repository.findRoom(roomId);
    if (!room) return { name: null, config: null, devices: [] as string[] };
    const devices = (await this.listDevices()).filter((item) => item.roomId === roomId);
    return {
      name: room.name,
      config: room.config,
      devices: devices.map((item) => `${item.name} (${item.online ? 'en ligne' : 'hors ligne'})`),
    };
  }
}
