import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  CameraAccessRefused,
  type CameraProvider,
  type CameraSource,
} from '../../domain/cameras/CameraProvider.js';

/** Current and legacy paths of Home Assistant's MCP server. */
const HOME_ASSISTANT_MCP = /^\/(api\/mcp|mcp_server)\b/;

/** Its REST API sits on the same host and accepts the same long-lived token. */
export function homeAssistantSource(
  endpoints: { name: string; url: string; headers: Record<string, string> }[],
): CameraSource | null {
  const endpoint = endpoints.find(({ url }) => HOME_ASSISTANT_MCP.test(new URL(url).pathname));
  return endpoint ? { ...endpoint, url: new URL(endpoint.url).origin } : null;
}

const CONNECT_TIMEOUT_MS = 5000;
const SNAPSHOT_TIMEOUT_MS = 15_000;

/**
 * Home Assistant's REST API: the MCP server has no camera tool. `camera_proxy_stream` is an
 * MJPEG stream, which an `<img>` plays as is, whatever the camera speaks behind it. RTSP
 * would need a transcoder, as no browser reads it.
 */
export class HomeAssistantCameras implements CameraProvider {
  /** The timeout covers the headers only: a stream lasts as long as someone watches. */
  private async request(
    source: CameraSource,
    path: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error(`Home Assistant ne répond pas (${source.url})`)),
      timeoutMs,
    );
    try {
      const response = await fetch(`${source.url}${path}`, {
        headers: source.headers,
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new CameraAccessRefused('Jeton Home Assistant refusé');
      }
      if (!response.ok) throw new Error(`Home Assistant a répondu ${response.status}`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async list(source: CameraSource, signal?: AbortSignal) {
    const response = await this.request(source, '/api/states', CONNECT_TIMEOUT_MS, signal);
    const states = (await response.json()) as {
      entity_id: string;
      attributes?: { friendly_name?: string };
    }[];
    return states
      .filter((state) => state.entity_id.startsWith('camera.'))
      .map((state) => ({
        entityId: state.entity_id,
        name: state.attributes?.friendly_name ?? state.entity_id,
      }));
  }

  async snapshot(source: CameraSource, entityId: string, signal?: AbortSignal) {
    const response = await this.request(
      source,
      `/api/camera_proxy/${encodeURIComponent(entityId)}`,
      SNAPSHOT_TIMEOUT_MS,
      signal,
    );
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  async stream(source: CameraSource, entityId: string, signal: AbortSignal) {
    const response = await this.request(
      source,
      `/api/camera_proxy_stream/${encodeURIComponent(entityId)}`,
      SNAPSHOT_TIMEOUT_MS,
      signal,
    );
    if (!response.body) throw new Error('Flux vide');
    return {
      body: Readable.fromWeb(response.body as WebReadableStream),
      contentType: response.headers.get('content-type') ?? 'multipart/x-mixed-replace',
    };
  }
}
