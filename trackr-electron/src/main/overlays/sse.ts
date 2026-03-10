/**
 * TRACKR Overlay — Server-Sent Events manager
 *
 * Manages SSE connections for overlay pages. Multiple clients can connect
 * simultaneously (main + tiktok overlays + preview iframes).
 */

import { Request, Response } from 'express';

// ─── types ───────────────────────────────────────────────────────────────────

export interface TrackChangeData {
  artist: string;
  title: string;
  label?: string;
  year?: number;
  artUrl?: string;
  deck?: number;
}

export interface ShowCardData {
  trigger: 'chat_command' | 'test' | 'api';
  user?: string;
}

// ─── client registry ─────────────────────────────────────────────────────────

const _clients = new Set<Response>();

/** SSE route handler — GET /overlay/events */
export function sseHandler(_req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial comment to establish connection
  res.write(':ok\n\n');

  _clients.add(res);

  _req.on('close', () => {
    _clients.delete(res);
  });
}

// ─── emit helpers ────────────────────────────────────────────────────────────

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of _clients) {
    client.write(payload);
  }
}

export function emitTrackChange(data: TrackChangeData): void {
  broadcast('track_change', data);
}

export function emitShowCard(data: ShowCardData): void {
  broadcast('show_card', data);
}

export function emitHideCard(): void {
  broadcast('hide_card', {});
}

export function emitConfigChanged(target?: string): void {
  broadcast('config_changed', { target: target ?? 'all' });
}

export function getClientCount(): number {
  return _clients.size;
}
