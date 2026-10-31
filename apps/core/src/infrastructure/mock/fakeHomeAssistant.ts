import { createServer, type Server, type ServerResponse } from 'node:http';

export const FAKE_HA_TOKEN = 'Bearer fake-home-assistant';

/** The smallest valid JPEG: enough for an `<img>` to count as loaded. */
const FRAME = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const BOUNDARY = 'frame';
const FRAME_INTERVAL_MS = 500;

const STATES = [
  { entity_id: 'camera.porte', attributes: { friendly_name: 'Porte' } },
  { entity_id: 'camera.salon', attributes: { friendly_name: 'Caméra salon' } },
  { entity_id: 'light.salon', attributes: { friendly_name: 'Lumière salon' } },
];

const writeFrame = (response: ServerResponse) => {
  response.write(`--${BOUNDARY}\r\ncontent-type: image/jpeg\r\n\r\n`);
  response.write(FRAME);
  response.write('\r\n');
};

/** Speaks the camera part of the Home Assistant REST API, like a real server would. */
export class FakeHomeAssistant {
  private readonly server: Server;
  /** Streams currently open, so tests can check that none outlives its viewer. */
  openStreams = 0;

  constructor() {
    this.server = createServer((request, response) => {
      if (request.headers.authorization !== FAKE_HA_TOKEN) {
        response.writeHead(401);
        return response.end();
      }
      const path = request.url ?? '/';
      if (path === '/api/states') {
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end(JSON.stringify(STATES));
      }
      if (path.startsWith('/api/camera_proxy_stream/')) return this.stream(response);
      if (path.startsWith('/api/camera_proxy/')) {
        response.writeHead(200, { 'content-type': 'image/jpeg' });
        return response.end(FRAME);
      }
      response.writeHead(404);
      return response.end();
    });
  }

  private stream(response: ServerResponse) {
    this.openStreams += 1;
    response.writeHead(200, {
      'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    });
    writeFrame(response);
    const timer = setInterval(() => writeFrame(response), FRAME_INTERVAL_MS);
    response.once('close', () => {
      clearInterval(timer);
      this.openStreams -= 1;
    });
  }

  listen() {
    return new Promise<number>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
  }

  close() {
    this.server.closeAllConnections();
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
