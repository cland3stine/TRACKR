/**
 * TRACKR Phase 4 — REST API
 *
 * Express server on port 8755 (config.apiPort).
 * 13 endpoints matching the Python TrackrCore HTTP API exactly.
 * Also serves the overlay/ directory as static files (replaces overlay-server.ts).
 *
 * Consumers:
 *   - Roonie-AI:       GET /health, GET /nowplaying
 *   - React frontend:  all endpoints via TrackrHttpCore (Phase 6)
 *   - OBS browser src: static GET / → trackr-obs.html
 */

import express, { Express, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join, resolve as resolvePath } from 'path';
import { networkInterfaces } from 'os';
import { Server } from 'http';

import { EM_DASH } from './cleaner';
import { TrackrConfig, OutputRootResolution } from './store';

// ─── types ───────────────────────────────────────────────────────────────────

export interface ApiDeps {
  // state
  isRunning:         () => boolean;
  lastPublishedLine: () => string | null;
  deviceCount:       () => number;
  deviceSummaries:   () => Array<{ name: string; count: number }>;
  playCount:         () => number;
  sharePlayCount:    () => boolean;
  sessionFileName:   () => string | null;
  overlayTxtPath:    () => string | null;
  overlayDir:        () => string | null;

  // config
  getConfig:         () => TrackrConfig;
  setConfig:         (partial: Record<string, unknown>) => TrackrConfig;

  // control
  controlStart:      () => { ok: boolean; needsUserChoice?: boolean };
  controlStop:       () => void;
  controlRefresh:    () => { ok: boolean; sessionFile?: string | null };

  // template
  getTemplate:       () => string;
  setTemplate:       (html: string) => void;
  resetTemplate:     () => string;

  // output root
  resolveOutputRoot: () => OutputRootResolution;
  chooseOutputRoot:  (choice: 'legacy' | 'trackr') => OutputRootResolution;
}

// ─── module state ────────────────────────────────────────────────────────────

let _server: Server | null = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectLanIp(): string {
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
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
    api_access_mode:           cfg.apiAccessMode,
    share_play_count_via_api:  cfg.sharePlayCountViaApi,
    api_port:                  cfg.apiPort,
    start_with_windows:        cfg.startWithWindows,
    start_in_tray:             cfg.startInTray,
  };
}

/** Maps snake_case API POST /config body keys → camelCase store keys. */
function apiBodyToConfigPartial(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('delay_seconds'            in raw) out.delaySeconds          = raw.delay_seconds;
  if ('timestamps_enabled'       in raw) out.timestampsEnabled     = raw.timestamps_enabled;
  if ('strip_mix_labels'         in raw) out.stripMixLabels        = raw.strip_mix_labels;
  if ('api_enabled'              in raw) out.apiEnabled            = raw.api_enabled;
  if ('api_access_mode'          in raw) out.apiAccessMode         = raw.api_access_mode;
  if ('share_play_count_via_api' in raw) out.sharePlayCountViaApi  = raw.share_play_count_via_api;
  if ('api_port'                 in raw) out.apiPort               = raw.api_port;
  if ('start_with_windows'       in raw) out.startWithWindows      = raw.start_with_windows;
  if ('start_in_tray'            in raw) out.startInTray           = raw.start_in_tray;
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

  // ── GET /nowplaying ────────────────────────────────────────────────────────
  app.get('/nowplaying', (_req: Request, res: Response) => {
    const [current, previous] = readOverlayLines(deps.overlayTxtPath());
    const payload: Record<string, unknown> = {
      current,
      previous,
      session_file:  deps.sessionFileName(),
      is_running:    deps.isRunning(),
      device_count:  deps.deviceCount(),
    };
    if (deps.sharePlayCount()) payload.play_count = deps.playCount();
    res.json(payload);
  });

  // ── GET /status ────────────────────────────────────────────────────────────
  app.get('/status', (_req: Request, res: Response) => {
    const cfg = deps.getConfig();
    res.json({
      app_state:                deps.isRunning() ? 'running' : 'stopped',
      status_text:              deps.isRunning() ? 'running' : 'stopped',
      device_count:             deps.deviceCount(),
      devices:                  deps.deviceSummaries(),
      last_published_line:      deps.lastPublishedLine(),
      session_file_name:        deps.sessionFileName(),
      api_effective_bind_host:  cfg.apiEnabled ? (cfg.apiAccessMode === 'localhost' ? '127.0.0.1' : '0.0.0.0') : null,
      lan_ip:                   detectLanIp(),
      api_port:                 cfg.apiEnabled ? cfg.apiPort : null,
      api_enabled:              cfg.apiEnabled,
      api_access_mode:          cfg.apiAccessMode,
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

  // ── GET /template ──────────────────────────────────────────────────────────
  app.get('/template', (_req: Request, res: Response) => {
    if (deps.resolveOutputRoot().state === 'needs_user_choice') {
      res.status(409).json({ ok: false, error: { code: 'needs_user_choice', message: 'output root choice required before template operations' }, needs_user_choice: true });
      return;
    }
    res.json({ template: deps.getTemplate() });
  });

  // ── POST /template ─────────────────────────────────────────────────────────
  app.post('/template', (req: Request, res: Response) => {
    if (deps.resolveOutputRoot().state === 'needs_user_choice') {
      res.status(409).json({ ok: false, error: { code: 'needs_user_choice', message: 'output root choice required before template operations' }, needs_user_choice: true });
      return;
    }
    const html = req.body?.template;
    if (typeof html !== 'string') {
      res.status(400).json({ ok: false, error: { code: 'invalid_template', message: 'template must be a string' } });
      return;
    }
    try {
      deps.setTemplate(html);
      res.json({ template: html });
    } catch (err) {
      res.status(400).json({ ok: false, error: { code: 'invalid_template', message: String(err) } });
    }
  });

  // ── POST /template/reset ───────────────────────────────────────────────────
  app.post('/template/reset', (_req: Request, res: Response) => {
    if (deps.resolveOutputRoot().state === 'needs_user_choice') {
      res.status(409).json({ ok: false, error: { code: 'needs_user_choice', message: 'output root choice required before template operations' }, needs_user_choice: true });
      return;
    }
    res.json({ template: deps.resetTemplate() });
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

  // ── Static file serving (overlay/) ────────────────────────────────────────
  // Catch-all: serves overlay/ directory for OBS browser source.
  // Must come last so API routes take priority.
  app.use((req: Request, res: Response) => {
    const dir = deps.overlayDir();
    if (!dir) { res.sendStatus(404); return; }

    const url    = (req.url ?? '/').split('?')[0];
    const file   = (url === '/' ? 'trackr-obs.html' : url).replace(/^\/+/, '');
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
