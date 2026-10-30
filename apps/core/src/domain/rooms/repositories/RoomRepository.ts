import type { Device, Room, RoomConfig } from '@ayko/contracts';

export type RoomRecord = Omit<Room, 'deviceCount' | 'onlineCount'>;
export type DeviceRecord = Omit<Device, 'online' | 'roomName'> & { tokenHash: string };

export interface PairingRecord {
  id: string;
  code: string;
  deviceName: string | null;
  deviceId: string | null;
  deviceTokenCipher: string | null;
  status: 'pending' | 'confirmed' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface RoomRepository {
  listRooms(): Promise<RoomRecord[]>;
  findRoom(id: string): Promise<RoomRecord | null>;
  saveRoom(room: RoomRecord): Promise<void>;
  deleteRoom(id: string): Promise<boolean>;
  updateRoomConfig(id: string, config: RoomConfig): Promise<void>;
  listDevices(): Promise<DeviceRecord[]>;
  findDevice(id: string): Promise<DeviceRecord | null>;
  findDeviceByToken(tokenHash: string): Promise<DeviceRecord | null>;
  saveDevice(device: DeviceRecord): Promise<void>;
  deleteDevice(id: string): Promise<boolean>;
  touchDevice(id: string, nowIso: string, uiVersion?: string): Promise<void>;
  createPairing(pairing: PairingRecord): Promise<void>;
  findPairing(id: string): Promise<PairingRecord | null>;
  findPendingByCode(code: string, nowIso: string): Promise<PairingRecord | null>;
  listPendingPairings(nowIso: string): Promise<PairingRecord[]>;
  updatePairing(id: string, patch: Partial<PairingRecord>): Promise<void>;
}
