/**
 * TRACKR Overlay — Express routes
 *
 * GET /overlay/main    → landscape overlay HTML
 * GET /overlay/tiktok  → portrait overlay HTML
 * GET /overlay/events  → SSE stream
 * POST /overlay/test   → emit test track_change event
 * POST /overlay/hide   → emit hide_card event
 */

import { Express, Request, Response } from 'express';
import { getTheme } from './themes/registry';
import { getThemeList } from './themes/registry';
import { sseHandler, emitTrackChange, emitShowCard, emitHideCard, emitConfigChanged } from './sse';
import { OverlaysConfig } from './types';

interface OverlayRouteDeps {
  getOverlaysConfig: () => OverlaysConfig;
  getApiBaseUrl: () => string;
  getLastTrack: () => { artist: string; title: string; label?: string; year?: number; artUrl?: string } | null;
}

export function registerOverlayRoutes(app: Express, deps: OverlayRouteDeps): void {

  // ── GET /overlay/events — SSE stream ──
  app.get('/overlay/events', sseHandler);

  // ── GET /overlay/themes — theme list for UI ──
  app.get('/overlay/themes', (_req: Request, res: Response) => {
    res.json(getThemeList());
  });

  // ── GET /overlay/main — landscape overlay page ──
  app.get('/overlay/main', (req: Request, res: Response) => {
    const config = deps.getOverlaysConfig();
    const theme = getTheme(config.main.theme);
    if (!theme) { res.status(404).send('Theme not found'); return; }

    const position = String(req.query['position'] ?? config.main.position);
    const duration = req.query['duration'] != null ? Number(req.query['duration']) : config.main.displayDuration;
    const preview = req.query['preview'] === 'true';

    const html = theme.render({
      position,
      transition: config.main.transition,
      displayDuration: duration,
      showLabel: config.main.showLabel,
      showYear: config.main.showYear,
      showArt: config.main.showArt,
      apiBaseUrl: deps.getApiBaseUrl(),
      preview,
    });

    res.type('html').send(html);
  });

  // ── GET /overlay/tiktok — portrait overlay page ──
  app.get('/overlay/tiktok', (req: Request, res: Response) => {
    const config = deps.getOverlaysConfig();
    const theme = getTheme(config.tiktok.theme);
    if (!theme) { res.status(404).send('Theme not found'); return; }

    const position = String(req.query['position'] ?? config.tiktok.position);
    const duration = req.query['duration'] != null ? Number(req.query['duration']) : config.tiktok.displayDuration;
    const preview = req.query['preview'] === 'true';

    const html = theme.render({
      position,
      transition: config.tiktok.transition,
      displayDuration: duration,
      showLabel: config.tiktok.showLabel,
      showYear: config.tiktok.showYear,
      showArt: config.tiktok.showArt,
      apiBaseUrl: deps.getApiBaseUrl(),
      preview,
    });

    res.type('html').send(html);
  });

  // ── POST /overlay/test — emit test event to all connected overlays ──
  app.post('/overlay/test', (_req: Request, res: Response) => {
    const lastTrack = deps.getLastTrack();
    const trackData = lastTrack ?? {
      artist: 'Luca Abayan',
      title: 'Prisma (Tonaco Extended Remix)',
      label: 'Colorize',
      year: 2025,
      artUrl: '',
    };
    // Cache-bust art URL so overlay fetches the latest image
    if (trackData.artUrl) trackData.artUrl += '?t=' + Date.now();
    emitTrackChange(trackData);
    res.json({ ok: true });
  });

  // ── POST /overlay/hide — hide overlay on all connected clients ──
  app.post('/overlay/hide', (_req: Request, res: Response) => {
    emitHideCard();
    res.json({ ok: true });
  });
}

// Re-export SSE emitters for use in main process
export { emitTrackChange, emitShowCard, emitHideCard, emitConfigChanged } from './sse';
