import type { WebSocket } from 'ws';
import { displayClientMessage, type AgentEvent } from '@ayko/contracts';
import type { Container } from '../../container.js';
import type { DeviceRecord } from '../../domain/rooms/repositories/RoomRepository.js';

/** Translates agent events into the tablet protocol of spec section 6.1. */
function toFrame(event: AgentEvent) {
  switch (event.type) {
    case 'state.changed':
      return { type: event.type, requestId: event.requestId, payload: { state: event.state } };
    case 'activity.step': {
      const { type, requestId, ...payload } = event;
      return { type, requestId, payload };
    }
    case 'answer.delta':
      return {
        type: event.type,
        requestId: event.requestId,
        payload: { requestId: event.requestId, text: event.text },
      };
    case 'answer.blocks':
      return {
        type: event.type,
        requestId: event.requestId,
        payload: { requestId: event.requestId, blocks: event.blocks },
      };
    case 'answer.done':
      return {
        type: event.type,
        requestId: event.requestId,
        payload: { requestId: event.requestId, stats: event.stats },
      };
    case 'confirm.request': {
      const { type, requestId, ...payload } = event;
      return { type, requestId, payload };
    }
    case 'request.failed':
      return {
        type: 'system.notice',
        requestId: event.requestId,
        payload: { level: 'error', message: event.message },
      };
    default:
      return null;
  }
}

export function handleDisplaySocket(
  socket: WebSocket,
  device: DeviceRecord,
  { agent, hub, rooms, logger }: Container,
) {
  const ownRequests = new Set<string>();
  const ownConfirmations = new Set<string>();
  let sessionId: string | undefined;

  hub.attach(device.id, device.roomId, socket);
  void rooms.touchDevice(device.id);

  const send = (frame: Record<string, unknown>) => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify({ ...frame, room: device.roomId, ts: new Date().toISOString() }));
  };

  socket.on('message', (raw) => {
    let message;
    try {
      message = displayClientMessage.parse(JSON.parse(raw.toString()));
    } catch {
      send({
        type: 'system.notice',
        payload: { level: 'warn', message: 'Message invalide ignoré' },
      });
      return;
    }
    void rooms.touchDevice(device.id);
    switch (message.type) {
      case 'device.hello':
        void rooms.touchDevice(device.id, message.payload.version);
        break;
      case 'user.text':
        sessionId = message.payload.sessionId ?? sessionId;
        void agent.run(
          {
            text: message.payload.text,
            roomId: device.roomId,
            deviceId: device.id,
            conversationId: sessionId,
            source: 'display',
          },
          (event) => {
            if (event.type === 'request.accepted') {
              ownRequests.add(event.requestId);
              sessionId = event.conversationId;
            }
            if (event.type === 'confirm.request') ownConfirmations.add(event.confirmId);
            const frame = toFrame(event);
            if (frame) send(frame);
          },
        );
        break;
      case 'request.cancel':
        if (ownRequests.has(message.payload.requestId)) agent.cancel(message.payload.requestId);
        break;
      case 'confirm.answer':
        // A tablet can only answer what was asked of it, never another room's prompt.
        if (ownConfirmations.delete(message.payload.confirmId)) {
          agent.answerConfirmation(message.payload.confirmId, message.payload.accepted);
        }
        break;
      default:
        break;
    }
  });

  socket.on('close', () => {
    hub.detach(device.id, socket);
    void rooms.touchDevice(device.id);
    logger.log('debug', 'display', `Tablette ${device.name} déconnectée`, {
      roomId: device.roomId,
    });
  });
}
