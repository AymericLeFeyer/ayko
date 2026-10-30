import type { DisplayServerMessage } from '@ayko/contracts';
import type { EventBus } from '../system/EventBus.js';

export interface DeviceSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type Frame = DisplayServerMessage extends infer M
  ? M extends { type: infer T; payload: infer P }
    ? { type: T; payload: P; requestId?: string }
    : never
  : never;

/** Live tablet connections; "online" means a socket is open, not a recent timestamp. */
export class DeviceHub {
  private readonly sockets = new Map<string, { socket: DeviceSocket; roomId: string | null }>();

  constructor(private readonly bus: EventBus) {}

  attach(deviceId: string, roomId: string | null, socket: DeviceSocket) {
    this.sockets.get(deviceId)?.socket.close(4000, 'replaced');
    this.sockets.set(deviceId, { socket, roomId });
    this.bus.publish({ topic: 'devices.changed' });
  }

  detach(deviceId: string, socket: DeviceSocket) {
    if (this.sockets.get(deviceId)?.socket === socket) {
      this.sockets.delete(deviceId);
      this.bus.publish({ topic: 'devices.changed' });
    }
  }

  isOnline(deviceId: string) {
    return this.sockets.has(deviceId);
  }

  get onlineCount() {
    return this.sockets.size;
  }

  send(deviceId: string, frame: Frame) {
    const target = this.sockets.get(deviceId);
    if (!target) return false;
    target.socket.send(
      JSON.stringify({ ...frame, room: target.roomId, ts: new Date().toISOString() }),
    );
    return true;
  }

  broadcastRoom(roomId: string, frame: Frame) {
    for (const [deviceId, target] of this.sockets) {
      if (target.roomId === roomId) this.send(deviceId, frame);
    }
  }

  /** Revocation or re-assignment takes effect immediately, not at the next reconnect. */
  disconnect(deviceId: string, reason: string) {
    this.sockets.get(deviceId)?.socket.close(4001, reason);
  }
}
