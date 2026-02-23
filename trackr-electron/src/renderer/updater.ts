/**
 * TRACKR Electron — updater stub
 *
 * Phase 8 will wire electron-updater here.
 * For now, "Check for Updates" button immediately resolves as up-to-date.
 */

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
  // electron-updater will be wired in Phase 8
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
  onStatus({ state: 'up-to-date' });
}
