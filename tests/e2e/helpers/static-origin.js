import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

// Serves the repository as a static site from a throwaway loopback port, so a test can make the
// app's own origin go away (which is what "offline" means to a service worker) without touching
// the shared server the rest of the suite runs against. Pages must be opened through the
// returned `origin` (host `localhost`, see the note on service-worker traffic in the caller).
// `overrides` maps a pathname (e.g. '/sw.js') to a body served instead of the file; it is returned
// so a test can change it while the origin is up (e.g. to deploy a new service worker).
export async function startStaticOrigin({ overrides = {} } = {}) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (Object.prototype.hasOwnProperty.call(overrides, url.pathname)) {
      response.writeHead(200, {
        'content-type': TYPES[path.extname(url.pathname)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(overrides[url.pathname]);
      return;
    }
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end();
      return;
    }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (error, body) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://localhost:${port}`,
    overrides,
    stop: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    })
  };
}
