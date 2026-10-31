// Display web server: static files plus a narrow proxy to Core. No business logic, no
// dependency, so it stays well under the 300 MB budget of the N4020 mini PC.
import { createReadStream, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.AYKO_DISPLAY_PORT ?? 3200);
const host = process.env.AYKO_DISPLAY_HOST ?? '0.0.0.0';
const core = new URL(process.env.AYKO_CORE_URL ?? 'http://localhost:3100');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

/** Everything a tablet may reach. The admin API stays out of reach through this server. */
const PROXIED = [
  /^\/api\/v1\/pairing\/request$/,
  /^\/api\/v1\/pairing\/[0-9a-f-]{36}$/,
  /^\/api\/v1\/device\/(config|widgets|reports)$/,
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; connect-src 'self' ws: wss:",
};

function serveStatic(pathname, response) {
  const candidate = normalize(join(root, decodeURIComponent(pathname)));
  const inside = candidate === root || candidate.startsWith(root + sep);
  const isFile = inside && statSync(candidate, { throwIfNoEntry: false })?.isFile();
  const file = isFile ? candidate : join(root, 'index.html');
  const immutable = isFile && pathname.startsWith('/assets/');
  response.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(response);
}

function proxy(request, response) {
  const upstream = httpRequest(
    {
      host: core.hostname,
      port: core.port,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: core.host },
    },
    (reply) => {
      response.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'core_unavailable', message: 'Ayko Core ne répond pas' }));
  });
  request.pipe(upstream);
}

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://display');
  if (pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'display' }));
  } else if (PROXIED.some((pattern) => pattern.test(pathname))) {
    proxy(request, response);
  } else if (request.method === 'GET') {
    serveStatic(pathname, response);
  } else {
    response.writeHead(404);
    response.end();
  }
});

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url ?? '/', 'http://display');
  if (pathname !== '/ws/display') return socket.destroy();
  const upstream = connect(Number(core.port), core.hostname, () => {
    const headers = Object.entries(request.headers)
      .map(([name, value]) => `${name}: ${name === 'host' ? core.host : value}`)
      .join('\r\n');
    upstream.write(`GET ${request.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  return undefined;
});

server.listen(port, host, () => {
  console.log(`Ayko Display on ${host}:${port}, Core at ${core.origin}`);
});

const stop = () => server.close(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
