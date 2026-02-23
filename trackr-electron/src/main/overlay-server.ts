/**
 * TRACKR — Overlay Static Server
 *
 * Minimal HTTP server that serves the overlay/ directory so OBS browser source
 * can fetch trackr-2-line.txt via HTTP instead of file:// (Chromium blocks
 * file:// → file:// fetch from JavaScript).
 *
 * Phase 4 (Express REST API) will replace this on the same port.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, resolve } from 'path';

let _server: Server | null = null;

const MIME: Record<string, string> = {
  '.txt':  'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
};

export function startOverlayServer(overlayDir: string, port: number): void {
  // Stop existing server if restarting with a new overlay dir
  if (_server) stopOverlayServer();

  const absOverlayDir = resolve(overlayDir);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url   = (req.url ?? '/').split('?')[0];
    const file  = (url === '/' ? 'trackr-obs.html' : url).replace(/^\/+/, '');
    const fpath = join(absOverlayDir, file);

    // Path traversal guard
    if (!resolve(fpath).startsWith(absOverlayDir) || !existsSync(fpath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type':                MIME[extname(fpath)] ?? 'application/octet-stream',
      'Cache-Control':               'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(readFileSync(fpath));
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[overlay-server] Port ${port} already in use — overlay HTTP not started.`);
    } else {
      console.error('[overlay-server] Error:', err);
    }
    _server = null;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[overlay-server] http://127.0.0.1:${port}/ → ${absOverlayDir}`);
  });

  _server = server;
}

export function stopOverlayServer(): void {
  if (_server) {
    _server.close();
    _server = null;
    console.log('[overlay-server] Stopped.');
  }
}
