import { and, asc, eq, gt } from 'drizzle-orm';
import type { RoomConfig } from '@ayko/contracts';
import type {
  DeviceRecord,
  PairingRecord,
  RoomRecord,
  RoomRepository,
} from '../../../domain/rooms/repositories/RoomRepository.js';
import type { Db } from '../client.js';
import { devices, pairingRequests, rooms } from '../schema.js';

export class DrizzleRoomRepository implements RoomRepository {
  constructor(private readonly db: Db) {}

  async listRooms() {
    return this.db.select().from(rooms).orderBy(asc(rooms.name)).all();
  }

  async findRoom(id: string) {
    return this.db.select().from(rooms).where(eq(rooms.id, id)).get() ?? null;
  }

  async saveRoom(room: RoomRecord) {
    const { id: _id, createdAt: _createdAt, ...update } = room;
    this.db.insert(rooms).values(room).onConflictDoUpdate({ target: rooms.id, set: update }).run();
  }

  async deleteRoom(id: string) {
    return this.db.delete(rooms).where(eq(rooms.id, id)).run().changes > 0;
  }

  async updateRoomConfig(id: string, config: RoomConfig) {
    this.db.update(rooms).set({ config }).where(eq(rooms.id, id)).run();
  }

  async listDevices() {
    return this.db.select().from(devices).orderBy(asc(devices.name)).all();
  }

  async findDevice(id: string) {
    return this.db.select().from(devices).where(eq(devices.id, id)).get() ?? null;
  }

  async findDeviceByToken(tokenHash: string) {
    return this.db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).get() ?? null;
  }

  async saveDevice(device: DeviceRecord) {
    const { id: _id, createdAt: _createdAt, ...update } = device;
    this.db
      .insert(devices)
      .values(device)
      .onConflictDoUpdate({ target: devices.id, set: update })
      .run();
  }

  async deleteDevice(id: string) {
    return this.db.delete(devices).where(eq(devices.id, id)).run().changes > 0;
  }

  async touchDevice(id: string, nowIso: string, uiVersion?: string) {
    this.db
      .update(devices)
      .set({ lastSeenAt: nowIso, ...(uiVersion ? { uiVersion } : {}) })
      .where(eq(devices.id, id))
      .run();
  }

  async createPairing(pairing: PairingRecord) {
    this.db.insert(pairingRequests).values(pairing).run();
  }

  async findPairing(id: string) {
    return this.db.select().from(pairingRequests).where(eq(pairingRequests.id, id)).get() ?? null;
  }

  async findPendingByCode(code: string, nowIso: string) {
    return (
      this.db
        .select()
        .from(pairingRequests)
        .where(
          and(
            eq(pairingRequests.code, code),
            eq(pairingRequests.status, 'pending'),
            gt(pairingRequests.expiresAt, nowIso),
          ),
        )
        .get() ?? null
    );
  }

  async listPendingPairings(nowIso: string) {
    return this.db
      .select()
      .from(pairingRequests)
      .where(and(eq(pairingRequests.status, 'pending'), gt(pairingRequests.expiresAt, nowIso)))
      .all();
  }

  async updatePairing(id: string, patch: Partial<PairingRecord>) {
    this.db.update(pairingRequests).set(patch).where(eq(pairingRequests.id, id)).run();
  }
}
