import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { startProlink, stopProlink, getDeviceCount, getDeviceSummaries } from './prolink';

// Enforce single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

/** Forward an event to the renderer. */
function emit(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1200,
    minHeight: 900,
    title: 'TRACKR',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('prolink:get-device-count',     () => getDeviceCount());
  ipcMain.handle('prolink:get-device-summaries', () => getDeviceSummaries());
  ipcMain.handle('prolink:start', () => startProlink(emit));
  ipcMain.handle('prolink:stop',  () => stopProlink());
}

app.whenReady().then(() => {
  createWindow();
  registerIpc();

  // Phase 2: auto-start prolink for development testing.
  // Phase 7D will add an auto_start setting and make this conditional.
  startProlink(emit).catch(err => {
    console.error('[main] prolink auto-start failed:', err);
  });
});

// Focus existing window if a second instance is launched.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// On Windows, quit when all windows are closed.
app.on('window-all-closed', () => {
  void stopProlink().catch(() => {}).finally(() => app.quit());
});
