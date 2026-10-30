import {
  displayServerMessage,
  type DisplayClientMessage,
  type DisplayServerMessage,
} from '@ayko/contracts';

const HEARTBEAT_MS = 15_000;
const MAX_RETRY_MS = 10_000;
const UNAUTHORIZED = 4401;
const REPLACED = 4000;
const CLOSED_BY_ADMIN = 4001;

type Outgoing = DisplayClientMessage extends infer M
  ? M extends { type: infer T; payload: infer P }
    ? { type: T; payload: P }
    : never
  : never;

export interface SocketHandlers {
  onFrame(frame: DisplayServerMessage): void;
  onConnection(connected: boolean): void;
  /** The token is no longer valid: the tablet has to be paired again. */
  onRejected(): void;
  /** The admin moved the tablet to another room: its configuration changed. */
  onRoomChanged(): void;
}

/** Tablet link to Core, reconnecting on its own with a capped backoff. */
export class CoreSocket {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private retryMs = 1000;
  private stopped = false;

  constructor(
    private readonly token: string,
    private readonly room: string | null,
    private readonly version: string,
    private readonly handlers: SocketHandlers,
  ) {}

  start() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}/ws/display?token=${encodeURIComponent(this.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.retryMs = 1000;
      this.handlers.onConnection(true);
      this.send({
        type: 'device.hello',
        payload: { version: this.version, capabilities: ['text', 'blocks'] },
      });
      this.heartbeat = setInterval(
        () => this.send({ type: 'device.heartbeat', payload: {} }),
        HEARTBEAT_MS,
      );
    };

    socket.onmessage = (event) => {
      const parsed = displayServerMessage.safeParse(JSON.parse(event.data as string));
      if (parsed.success) this.handlers.onFrame(parsed.data);
    };

    socket.onclose = (event) => {
      clearInterval(this.heartbeat);
      this.handlers.onConnection(false);
      if (this.stopped || event.code === REPLACED) return;
      if (event.code === UNAUTHORIZED || event.reason === 'revoked') {
        this.handlers.onRejected();
        return;
      }
      if (event.code === CLOSED_BY_ADMIN) this.handlers.onRoomChanged();
      this.retryTimer = setTimeout(() => this.start(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    };
  }

  send(message: Outgoing) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ ...message, room: this.room, ts: new Date().toISOString() }));
    return true;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    this.socket?.close();
  }
}
