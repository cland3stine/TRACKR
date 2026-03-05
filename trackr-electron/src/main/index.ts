import { app, BrowserWindow, ipcMain, dialog, Menu, Tray } from 'electron';
import path from 'path';

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
  resetLastPublished, enableFastFirstTrack,
} from './prolink';
import { OutputWriter }      from './output';
import { TrackrDatabase }    from './database';
import {
  getConfig, setConfig, resolveOutputRoot, persistOutputRootChoice, getEffectiveBindHost,
  DEFAULT_OVERLAY_STYLE, OverlayStyle,
} from './store';
import { startApiServer, stopApiServer, ApiDeps } from './api';
import { createTray, refreshTray, destroyTray, TrayCallbacks } from './tray';

// Enforce single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ─── runtime state ───────────────────────────────────────────────────────────

let mainWindow:    BrowserWindow  | null = null;
let _tray:         Tray           | null = null;
let db:            TrackrDatabase | null = null;
let outputWriter:  OutputWriter   | null = null;
let _isRunning = false;
let _lastPublishedLine: string | null = null;
let _lastTrackPlayCount = 0;   // per-track lifetime play count for badge
let _sessionVersion = 0;       // increments on every new session
let _forceQuit = false;  // set by tray "Quit" to allow real exit

// ─── helpers ─────────────────────────────────────────────────────────────────

const SHORT_SESSION_THRESHOLD = 3;

/** Purge sessions with fewer than 3 tracks — deletes the file and decrements play counts. */
function maybePurgeShortSession(): void {
  if (!outputWriter || !db) return;
  const entries = outputWriter.getRunningEntries();
  if (entries.length === 0 || entries.length >= SHORT_SESSION_THRESHOLD) return;

  for (const entry of entries) {
    db.decrementTrackPlayCount(entry.line);
  }

  const deleted = outputWriter.deleteSessionFile();
  if (deleted) {
    console.log(`[main] Purged short session (${entries.length} track${entries.length === 1 ? '' : 's'})`);
  }
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
      _sessionVersion++;
      emit('trackr:session-started', { sessionFile });
    },
    onStartStop: () => {
      if (_isRunning) {
        _isRunning = false;
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
      _sessionVersion++;
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

    resolveOutputRoot,
    chooseOutputRoot: (choice) => {
      const resolution = persistOutputRootChoice(choice);
      if (resolution.outputRoot) initModules(resolution.outputRoot);
      return resolution;
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

  // Session + overlay must be ready before the API can serve /trackr
  outputWriter.ensureOverlayExists();
  outputWriter.startNewSession();
  resetLastPublished();
  enableFastFirstTrack();
  _sessionVersion++;

  _isRunning = true;
  emit('trackr:state', { state: 'running', outputRoot });
  refreshTray(buildTrayCallbacks());
  console.log(`[main] Initialized — output root: ${outputRoot}`);
}

/** Called by prolink.ts when a track passes all gates and the timer fires. */
function handlePublish(line: string, deviceId: number, publishedAt: number): void {
  if (!outputWriter || !db) {
    console.warn('[main] handlePublish: modules not initialized, skipping');
    return;
  }

  outputWriter.writeOverlay(line);
  const entry     = outputWriter.appendTrack(line, publishedAt);
  db.incrementPlayCount();                              // session counter
  const playCount = db.incrementTrackPlayCount(line);   // per-track lifetime count (badge)
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

function createWindow(): void {
  const startHidden = process.argv.includes('--hidden') || getConfig().startInTray;

  mainWindow = new BrowserWindow({
    width: 1200, height: 900, minWidth: 1200, minHeight: 900,
    title: 'TRACKR',
    backgroundColor: '#0a0a0a',
    show: false,  // Reveal via ready-to-show to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow?.show();
  });

  // Close to tray — X hides the window, tray "Quit" does the real exit.
  mainWindow.on('close', (e) => {
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
    _sessionVersion++;
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

  setPublishCallback(handlePublish);
  setPublishDelay(getConfig().delaySeconds * 1000);

  // Auto new session when a set ends (30s silence gap detected).
  // The next track that publishes will start at 00:00 in a clean session.
  // Guard: only reset if we've published at least one track (avoids
  // resetting if setEnded fires before any tracks were published).
  setOnSetEnded(() => {
    if (!outputWriter || _lastPublishedLine === null) return;
    maybePurgeShortSession();
    const sessionFile = outputWriter.startNewSession();
    _lastPublishedLine = null;
    resetLastPublished();
    enableFastFirstTrack();
    _sessionVersion++;
    emit('trackr:session-started', { sessionFile });
    refreshTray(buildTrayCallbacks());
    console.log('[main] Auto new session — set ended (30s silence)');
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
