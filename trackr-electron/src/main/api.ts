/**
 * TRACKR Phase 4 — REST API
 *
 * Express server on port 8755 (config.apiPort).
 * 13 endpoints matching the Python TrackrCore HTTP API exactly.
 * Also serves the overlay/ directory as static files (replaces overlay-server.ts).
 *
 * Consumers:
 *   - Roonie-AI:       GET /health, GET /trackr
 *   - React frontend:  all endpoints via TrackrHttpCore (Phase 6)
 *   - OBS browser src: static GET / → trackr-current.html
 */

import express, { Express, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { networkInterfaces } from 'os';
import { Server } from 'http';

import { EM_DASH } from './cleaner';
import { TrackrConfig, OverlayStyle, OverlaysConfig, OutputRootResolution, DEFAULT_OVERLAY_STYLE, DEFAULT_OVERLAYS } from './store';
import { EnrichmentResult } from './enrichment/types';
import { registerOverlayRoutes } from './overlays/index';

// ─── types ───────────────────────────────────────────────────────────────────

export interface ApiDeps {
  // state
  isRunning:         () => boolean;
  isPlaybackActive:  () => boolean;
  lastPublishedLine: () => string | null;
  deviceCount:       () => number;
  deviceSummaries:   () => Array<{ name: string; count: number }>;
  playCount:         () => number;
  sharePlayCount:    () => boolean;
  sessionFileName:   () => string | null;
  sessionVersion:    () => number;
  overlayTxtPath:    () => string | null;
  overlayDir:        () => string | null;

  // config
  getConfig:         () => TrackrConfig;
  setConfig:         (partial: Record<string, unknown>) => TrackrConfig;

  // control
  controlStart:      () => { ok: boolean; needsUserChoice?: boolean };
  controlStop:       () => void;
  controlRefresh:    () => { ok: boolean; sessionFile?: string | null };

  // style
  getOverlayStyle:   () => OverlayStyle;
  setOverlayStyle:   (partial: Partial<OverlayStyle>) => OverlayStyle;

  // data
  resetPlayCounts:   () => void;
  getEnrichment:     () => EnrichmentResult | null;
  getArtPath:        (filename: string) => string | null;

  // output root
  resolveOutputRoot: () => OutputRootResolution;
  chooseOutputRoot:  (choice: 'legacy' | 'trackr') => OutputRootResolution;

  // overlays
  getOverlaysConfig: () => OverlaysConfig;
  setOverlaysConfig: (partial: Partial<OverlaysConfig>) => OverlaysConfig;
  getApiBaseUrl:     () => string;
  getLastTrack:      () => { artist: string; title: string; label?: string; year?: number; artUrl?: string } | null;
}

// ─── module state ────────────────────────────────────────────────────────────

let _server: Server | null = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectLanIp(): string {
  let fallback: string | null = null;
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      // Prefer RFC-1918 private ranges (skip Tailscale 100.x CGNAT)
      if (ip.startsWith('192.168.') || ip.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
        return ip;
      }
      if (!fallback) fallback = ip;
    }
  }
  return fallback ?? '127.0.0.1';
}

/** Converts the camelCase TrackrConfig to the snake_case shape the API exposes. */
function configToApi(cfg: TrackrConfig): Record<string, unknown> {
  return {
    output_root:               cfg.outputRoot,
    migration_prompt_seen:     cfg.migrationPromptSeen,
    delay_seconds:             cfg.delaySeconds,
    timestamps_enabled:        cfg.timestampsEnabled,
    strip_mix_labels:          cfg.stripMixLabels,
    api_enabled:               cfg.apiEnabled,
    share_play_count_via_api:  cfg.sharePlayCountViaApi,
    api_port:                  cfg.apiPort,
    start_with_windows:        cfg.startWithWindows,
    start_in_tray:             cfg.startInTray,
    enrichment_enabled:        cfg.enrichment.enabled,
    enrichment_beatport_username: cfg.enrichment.beatportUsername,
    api_enrichment_send_year:  cfg.apiEnrichment.sendYear,
    api_enrichment_send_label: cfg.apiEnrichment.sendLabel,
    api_enrichment_send_art:   cfg.apiEnrichment.sendArt,
    tracklist_include_year:    cfg.tracklistFormat.includeYear,
    tracklist_include_label:   cfg.tracklistFormat.includeLabel,
  };
}

