import { contextBridge, ipcRenderer } from 'electron';

// Exposed to the renderer process via window.electronAPI.
contextBridge.exposeInMainWorld('electronAPI', {
  platform:           process.platform,
  // Request/response IPC (ipcMain.handle / ipcRenderer.invoke)
  invoke:             (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  // One-way IPC (renderer → main)
  send:               (channel: string, ...args: unknown[]) =>
    ipcRenderer.send(channel, ...args),
  // Subscribe to events from main process — returns an unsubscribe function
  on:                 (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => { ipcRenderer.removeListener(channel, wrapped); };
  },
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
