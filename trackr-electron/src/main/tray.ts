/**
 * TRACKR Phase 7 — System Tray
 *
 * Creates and manages the system tray icon + context menu.
 * State (running/stopped) is reflected in the tooltip and menu labels.
 * The tray icon itself is the app icon (color variants are Phase 8+).
 */

import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';

// ─── types ───────────────────────────────────────────────────────────────────

export interface TrayCallbacks {
  isRunning:       () => boolean;
  isWindowVisible: () => boolean;
  onShowHide:      () => void;
  onNewSession:    () => void;
  onStartStop:     () => void;
  onQuit:          () => void;
}

// ─── module state ─────────────────────────────────────────────────────────────

let _tray: Tray | null = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function getIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../assets/icon.ico');
}

function buildMenu(callbacks: TrayCallbacks): Menu {
  const running = callbacks.isRunning();
  const visible  = callbacks.isWindowVisible();
  return Menu.buildFromTemplate([
    { label: visible ? 'Hide Window' : 'Show Window', click: callbacks.onShowHide },
    { type: 'separator' },
    { label: 'New Session', enabled: running, click: callbacks.onNewSession },
    { label: running ? 'Stop' : 'Start',              click: callbacks.onStartStop },
    { type: 'separator' },
    { label: 'Quit TRACKR', click: callbacks.onQuit },
  ]);
}

// ─── public API ──────────────────────────────────────────────────────────────

export function createTray(callbacks: TrayCallbacks): Tray {
  const image = nativeImage.createFromPath(getIconPath());
  const tray  = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);

  tray.setToolTip('TRACKR');
  tray.setContextMenu(buildMenu(callbacks));
  tray.on('click', callbacks.onShowHide);

  _tray = tray;
  return tray;
}

/** Rebuild tooltip + menu to reflect current state. Call after isRunning or visibility changes. */
export function refreshTray(callbacks: TrayCallbacks): void {
  if (!_tray) return;
  const running = callbacks.isRunning();
  _tray.setToolTip(`TRACKR — ${running ? 'Running' : 'Stopped'}`);
  _tray.setContextMenu(buildMenu(callbacks));
}

export function destroyTray(): void {
  _tray?.destroy();
  _tray = null;
}
