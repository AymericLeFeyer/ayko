import { randomBytes, randomUUID } from 'node:crypto';
import type { Camera, CameraSourceStatus, CameraUpdate } from '@ayko/contracts';
import {
  CameraAccessRefused,
  type CameraProvider,
  type CameraSource,
} from '../../domain/cameras/CameraProvider.js';
import type { CameraRepository } from '../../domain/cameras/repositories/CameraRepository.js';
import { parseCameraCommand } from '../../domain/cameras/services/cameraCommand.js';
import type { Logger } from '../../domain/system/Logger.js';
import { AppError, errorMessage, notFound, unauthorized } from '../../shared/errors.js';

const TICKET_TTL_MS = 30_000;

export type CameraRequest =
  | { intent: 'show' | 'look'; camera: Camera; fullscreen: boolean }
  /** No camera named and several to choose from. */
  | { intent: 'choose'; cameras: Camera[] };

const unavailable = (message: string) => new AppError('camera_unavailable', message, 503);

export class CameraService {
  private readonly tickets = new Map<string, { cameraId: string; expiresAt: number }>();
  private readonly lastShown = new Map<string, string>();
  private refused = false;

  constructor(
    private readonly repository: CameraRepository,
    private readonly provider: CameraProvider,
    private readonly findSource: () => Promise<CameraSource | null>,
    private readonly logger: Logger,
  ) {}

  list() {
    return this.repository.list();
  }

  async source(): Promise<CameraSourceStatus> {
    const source = await this.findSource();
    return { name: source?.name ?? null, url: source?.url ?? null, refused: this.refused };
  }

  /** One refused token stops every call: three 401 get an IP banned by Home Assistant. */
  private async guarded<T>(work: (source: CameraSource) => Promise<T>) {
    if (this.refused) {
      throw unavailable('Jeton Home Assistant refusé : synchronisez après correction');
    }
    const source = await this.findSource();
    if (!source) throw unavailable('Aucun serveur Home Assistant configuré');
    try {
      return await work(source);
    } catch (error) {
      if (!(error instanceof CameraAccessRefused)) throw error;
      this.refused = true;
      this.logger.log('error', 'cameras', error.message);
      throw unavailable(error.message);
    }
  }

  /** The admin's explicit retry. Choices already made on known cameras are kept. */
  async sync(signal?: AbortSignal) {
    this.refused = false;
    const remote = await this.guarded((source) => this.provider.list(source, signal));
    const stored = await this.repository.list();
    const now = new Date().toISOString();
    for (const { entityId, name } of remote) {
      if (stored.some((camera) => camera.entityId === entityId)) continue;
      await this.repository.save({
        id: randomUUID(),
        entityId,
        name,
        aliases: [],
        fullscreenByDefault: false,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const camera of stored) {
      if (!remote.some((item) => item.entityId === camera.entityId)) {
        await this.repository.delete(camera.id);
      }
    }
    return this.repository.list();
  }

  private async get(id: string) {
    const camera = await this.repository.find(id);
    if (!camera) throw notFound('Caméra');
    return camera;
  }

  async update(id: string, update: CameraUpdate) {
    const camera = { ...(await this.get(id)), ...update, updatedAt: new Date().toISOString() };
    await this.repository.save(camera);
    return camera;
  }

  /** What a sentence asks of the cameras, or null when it is none of their business. */
  async interpret(text: string, deviceId: string | null): Promise<CameraRequest | null> {
    const cameras = (await this.repository.list()).filter((camera) => camera.enabled);
    const command = parseCameraCommand(text, cameras);
    if (!command) return null;
    const last = cameras.find((item) => item.id === this.lastShown.get(deviceId ?? ''));
    const camera = command.camera ?? last ?? (cameras.length === 1 ? cameras[0] : undefined);
    if (!camera) return { intent: 'choose', cameras };
    this.lastShown.set(deviceId ?? '', camera.id);
    return {
      intent: command.intent,
      camera,
      fullscreen: command.intent === 'show' && (command.fullscreen || camera.fullscreenByDefault),
    };
  }

  async snapshot(id: string, signal?: AbortSignal) {
    const { entityId } = await this.get(id);
    return this.guarded((source) => this.provider.snapshot(source, entityId, signal));
  }

  async issueTicket(id: string) {
    const camera = await this.get(id);
    if (!camera.enabled) throw notFound('Caméra');
    const now = Date.now();
    for (const [key, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) this.tickets.delete(key);
    }
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, { cameraId: id, expiresAt: now + TICKET_TTL_MS });
    return { url: `/api/v1/device/cameras/${id}/stream?ticket=${ticket}` };
  }

  /** Spends the ticket. The stream ends with `signal`, that is, with its viewer. */
  async openStream(id: string, ticket: string, signal: AbortSignal) {
    const issued = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!issued || issued.cameraId !== id || issued.expiresAt <= Date.now()) throw unauthorized();
    const { entityId } = await this.get(id);
    return this.guarded((source) => this.provider.stream(source, entityId, signal)).catch(
      (error: unknown) => {
        this.logger.log('warn', 'cameras', `Flux indisponible : ${errorMessage(error)}`);
        throw error instanceof AppError ? error : unavailable(errorMessage(error));
      },
    );
  }
}
