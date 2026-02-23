import { app, BrowserWindow, ipcMain, dialog, Tray } from 'electron';
import path from 'path';

import {
  startProlink, stopProlink, getDeviceCount, getDeviceSummaries,
  setPublishCallback, setPublishDelay,
} from './prolink';
import { OutputWriter }      from './output';
import { TrackrDatabase }    from './database';
import { TemplateStore, DEFAULT_TEMPLATE } from './template';
import {
  getConfig, setConfig, resolveOutputRoot, persistOutputRootChoice, getEffectiveBindHost,
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
let templateStore: TemplateStore  | null = null;
let _isRunning = false;
let _lastPublishedLine: string | null = null;
let _forceQuit = false;  // set by tray "Quit" to allow real exit

// ─── helpers ─────────────────────────────────────────────────────────────────

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
      const sessionFile = outputWriter.startNewSession();
      _lastPublishedLine = null;
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
    lastPublishedLine: () => _lastPublishedLine,
    deviceCount:       () => getDeviceCount(),
    deviceSummaries:   () => getDeviceSummaries(),
    playCount:         () => db?.getPlayCount() ?? 0,
    sharePlayCount:    () => getConfig().sharePlayCountViaApi,
    sessionFileName:   () => outputWriter?.sessionFile ?? null,
    overlayTxtPath:    () => outputWriter?.overlayNowplayingPath ?? null,
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
      const sessionFile = outputWriter.startNewSession();
      _lastPublishedLine = null;
      emit('trackr:session-started', { sessionFile });
      return { ok: true, sessionFile };
    },

    getTemplate:   () => templateStore?.getTemplate() ?? DEFAULT_TEMPLATE,
    setTemplate:   (html) => { templateStore?.setTemplate(html); },
    resetTemplate: () => templateStore?.resetTemplate() ?? DEFAULT_TEMPLATE,

    resolveOutputRoot,
    chooseOutputRoot: (choice) => {
      const resolution = persistOutputRootChoice(choice);
      if (resolution.outputRoot) initModules(resolution.outputRoot);
      return resolution;
    },
  };
}

/** Initialize file-based modules for a resolved output root. */
function initModules(outputRoot: string): void {
  const config = getConfig();

  db?.close();
  db            = new TrackrDatabase(path.join(outputRoot, 'trackr.db'));
  outputWriter  = new OutputWriter(outputRoot, config.timestampsEnabled, config.delaySeconds);
  templateStore = new TemplateStore(outputRoot, db);

  // Session + overlay must be ready before the API can serve /nowplaying
  outputWriter.ensureOverlayNowplayingExists();
  templateStore.ensureTemplateFile();
  outputWriter.startNewSession();

  // Start REST API + static overlay server (replaces overlay-server.ts)
  startApiServer(buildApiDeps(), config.apiPort, getEffectiveBindHost(config));

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

  outputWriter.writeOverlayNowplaying(line);
  const entry     = outputWriter.appendTrack(line, publishedAt);
  const playCount = db.incrementPlayCount();
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
    const sessionFile = outputWriter.startNewSession();
    _lastPublishedLine = null;
    emit('trackr:session-started', { sessionFile });
    return { ok: true, sessionFile };
  });

  // ── Phase 3: template ─────────────────────────────────────────────────────
  ipcMain.handle('template:get',   () => templateStore?.getTemplate() ?? DEFAULT_TEMPLATE);
  ipcMain.handle('template:set',   (_event, html: string)  => templateStore?.setTemplate(html));
  ipcMain.handle('template:reset', () => templateStore?.resetTemplate());

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
      apiAccessMode:        config.apiAccessMode,
      apiEffectiveBindHost: getEffectiveBindHost(config),
      apiPort:              config.apiPort,
    };
  });
}

// ─── app lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  registerIpc();

  setPublishCallback(handlePublish);
  setPublishDelay(getConfig().delaySeconds * 1000);

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