/** Maps snake_case API POST /config body keys → camelCase store keys. */
function apiBodyToConfigPartial(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('output_root'              in raw) out.outputRoot             = raw.output_root;
  if ('migration_prompt_seen'    in raw) out.migrationPromptSeen    = raw.migration_prompt_seen;
  if ('delay_seconds'            in raw) out.delaySeconds           = raw.delay_seconds;
  if ('timestamps_enabled'       in raw) out.timestampsEnabled      = raw.timestamps_enabled;
  if ('strip_mix_labels'         in raw) out.stripMixLabels         = raw.strip_mix_labels;
  if ('api_enabled'              in raw) out.apiEnabled             = raw.api_enabled;
  if ('share_play_count_via_api' in raw) out.sharePlayCountViaApi   = raw.share_play_count_via_api;
  if ('api_port'                 in raw) out.apiPort                = raw.api_port;
  if ('start_with_windows'       in raw) out.startWithWindows       = raw.start_with_windows;
  if ('start_in_tray'            in raw) out.startInTray            = raw.start_in_tray;

  // Enrichment config — nested under store's `enrichment` key
  const enrichmentUpdates: Record<string, unknown> = {};
  if ('enrichment_enabled'           in raw) enrichmentUpdates.enabled          = raw.enrichment_enabled;
  if ('enrichment_beatport_username' in raw) enrichmentUpdates.beatportUsername  = raw.enrichment_beatport_username;
  if ('enrichment_beatport_password' in raw) enrichmentUpdates.beatportPassword  = raw.enrichment_beatport_password;
  if (Object.keys(enrichmentUpdates).length > 0) out.enrichment = enrichmentUpdates;

  // API enrichment send flags
  const apiEnrichmentUpdates: Record<string, unknown> = {};
  if ('api_enrichment_send_year'  in raw) apiEnrichmentUpdates.sendYear  = raw.api_enrichment_send_year;
  if ('api_enrichment_send_label' in raw) apiEnrichmentUpdates.sendLabel = raw.api_enrichment_send_label;
  if ('api_enrichment_send_art'   in raw) apiEnrichmentUpdates.sendArt   = raw.api_enrichment_send_art;
  if (Object.keys(apiEnrichmentUpdates).length > 0) out.apiEnrichment = apiEnrichmentUpdates;

  // Tracklist format
  const tracklistUpdates: Record<string, unknown> = {};
  if ('tracklist_include_year'  in raw) tracklistUpdates.includeYear  = raw.tracklist_include_year;
  if ('tracklist_include_label' in raw) tracklistUpdates.includeLabel = raw.tracklist_include_label;
  if (Object.keys(tracklistUpdates).length > 0) out.tracklistFormat = tracklistUpdates;

  return out;
}

/** Converts the camelCase OverlayStyle to the snake_case shape the API exposes. */
function styleToApi(s: OverlayStyle): Record<string, unknown> {
  return {
    font_family:        s.fontFamily,
    text_transform:     s.textTransform,
    letter_spacing:     s.letterSpacing,
    font_size:          s.fontSize,
    font_color:         s.fontColor,
    drop_shadow_on:     s.dropShadowOn,
    drop_shadow_x:      s.dropShadowX,
    drop_shadow_y:      s.dropShadowY,
    drop_shadow_blur:   s.dropShadowBlur,
    drop_shadow_color:  s.dropShadowColor,
    line_gap:           s.lineGap,
  };
}

/** Maps snake_case API POST /style body keys → camelCase OverlayStyle keys. */
function apiBodyToStylePartial(raw: Record<string, unknown>): Partial<OverlayStyle> {
  const out: Partial<OverlayStyle> = {};
  if ('font_family'       in raw) out.fontFamily      = String(raw.font_family);
  if ('text_transform'    in raw) out.textTransform    = raw.text_transform === 'none' ? 'none' : 'uppercase';
  if ('letter_spacing'    in raw) out.letterSpacing    = Number(raw.letter_spacing);
  if ('font_size'         in raw) out.fontSize         = Number(raw.font_size);
  if ('font_color'        in raw) out.fontColor        = String(raw.font_color);
  if ('drop_shadow_on'    in raw) out.dropShadowOn     = Boolean(raw.drop_shadow_on);
  if ('drop_shadow_x'     in raw) out.dropShadowX      = Number(raw.drop_shadow_x);
  if ('drop_shadow_y'     in raw) out.dropShadowY      = Number(raw.drop_shadow_y);
  if ('drop_shadow_blur'  in raw) out.dropShadowBlur   = Number(raw.drop_shadow_blur);
  if ('drop_shadow_color' in raw) out.dropShadowColor  = String(raw.drop_shadow_color);
  if ('line_gap'          in raw) out.lineGap           = Number(raw.line_gap);
  return out;
}

