import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, screen } from 'electron';
import path from 'path';
import Store from 'electron-store';

// ─── global safety net ──────────────────────────────────────────────────────
// prolink-connect's internal UDP socket handler throws on malformed packets
// (e.g. "Announce packet does not start with expected header"). These bubble
// up as uncaught exceptions that crash the app. Catch and log them instead.
process.on('uncaughtException', (err) => {
  const msg = err?.message ?? String(err);
  // Known prolink-connect UDP parsing errors — log and continue
  if (msg.includes('does not start with expected header') ||
      msg.includes('Announce packet') ||
      msg.includes('Status packet')) {
    console.warn('[main] prolink-connect packet parse error (ignored):', msg);
    return;
  }
  // Unknown exception — log it but don't crash during a live set
  console.error('[main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
});

import {
  startProlink, stopProlink, getDeviceCount, getDeviceSummaries,
  setPublishCallback, setPublishDelay, isPlaybackActive, setOnSetEnded,
  resetLastPublished, enableFastFirstTrack, cancelPending,
} from './prolink';
import { OutputWriter }      from './output';
import { TrackrDatabase }    from './database';
import {
  getConfig, setConfig, resolveOutputRoot, persistOutputRootChoice, getEffectiveBindHost,
  DEFAULT_OVERLAY_STYLE, OverlayStyle,
} from './store';
import { startApiServer, stopApiServer, detectLanIp, ApiDeps } from './api';
import { emitTrackChange, emitConfigChanged } from './overlays/index';
import { startChatListener, stopChatListener, updateChatConfig } from './overlays/chat';
import { createTray, refreshTray, destroyTray, TrayCallbacks } from './tray';
import { autoUpdater } from 'electron-updater';
import {
  splitTrackLine, enrichTrack, initEnrichment, resetEnrichmentSession,
  testConnection, rowToResult,
} from './enrichment/enricher';
import { ArtCache } from './enrichment/art-cache';
import { EnrichmentResult } from './enrichment/types';

// Enforce single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ─── runtime state ───────────────────────────────────────────────────────────

let mainWindow:    BrowserWindow  | null = null;
let _tray:         Tray           | null = null;
let db:            TrackrDatabase | null = null;
let outputWriter:  OutputWriter   | null = null;
let artCache:      ArtCache       | null = null;
let _isRunning = false;
let _lastPublishedLine: string | null = null;
let _lastTrackPlayCount = 0;   // per-track lifetime play count for badge
let _sessionVersion = 0;       // increments on every new session
let _forceQuit = false;  // set by tray "Quit" to allow real exit
let _currentSessionId: number | null = null;  // active session in DB

// ─── helpers ─────────────────────────────────────────────────────────────────

const SHORT_SESSION_THRESHOLD = 3;

/** Purge sessions with fewer than 3 tracks — deletes the file and decrements play counts. */
function maybePurgeShortSession(): void {
  if (!outputWriter || !db) return;
  const entries = outputWriter.getRunningEntries();
  if (entries.length === 0 || entries.length >= SHORT_SESSION_THRESHOLD) return;

  for (const entry of entries) {
    const parts = splitTrackLine(entry.line);
    if (parts) db.decrementTrackPlayCount(parts[0], parts[1]);
  }

  // Also purge the session from the DB
  if (_currentSessionId !== null) {
    db.deleteSession(_currentSessionId);
    _currentSessionId = null;
  }

  const deleted = outputWriter.deleteSessionFile();
  if (deleted) {
    console.log(`[main] Purged short session (${entries.length} track${entries.length === 1 ? '' : 's'})`);
  }
}

/** End the current DB session and start a new one. */
function rotateDbSession(sessionFile: string | null): void {
  if (!db) return;
  if (_currentSessionId !== null) {
    db.endSession(_currentSessionId);
  }
  _currentSessionId = db.createSession(sessionFile);
  // Clean up any short sessions (< 3 tracks) left from previous runs, excluding current
  const purged = db.purgeShortSessions(SHORT_SESSION_THRESHOLD, _currentSessionId);
  if (purged > 0) console.log(`[main] Purged ${purged} short session(s) from DB`);
}

/** Build a tracklist suffix like " [Label, 2024]" from enrichment data. */
function buildTracklistSuffix(result: EnrichmentResult): string {
  const fmt = getConfig().tracklistFormat;
  if (!fmt.includeYear && !fmt.includeLabel) return '';
  const parts: string[] = [];
  if (fmt.includeLabel && result.label) parts.push(result.label);
  if (fmt.includeYear && result.year) parts.push(String(result.year));
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

/** Forward an event to the renderer. */
function emit(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

/** Apply Windows login-item settings from current config. */
function applyStartupSettings(): void {
  const cfg = getConfig();
  app.setLoginItemSettings({
    openAtLogin: cfg.startWithWindows,
    args:        cfg.startInTray ? ['--hidden'] : [],
  });
}

/** Build tray callbacks that close over current module state. */
function buildTrayCallbacks(): TrayCallbacks {
  return {
    isRunning:       () => _isRunning,
    isWindowVisible: () => mainWindow?.isVisible() ?? false,
    onShowHide: () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      refreshTray(buildTrayCallbacks());
    },
    onNewSession: () => {
      if (!outputWriter) return;
      maybePurgeShortSession();
      const sessionFile = outputWriter.startNewSession();
      _lastPublishedLine = null;
      _lastTrackPlayCount = 0;
      resetLastPublished();
      enableFastFirstTrack();
      resetEnrichmentSession();
      _sessionVersion++;
      rotateDbSession(sessionFile);
      emit('trackr:session-started', { sessionFile });
    },
    onStartStop: () => {
      if (_isRunning) {
        _isRunning = false;
        cancelPending();
        emit('trackr:state', { state: 'stopped' });
      } else {
        const resolution = resolveOutputRoot();
        if (resolution.outputRoot) initModules(resolution.outputRoot);
      }
      refreshTray(buildTrayCallbacks());
    },
    onQuit: () => {
      _forceQuit = true;
      void stopProlink().catch(() => {}).finally(() => {
        stopApiServer();
        db?.close();
        destroyTray();
        app.quit();
      });
    },
  };
}

/** Build the deps object that wires the REST API to runtime state. */
function buildApiDeps(): ApiDeps {
  return {
    isRunning:         () => _isRunning,
    isPlaybackActive:  () => isPlaybackActive(),
    lastPublishedLine: () => _lastPublishedLine,
    deviceCount:       () => getDeviceCount(),
    deviceSummaries:   () => getDeviceSummaries(),
    playCount:         () => _lastTrackPlayCount,
    sharePlayCount:    () => getConfig().sharePlayCountViaApi,
    sessionFileName:   () => outputWriter?.sessionFile ?? null,
    sessionVersion:    () => _sessionVersion,
    overlayTxtPath:    () => outputWriter?.overlayTxtPath ?? null,
    overlayDir:        () => {
      const root = getConfig().outputRoot;
      return root ? path.join(root, 'overlay') : null;
    },

    getConfig,
    setConfig: (partial) => {
      setConfig(partial);
      if (partial['delaySeconds']     != null) setPublishDelay((partial['delaySeconds'] as number) * 1000);
      if (partial['startWithWindows'] != null || partial['startInTray'] != null) applyStartupSettings();
      return getConfig();
    },

    controlStart: () => {
      const resolution = resolveOutputRoot();
      if (resolution.state === 'needs_user_choice') return { ok: false, needsUserChoice: true };
      if (resolution.outputRoot) initModules(resolution.outputRoot);
      return { ok: true };
    },
    controlStop: () => {
      _isRunning = false;
      cancelPending();
      emit('trackr:state', { state: 'stopped' });
      refreshTray(buildTrayCallbacks());
    },
    controlRefresh: () => {
      if (!outputWriter) return { ok: false };
      maybePurgeShortSession();
      const sessionFile = outputWriter.startNewSession();
      _lastPublishedLine = null;
      _lastTrackPlayCount = 0;
      resetLastPublished();
      enableFastFirstTrack();
      resetEnrichmentSession();
      _sessionVersion++;
      rotateDbSession(sessionFile);
      emit('trackr:session-started', { sessionFile });
      return { ok: true, sessionFile };
    },

    getOverlayStyle: () => getConfig().overlayStyle ?? DEFAULT_OVERLAY_STYLE,
    setOverlayStyle: (partial: Partial<OverlayStyle>) => {
      const current = getConfig().overlayStyle ?? DEFAULT_OVERLAY_STYLE;
      const merged = { ...current, ...partial };
      setConfig({ overlayStyle: merged });
      return merged;
    },

    resetPlayCounts: () => { db?.resetAllPlayCounts(); },

    getEnrichment: () => {
      if (!db || !_lastPublishedLine) return null;
      const parts = splitTrackLine(_lastPublishedLine);
      if (!parts) return null;
      const row = db.getTrack(parts[0], parts[1]);
      if (!row || row.enrichment_status !== 'complete') return null;
      return rowToResult(row);
    },

    getArtPath: (filename: string) => artCache?.getFullPath(filename) ?? null,

    resolveOutputRoot,
    chooseOutputRoot: (choice) => {
      const resolution = persistOutputRootChoice(choice);
      if (resolution.outputRoot) initModules(resolution.outputRoot);
      return resolution;
    },

    // Overlays
    getOverlaysConfig: () => getConfig().overlays,
    setOverlaysConfig: (partial) => {
      setConfig({ overlays: partial } as Record<string, unknown>);
      emitConfigChanged();
      const updated = getConfig().overlays;
      // Sync chat listener with trigger config changes
      if (updated.triggers.chatCommand && updated.triggers.twitchChannel) {
        updateChatConfig(updated.triggers.twitchChannel, updated.triggers.chatCommandNames, updated.triggers.chatCommandCooldown);
      } else {
        stopChatListener();
      }
      return updated;
    },
    getApiBaseUrl: () => {
      const cfg = getConfig();
      return `http://${detectLanIp()}:${cfg.apiPort}`;
    },
    getLastTrack: () => {
      if (!db || !_lastPublishedLine) return null;
      const parts = splitTrackLine(_lastPublishedLine);
      if (!parts) return null;
      const [artist, title] = parts;
      const row = db.getTrack(artist, title);
      const result: { artist: string; title: string; label?: string; year?: number; artUrl?: string } = { artist, title };
      if (row?.enrichment_status === 'complete') {
        if (row.label) result.label = row.label;
        if (row.year) result.year = row.year;
        if (row.art_filename) result.artUrl = '/art/current';
      }
      return result;
    },
  };
}

/** Start the API server unconditionally so the renderer health-check passes.
 *  Call once from app.whenReady(), before initModules. */
function ensureApiServer(): void {
  const config = getConfig();
  startApiServer(buildApiDeps(), config.apiPort, getEffectiveBindHost());
}

/** Initialize file-based modules for a resolved output root. */
function initModules(outputRoot: string): void {
  const config = getConfig();

  db?.close();
  db            = new TrackrDatabase(path.join(outputRoot, 'trackr.db'));
  outputWriter  = new OutputWriter(outputRoot, config.timestampsEnabled, config.delaySeconds);
  artCache      = new ArtCache(outputRoot);

  // Session + overlay must be ready before the API can serve /trackr
  outputWriter.ensureOverlayExists();
  const initSessionFile = outputWriter.startNewSession();
  resetLastPublished();
  enableFastFirstTrack();
  resetEnrichmentSession();
  if (getConfig().enrichment.artOverlayEnabled) artCache.clearOverlay();
  _sessionVersion++;
  rotateDbSession(initSessionFile);

  _isRunning = true;
  emit('trackr:state', { state: 'running', outputRoot });
  refreshTray(buildTrayCallbacks());
  console.log(`[main] Initialized — output root: ${outputRoot}`);
}

/** Max time (ms) to wait for enrichment before showing overlay with available data. */
const ENRICHMENT_WAIT_MS = 5000;

/** Called by prolink.ts when a track passes all gates and the timer fires. */
function handlePublish(line: string, deviceId: number, publishedAt: number): void {
  if (!_isRunning || !outputWriter || !db) {
    console.warn('[main] handlePublish: stopped or not initialized, skipping');
    return;
  }

  outputWriter.writeOverlay(line);
  const entry = outputWriter.appendTrack(line, publishedAt);
  db.incrementPlayCount();                                          // session counter

  // Split for per-track operations (artist, title)
  const parts = splitTrackLine(line);
  let playCount = 0;
  if (parts) {
    const [artist, title] = parts;
    playCount = db.incrementTrackPlayCount(artist, title);     // per-track lifetime count (badge)

    // Record in session history
    if (_currentSessionId !== null) {
      db.addSessionTrack(_currentSessionId, artist, title, new Date(publishedAt * 1000).toISOString());
    }

    // Art overlay: try cached art immediately (for repeat plays)
    const artOverlay = getConfig().enrichment.artOverlayEnabled;
    if (artOverlay && artCache) {
      if (!artCache.copyToOverlay(artist, title)) artCache.clearOverlay();
    }

    // Set _lastPublishedLine early — needed by fireSSE staleness check and getEnrichment()
    _lastPublishedLine = line;

    // SSE overlay emission — wait for enrichment to complete so card appears fully loaded.
    // Text files, NOW bar, sidebar all update immediately above. Only the visual overlay waits.
    const autoShow = getConfig().overlays.triggers.autoShowOnTrackChange;
    let sseFired = false;

    const fireSSE = (result?: { label?: string; year?: number; artFilename?: string }) => {
      if (sseFired) return;
      // Stale check: if a newer track published while we waited, skip this one
      if (_lastPublishedLine !== line) return;
      sseFired = true;

      if (autoShow) {
        const payload: Record<string, unknown> = { artist, title, deck: deviceId };
        if (result?.label) payload.label = result.label;
        if (result?.year) payload.year = result.year;
        if (result?.artFilename) payload.artUrl = '/art/current?t=' + Date.now();
        emitTrackChange(payload as { artist: string; title: string });
      }
    };

    // Timeout: if enrichment takes too long, fire SSE with whatever we have
    const timeout = setTimeout(() => fireSSE(), ENRICHMENT_WAIT_MS);

    // Fire enrichment asynchronously
    enrichTrack(db, line, artCache, (result) => {
      emit('trackr:enrichment-update', { line, ...result });
      // Enrichment done — fire SSE with full data and cancel timeout
      clearTimeout(timeout);
      fireSSE(result);
      // Art may have just been downloaded — copy to overlay
      if (artOverlay && artCache && result.artFilename) {
        artCache.copyToOverlay(artist, title);
      }
      // Append year/label suffix to session tracklist file
      const suffix = buildTracklistSuffix(result);
      if (suffix && outputWriter) {
        const cleanLine = `${artist} - ${title}`;
        outputWriter.appendTrackSuffix(cleanLine, suffix);
      }
    }).catch(err => {
      console.warn('[main] enrichTrack error:', err);
      // On error, fire SSE immediately with basic data
      clearTimeout(timeout);
      fireSSE();
    });
  }

  _lastTrackPlayCount = playCount;
  _lastPublishedLine = line;

  emit('trackr:track-published', {
    line,
    deviceId,
    publishedAt,
    playCount,
    entry:          entry ? { time: entry.time, line: entry.line } : null,
    runningEntries: outputWriter.getRunningEntries(),
  });
}

// ─── window ──────────────────────────────────────────────────────────────────

// ── Window state persistence ──
const _winStore = new Store<{ windowState?: { x: number; y: number; width: number; height: number; isMinimized: boolean } }>({ name: 'window-state' });

function _isVisibleOnAnyDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const displays = screen.getAllDisplays();
  // Check if at least 100px of the window overlaps any display
  return displays.some(d => {
    const db = d.bounds;
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, db.x + db.width) - Math.max(bounds.x, db.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, db.y + db.height) - Math.max(bounds.y, db.y));
    return overlapX > 100 && overlapY > 50;
  });
}

