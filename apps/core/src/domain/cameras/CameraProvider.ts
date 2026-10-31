import type { Readable } from 'node:stream';

/** Where a provider reads cameras; the token comes from the Home Assistant MCP server. */
export interface CameraSource {
  name: string;
  url: string;
  headers: Record<string, string>;
}

/** The source refused the token. Retrying could get the IP banned by Home Assistant. */
export class CameraAccessRefused extends Error {}

export interface CameraFrame {
  data: Buffer;
  contentType: string;
}

export interface CameraStream {
  body: Readable;
  contentType: string;
}

export interface CameraProvider {
  list(source: CameraSource, signal?: AbortSignal): Promise<{ entityId: string; name: string }[]>;
  snapshot(source: CameraSource, entityId: string, signal?: AbortSignal): Promise<CameraFrame>;
  stream(source: CameraSource, entityId: string, signal: AbortSignal): Promise<CameraStream>;
}