/** Read current + previous track from the 2-line overlay txt file. */
function readOverlayLines(overlayTxtPath: string | null): [string, string] {
  if (!overlayTxtPath || !existsSync(overlayTxtPath)) return [EM_DASH, EM_DASH];
  try {
    const raw   = readFileSync(overlayTxtPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const cur   = lines[0]?.trim() || EM_DASH;
    const prev  = lines[1]?.trim() || EM_DASH;
    return [cur, prev];
  } catch {
    return [EM_DASH, EM_DASH];
  }
}

// ─── app factory ─────────────────────────────────────────────────────────────

function buildApp(deps: ApiDeps): Express {
  const app = express();
  app.use(express.json());

  // CORS + OPTIONS preflight — single middleware, no wildcard route needed
  // (Express 5 no longer supports un-named '*' wildcards in route methods)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // ── GET /health ────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, is_running: deps.isRunning() });
  });

  // ── GET /trackr ──────────────────────────────────────────────────────────
  app.get('/trackr', (_req: Request, res: Response) => {
    const [current, previous] = readOverlayLines(deps.overlayTxtPath());
    const cfg = deps.getConfig();
    const payload: Record<string, unknown> = {
      current,
      previous,
      session_file:  deps.sessionFileName(),
      is_running:    deps.isRunning(),
      device_count:  deps.deviceCount(),
    };
    payload.play_count = deps.playCount();

    // Enrichment data — filtered by apiEnrichment send flags
    const enrichment = deps.getEnrichment();
    if (enrichment && enrichment.status === 'complete') {
      const e: Record<string, unknown> = { source: enrichment.source, status: enrichment.status };
      if (cfg.apiEnrichment.sendYear  && enrichment.year)   e.year  = enrichment.year;
      if (cfg.apiEnrichment.sendLabel && enrichment.label)  e.label = enrichment.label;
      if (cfg.apiEnrichment.sendArt   && enrichment.artFilename) e.art_url = '/art/current';
      if (enrichment.genre) e.genre = enrichment.genre;
      if (enrichment.bpm)   e.bpm   = enrichment.bpm;
      if (enrichment.key)   e.key   = enrichment.key;
      payload.enrichment = e;
    }

    res.json(payload);
  });

  // ── GET /status ────────────────────────────────────────────────────────────
  app.get('/status', (_req: Request, res: Response) => {
    const cfg = deps.getConfig();
    res.json({
      app_state:                deps.isRunning() ? 'running' : 'stopped',
      status_text:              deps.isRunning() ? 'running' : 'stopped',
      is_playback_active:       deps.isPlaybackActive(),
      device_count:             deps.deviceCount(),
      devices:                  deps.deviceSummaries(),
      last_published_line:      deps.lastPublishedLine(),
      session_file_name:        deps.sessionFileName(),
      session_version:          deps.sessionVersion(),
      lan_ip:                   detectLanIp(),
      api_port:                 cfg.apiEnabled ? cfg.apiPort : null,
      api_enabled:              cfg.apiEnabled,
      share_play_count_via_api: cfg.sharePlayCountViaApi,
      output_root:              cfg.outputRoot || null,
      migration_prompt_seen:    cfg.migrationPromptSeen,
      runtime_bridge:           'prolink-connect',
      start_with_windows:       cfg.startWithWindows,
      start_in_tray:            cfg.startInTray,
    });
  });

  // ── POST /control/start ────────────────────────────────────────────────────
  app.post('/control/start', (_req: Request, res: Response) => {
    const result = deps.controlStart();
    if (!result.ok && result.needsUserChoice) {
      res.status(409).json({
        ok: false,
        error: { code: 'needs_user_choice', message: 'output root choice required; call /output-root/choose' },
        needs_user_choice: true,
      });
      return;
    }
    res.json({ ok: result.ok });
  });

  // ── POST /control/stop ────────────────────────────────────────────────────
  app.post('/control/stop', (_req: Request, res: Response) => {
    deps.controlStop();
    res.json({ ok: true });
  });

  // ── POST /control/refresh ─────────────────────────────────────────────────
  app.post('/control/refresh', (_req: Request, res: Response) => {
    const result = deps.controlRefresh();
    if (!result.ok) {
      res.status(409).json({ ok: false, error: { code: 'not_initialized', message: 'not initialized' } });
      return;
    }
    res.json({ ok: true, session_file: result.sessionFile });
  });

  // ── POST /control/reset-play-counts ───────────────────────────────────────
  app.post('/control/reset-play-counts', (_req: Request, res: Response) => {
    deps.resetPlayCounts();
    res.json({ ok: true });
  });

  // ── GET /config ────────────────────────────────────────────────────────────
  app.get('/config', (_req: Request, res: Response) => {
    res.json(configToApi(deps.getConfig()));
  });

  // ── POST /config ───────────────────────────────────────────────────────────
  app.post('/config', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ ok: false, error: { code: 'invalid_request', message: 'request body must be a JSON object' } });
      return;
    }
    try {
      const partial  = apiBodyToConfigPartial(req.body as Record<string, unknown>);
      const updated  = deps.setConfig(partial);
      res.json(configToApi(updated));
    } catch (err) {
      res.status(400).json({ ok: false, error: { code: 'set_config_failed', message: String(err) } });
    }
  });

  // ── GET /style ───────────────────────────────────────────────────────────
  app.get('/style', (_req: Request, res: Response) => {
    res.json(styleToApi(deps.getOverlayStyle()));
  });

  // ── POST /style ──────────────────────────────────────────────────────────
  app.post('/style', (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ ok: false, error: { code: 'invalid_request', message: 'request body must be a JSON object' } });
      return;
    }
    try {
      const partial = apiBodyToStylePartial(req.body as Record<string, unknown>);
      const updated = deps.setOverlayStyle(partial);
      res.json(styleToApi(updated));
    } catch (err) {
      res.status(400).json({ ok: false, error: { code: 'set_style_failed', message: String(err) } });
    }
  });

  // ── GET /art/current ──────────────────────────────────────────────────────
  app.get('/art/current', (_req: Request, res: Response) => {
    const enrichment = deps.getEnrichment();
    if (!enrichment?.artFilename) { res.sendStatus(404); return; }
    const artPath = deps.getArtPath(enrichment.artFilename);
    if (!artPath) { res.sendStatus(404); return; }
    res.sendFile(artPath);
  });

  // ── GET /art/cache/:filename ──────────────────────────────────────────────
  app.get('/art/cache/:filename', (req: Request, res: Response) => {
    const filename = String(req.params['filename'] ?? '');
    if (!filename || /[/\\]|\.\./.test(filename)) { res.sendStatus(400); return; }
    const artPath = deps.getArtPath(filename);
    if (!artPath) { res.sendStatus(404); return; }
    res.sendFile(artPath);
  });

  // ── GET /output-root/resolve ───────────────────────────────────────────────
  app.get('/output-root/resolve', (_req: Request, res: Response) => {
    const resolution  = deps.resolveOutputRoot();
    const legacyExists = existsSync(resolution.legacyRoot);
    const payload: Record<string, unknown> = {
      needs_user_choice: resolution.state === 'needs_user_choice',
      legacy_exists:     legacyExists,
    };
    if (resolution.outputRoot) payload.chosen_output_root = resolution.outputRoot;
    res.json(payload);
  });

  // ── POST /output-root/choose ───────────────────────────────────────────────
  app.post('/output-root/choose', (req: Request, res: Response) => {
    const choice = req.body?.choice;
    if (choice !== 'legacy' && choice !== 'trackr') {
      res.status(400).json({ ok: false, error: { code: 'invalid_choice', message: "choice must be 'legacy' or 'trackr'" } });
      return;
    }
    const resolution = deps.chooseOutputRoot(choice);
    res.json({ state: resolution.state, output_root: resolution.outputRoot });
  });

  // ── Overlay system routes ──────────────────────────────────────────────────
  // Must be registered BEFORE the static catch-all below.
  registerOverlayRoutes(app, {
    getOverlaysConfig: () => deps.getOverlaysConfig(),
    getApiBaseUrl:     () => deps.getApiBaseUrl(),
    getLastTrack:      () => deps.getLastTrack(),
  });

  // ── Static file serving (overlay/) ────────────────────────────────────────
  // Catch-all: serves overlay/ directory for OBS browser source.
  // Must come last so API routes take priority.
  app.use((req: Request, res: Response) => {
    const dir = deps.overlayDir();
    if (!dir) { res.sendStatus(404); return; }

    const url    = (req.url ?? '/').split('?')[0];
    const file   = (url === '/' ? 'trackr-current.html' : url).replace(/^\/+/, '');
    const fpath  = resolvePath(join(dir, file));
    const absDir = resolvePath(dir);

    if (!fpath.startsWith(absDir) || !existsSync(fpath)) { res.sendStatus(404); return; }
    res.sendFile(fpath);
  });

  return app;
}

// ─── lifecycle ────────────────────────────────────────────────────────────────

export function startApiServer(deps: ApiDeps, port: number, bindHost: string): void {
  if (_server) stopApiServer();

  const app = buildApp(deps);
  const server = app.listen(port, bindHost, () => {
    console.log(`[api] http://${bindHost}:${port}/`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[api] Port ${port} already in use.`);
    } else {
      console.error('[api] Error:', err);
    }
    _server = null;
  });

  _server = server;
}

export function stopApiServer(): void {
  if (_server) {
    _server.close();
    _server = null;
    console.log('[api] Stopped.');
  }
}
