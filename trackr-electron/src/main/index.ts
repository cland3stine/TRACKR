import { app, BrowserWindow, ipcMain } from 'electron';
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
import { startOverlayServer, stopOverlayServer } from './overlay-server';

// Enforce single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ─── runtime state ───────────────────────────────────────────────────────────

let mainWindow:    BrowserWindow  | null = null;
let db:            TrackrDatabase | null = null;
let outputWriter:  OutputWriter   | null = null;
let templateStore: TemplateStore  | null = null;
let _isRunning = false;
let _lastPublishedLine: string | null = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Forward an event to the renderer. */
function emit(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

/** Initialize file-based modules for a resolved output root. */
function initModules(outputRoot: string): void {
  const config = getConfig();

  db?.close();
  db            = new TrackrDatabase(path.join(outputRoot, 'trackr.db'));
  outputWriter  = new OutputWriter(outputRoot, config.timestampsEnabled, config.delaySeconds);
  templateStore = new TemplateStore(outputRoot, db);

  startOverlayServer(path.join(outputRoot, 'overlay'), config.apiPort);
  outputWriter.ensureOverlayNowplayingExists();
  templateStore.ensureTemplateFile();
  outputWriter.startNewSession();

  _isRunning = true;
  emit('trackr:state', { state: 'running', outputRoot });
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
  mainWindow = new BrowserWindow({
    width: 1200, height: 900, minWidth: 1200, minHeight: 900,
    title: 'TRACKR',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
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
    // Propagate delay change to prolink timer immediately
    if (partial['delaySeconds'] != null) setPublishDelay(cfg.delaySeconds * 1000);
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

  // ── Phase 3: stats / tracklist ────────────────────────────────────────────
  ipcMain.handle('db:get-play-count',              () => db?.getPlayCount() ?? 0);
  ipcMain.handle('tracklist:get-running-entries',  () => outputWriter?.getRunningEntries() ?? []);
  ipcMain.handle('tracklist:get-file',             () => outputWriter?.sessionFile ?? null);

  // ── Phase 3: full status snapshot (consumed by Phase 4 REST API) ──────────
  ipcMain.handle('trackr:get-status', () => {
    const config = getConfig();
    return {
      isRunning:         _isRunning,
      deviceCount:       getDeviceCount(),
      devices:           getDeviceSummaries(),
      lastPublishedLine: _lastPublishedLine,
      sessionFile:       outputWriter?.sessionFile ?? null,
      playCount:         db?.getPlayCount() ?? 0,
      outputRoot:        config.outputRoot || null,
      apiEnabled:        config.apiEnabled,
      apiAccessMode:     config.apiAccessMode,
      apiEffectiveBindHost: getEffectiveBindHost(config),
      apiPort:           config.apiPort,
    };
  });
}

// ─── app lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  registerIpc();

  // Wire prolink → main-process publish handler
  setPublishCallback(handlePublish);

  // Sync publish delay from persisted config
  setPublishDelay(getConfig().delaySeconds * 1000);

  // Auto-initialize file modules if output root is already resolved
  const resolution = resolveOutputRoot();
  if (resolution.state === 'resolved' && resolution.outputRoot) {
    try {
      initModules(resolution.outputRoot);
    } catch (err) {
      console.error('[main] initModules failed:', err);
    }
  } else if (resolution.state === 'needs_user_choice') {
    // Renderer will prompt user on first load
    emit('trackr:needs-output-root-choice', {
      legacyRoot: resolution.legacyRoot,
      trackrRoot: resolution.trackrRoot,
    });
  }

  // Phase 2: auto-start prolink.
  // Phase 7D will make this conditional on an auto_start setting.
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

app.on('window-all-closed', () => {
  void stopProlink().catch(() => {}).finally(() => {
    stopOverlayServer();
    db?.close();
    app.quit();
  });
});
