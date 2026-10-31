import { randomUUID } from 'node:crypto';
import type { Trace } from '@ayko/contracts';
import type { ConversationRepository } from '../../domain/conversation/repositories/ConversationRepository.js';
import type { ReportRepository } from '../../domain/conversation/repositories/ReportRepository.js';
import type { DeviceRecord } from '../../domain/rooms/repositories/RoomRepository.js';
import { notFound } from '../../shared/errors.js';
import type { RoomService } from '../rooms/RoomService.js';

const REPORTED_EXCHANGES = 4;

/** Keeps the odd exchanges a user flags from a tablet, for later analysis. */
export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly conversations: ConversationRepository,
    private readonly rooms: RoomService,
  ) {}

  async create(device: DeviceRecord) {
    const recent = await this.conversations.recentRequests(device.id, REPORTED_EXCHANGES);
    // An older conversation of the same tablet has nothing to do with what just went wrong.
    const conversationId = recent.at(-1)?.conversationId;
    const ids = recent.filter((item) => item.conversationId === conversationId);
    const found = await Promise.all(ids.map(({ id }) => this.conversations.findTrace(id)));
    const traces = found.filter((trace): trace is Trace => trace !== null);
    if (traces.length === 0) throw notFound('Échange');

    const id = randomUUID();
    const room = await this.rooms.describeRoom(device.roomId);
    await this.repository.create({
      id,
      deviceId: device.id,
      deviceName: device.name,
      roomName: room.name,
      traces,
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  list(limit: number) {
    return this.repository.list(limit);
  }

  delete(id: string) {
    return this.repository.delete(id);
  }
}