function createWindow(): void {
  const startHidden = process.argv.includes('--hidden') || getConfig().startInTray;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../assets/icon.ico');

  // Restore saved window bounds (or use defaults)
  const saved = _winStore.get('windowState');
  const defaults = { width: 1200, height: 900 };
  let winOpts: { x?: number; y?: number; width: number; height: number } = defaults;
  if (saved && _isVisibleOnAnyDisplay(saved)) {
    winOpts = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  }

  mainWindow = new BrowserWindow({
    ...winOpts, minWidth: 1200, minHeight: 900,
    title: 'TRACKR',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#0a0a0a',
    show: false,  // Reveal via ready-to-show to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (startHidden) return;
    if (saved?.isMinimized) {
      mainWindow?.minimize();
      mainWindow?.show();
    } else {
      mainWindow?.show();
    }
  });

  // Save window state on move/resize (debounced)
  let _saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const isMin = mainWindow.isMinimized();
      // Use saved bounds when minimized (getBounds returns pre-minimize position)
      const bounds = isMin ? (mainWindow.getNormalBounds?.() || mainWindow.getBounds()) : mainWindow.getBounds();
      _winStore.set('windowState', { ...bounds, isMinimized: isMin });
    }, 500);
  };
  mainWindow.on('resize', saveState);
  mainWindow.on('move', saveState);
  mainWindow.on('minimize', saveState);
  mainWindow.on('restore', saveState);

  // Close to tray — X hides the window, tray "Quit" does the real exit.
  mainWindow.on('close', (e) => {
    saveState();
    if (!_forceQuit) {
      e.preventDefault();
      mainWindow?.hide();
      refreshTray(buildTrayCallbacks());
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  const devUrl = process.env['ELECTRON_DEV_VITE_URL'];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());

  // ── Phase 2: prolink ──────────────────────────────────────────────────────
  ipcMain.handle('prolink:get-device-count',     () => getDeviceCount());
  ipcMain.handle('prolink:get-device-summaries', () => getDeviceSummaries());
  ipcMain.handle('prolink:start', () => startProlink(emit));
  ipcMain.handle('prolink:stop',  () => stopProlink());

  // ── Phase 3: config ───────────────────────────────────────────────────────
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:set', (_event, partial: Record<string, unknown>) => {
    setConfig(partial);
    const cfg = getConfig();
    if (partial['delaySeconds']     != null) setPublishDelay(cfg.delaySeconds * 1000);
    if (partial['startWithWindows'] != null || partial['startInTray'] != null) applyStartupSettings();
    return cfg;
  });

  // ── Phase 3: output root ──────────────────────────────────────────────────
  ipcMain.handle('output-root:resolve', () => resolveOutputRoot());
  ipcMain.handle('output-root:choose', (_event, choice: 'legacy' | 'trackr') => {
    const resolution = persistOutputRootChoice(choice);
    if (resolution.outputRoot) initModules(resolution.outputRoot);
    return resolution;
  });

  // ── Phase 3: controls ─────────────────────────────────────────────────────
  ipcMain.handle('control:start', () => {
    const resolution = resolveOutputRoot();
    if (resolution.state === 'needs_user_choice') {
      return { ok: false, needsUserChoice: true, resolution };
    }
    if (resolution.outputRoot) initModules(resolution.outputRoot);
    return { ok: true };
  });
  ipcMain.handle('control:stop', () => {
    _isRunning = false;
    emit('trackr:state', { state: 'stopped' });
    return { ok: true };
  });
  ipcMain.handle('control:refresh', () => {
    if (!outputWriter) return { ok: false, error: 'not initialized' };
    maybePurgeShortSession();
    const sessionFile = outputWriter.startNewSession();
    _lastPublishedLine = null;
    resetLastPublished();
    enableFastFirstTrack();
    resetEnrichmentSession();
    _sessionVersion++;
    rotateDbSession(sessionFile);
    emit('trackr:session-started', { sessionFile });
    return { ok: true, sessionFile };
  });

  // ── Phase 6: native dialog ────────────────────────────────────────────────
  ipcMain.handle('dialog:open-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select TRACKR output folder',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:save-file', async (_event, params: { defaultName: string; content: string }) => {
    if (!mainWindow) return { ok: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Session',
      defaultPath: params.defaultName,
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const { writeFileSync } = await import('fs');
    writeFileSync(result.filePath, params.content, 'utf-8');
    return { ok: true, path: result.filePath };
  });

  // ── Phase 3: stats / tracklist ────────────────────────────────────────────
  ipcMain.handle('db:get-play-count',              () => db?.getPlayCount() ?? 0);
  ipcMain.handle('tracklist:get-running-entries',  () => outputWriter?.getRunningEntries() ?? []);
  ipcMain.handle('tracklist:get-file',             () => outputWriter?.sessionFile ?? null);

  // ── Phase 3: full status snapshot ─────────────────────────────────────────
  ipcMain.handle('trackr:get-status', () => {
    const config = getConfig();
    return {
      isRunning:            _isRunning,
      deviceCount:          getDeviceCount(),
      devices:              getDeviceSummaries(),
      lastPublishedLine:    _lastPublishedLine,
      sessionFile:          outputWriter?.sessionFile ?? null,
      playCount:            db?.getPlayCount() ?? 0,
      outputRoot:           config.outputRoot || null,
      apiEnabled:           config.apiEnabled,
      apiPort:              config.apiPort,
    };
  });

  // ── History ──────────────────────────────────────────────────────────────────
  ipcMain.handle('db:search-tracks', (_event, params: { query?: string; limit?: number; offset?: number }) => {
    return db?.searchTracks(params?.query, params?.limit, params?.offset) ?? { rows: [], total: 0 };
  });
  ipcMain.handle('db:get-track', (_event, params: { artist: string; title: string }) => {
    return db?.getTrack(params.artist, params.title) ?? null;
  });

  // ── Session History ──────────────────────────────────────────────────────────
  ipcMain.handle('db:search-sessions', (_event, params: { limit?: number; offset?: number }) => {
    return db?.searchSessions(params?.limit, params?.offset) ?? { rows: [], total: 0 };
  });
  ipcMain.handle('db:get-session-tracks', (_event, params: { sessionId: number }) => {
    return db?.getSessionTracks(params.sessionId) ?? [];
  });

  ipcMain.handle('db:delete-session', (_event, params: { sessionId: number }) => {
    if (!db) return { ok: false };
    // Don't allow deleting the active session
    if (_currentSessionId !== null && params.sessionId === _currentSessionId) {
      return { ok: false, reason: 'Cannot delete the active session' };
    }
    // Decrement play counts for each track in this session, then delete
    const tracks = db.getSessionTracks(params.sessionId);
    for (const t of tracks) {
      db.decrementTrackPlayCount(t.artist, t.title);
    }
    db.deleteSession(params.sessionId);
    return { ok: true };
  });

  // ── Overlays ─────────────────────────────────────────────────────────────────
  ipcMain.handle('overlays:get-config', () => getConfig().overlays);
  ipcMain.handle('overlays:set-config', (_event, partial: Record<string, unknown>) => {
    setConfig({ overlays: partial } as Record<string, unknown>);
    emitConfigChanged();
    const updated = getConfig().overlays;
    // Sync chat listener
    if (updated.triggers.chatCommand && updated.triggers.twitchChannel) {
      updateChatConfig(updated.triggers.twitchChannel, updated.triggers.chatCommandNames, updated.triggers.chatCommandCooldown);
    } else {
      stopChatListener();
    }
    return updated;
  });
  ipcMain.handle('overlays:get-themes', () => {
    const { getThemeList } = require('./overlays/themes/registry');
    return getThemeList();
  });
  ipcMain.handle('overlays:test', () => {
    const deps = buildApiDeps();
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
    return { ok: true };
  });
  ipcMain.handle('overlays:hide', () => {
    const { emitHideCard } = require('./overlays/sse');
    emitHideCard();
    return { ok: true };
  });

  // ── Enrichment ─────────────────────────────────────────────────────────────
  ipcMain.handle('enrichment:test-connection', () => testConnection());

  // ── Updater ────────────────────────────────────────────────────────────────
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  ipcMain.handle('updater:check', async () => {
    const send = (status: Record<string, unknown>) => {
      mainWindow?.webContents.send('updater:status', status);
    };

    autoUpdater.removeAllListeners();

    autoUpdater.on('update-available', (info) => {
      send({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      send({ state: 'up-to-date' });
    });
    autoUpdater.on('download-progress', (progress) => {
      send({ state: 'downloading', progress: progress.percent / 100 });
    });
    autoUpdater.on('update-downloaded', () => {
      send({ state: 'ready' });
      // Quit and install after a short delay so the renderer can show "Restarting..."
      setTimeout(() => autoUpdater.quitAndInstall(), 1500);
    });
    autoUpdater.on('error', (err) => {
      send({ state: 'error', message: err?.message || String(err) });
    });

    try {
      await autoUpdater.checkForUpdates();
    } catch (err: unknown) {
      // In dev mode, electron-updater silently skips — checkForUpdates returns null
      // and no events fire. Catch and report.
      const msg = err instanceof Error ? err.message : String(err);
      send({ state: 'error', message: msg || 'Update check failed' });
    }

    // Dev mode: checkForUpdates skips silently without firing events.
    // If no event fires within 10s, assume dev mode and report up-to-date.
    if (!app.isPackaged) {
      send({ state: 'up-to-date' });
    }
  });
}

// ─── app lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  Menu.setApplicationMenu(null);   // Remove default Electron menu bar
  registerIpc();

  // Start the REST API immediately so the renderer health-check passes.
  // initModules fills in DB/output state later; until then, endpoints
  // return safe defaults (null session, zero play count, etc.).
  ensureApiServer();

  // Load stored Beatport token (if valid) so first enrichment call doesn't re-auth
  initEnrichment();

  setPublishCallback(handlePublish);
  setPublishDelay(getConfig().delaySeconds * 1000);

  // Auto new session when a set ends (30s silence gap detected).
  // The next track that publishes will start at 00:00 in a clean session.
  // Guard: only reset if we've published at least one track (avoids
  // resetting if setEnded fires before any tracks were published).
  setOnSetEnded(() => {
    if (!outputWriter || _lastPublishedLine === null) return;

    // Real sessions (3+ tracks) are never auto-reset — manual refresh only
    const trackCount = outputWriter.getRunningEntries().length;
    if (trackCount >= SHORT_SESSION_THRESHOLD) {
      console.log(`[main] Set ended (30s silence) — skipping auto-reset (${trackCount} tracks = real session)`);
      return;
    }

    maybePurgeShortSession();
    const sessionFile = outputWriter.startNewSession();
    _lastPublishedLine = null;
    resetLastPublished();
    enableFastFirstTrack();
    resetEnrichmentSession();
    _sessionVersion++;
    rotateDbSession(sessionFile);
    emit('trackr:session-started', { sessionFile });
    refreshTray(buildTrayCallbacks());
    console.log(`[main] Auto new session — set ended (30s silence, ${trackCount} tracks purged)`);
  });

  // System tray
  _tray = createTray(buildTrayCallbacks());

  // Windows login-item settings (startup-with-Windows)
  applyStartupSettings();

  const resolution = resolveOutputRoot();
  if (resolution.state === 'resolved' && resolution.outputRoot) {
    try {
      initModules(resolution.outputRoot);
    } catch (err) {
      console.error('[main] initModules failed:', err);
      dialog.showErrorBox('TRACKR — Startup Error',
        `Failed to initialize: ${err instanceof Error ? err.message : String(err)}\n\n` +
        'The app will start in offline mode. Check that the output folder is accessible.');
    }
  } else if (resolution.state === 'needs_user_choice') {
    emit('trackr:needs-output-root-choice', {
      legacyRoot: resolution.legacyRoot,
      trackrRoot: resolution.trackrRoot,
    });
  }

  startProlink(emit).catch(err => {
    console.error('[main] prolink auto-start failed:', err);
  });

  // Start Twitch chat listener if configured
  const overlaysCfg = getConfig().overlays;
  if (overlaysCfg.triggers.chatCommand && overlaysCfg.triggers.twitchChannel) {
    startChatListener(
      overlaysCfg.triggers.twitchChannel,
      overlaysCfg.triggers.chatCommandNames,
      overlaysCfg.triggers.chatCommandCooldown,
    );
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// With close-to-tray, window-all-closed does NOT quit.
// Real quit is triggered by tray "Quit TRACKR" (sets _forceQuit = true).
app.on('window-all-closed', () => {
  // no-op — app lives in tray
});
