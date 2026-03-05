/**
 * TRACKR Electron — updater (renderer side)
 *
 * Communicates with the main process via IPC.
 * Main process runs electron-updater and sends status events back.
 */

declare const window: Window & {
  electronAPI: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (...args: unknown[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
};

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; progress: number }
  | { state: 'ready' }
  | { state: 'up-to-date' }
  | { state: 'error'; message: string };

export async function checkForUpdate(
  onStatus: (status: UpdateStatus) => void
): Promise<void> {
  onStatus({ state: 'checking' });

  // Listen for status events from main process
  window.electronAPI.removeAllListeners('updater:status');
  window.electronAPI.on('updater:status', (...args: unknown[]) => {
    const status = args[0] as UpdateStatus;
    onStatus(status);
  });

  try {
    await window.electronAPI.invoke('updater:check');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    onStatus({ state: 'error', message });
  }
}
