/**
 * TRACKR Phase 0 — prolink-connect Hardware Validation
 *
 * PURPOSE: Validate that prolink-connect works with Art's CDJ-3000s + DJM-A9
 * before writing any migration code.
 *
 * PASS CRITERIA:
 *   ✓ All 4 CDJ-3000s detected with correct model names + player numbers
 *   ✓ DJM-A9 mixer detected
 *   ✓ isOnAir reflects DJM fader position (up = true, down = false)
 *   ✓ playState reflects play/pause/cue state correctly
 *   ✓ Track metadata (artist + title) resolves when a track is loaded
 *
 * USAGE:
 *   npm install
 *   npm test
 *
 * Run while CDJs are powered on and connected to the same network.
 * Load and play a track to validate metadata resolution.
 */

import { bringOnline, CDJStatus, DeviceType } from 'prolink-connect';

// ─── helpers ────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function log(section: string, msg: string): void {
  console.log(`[${ts()}] [${section.padEnd(12)}] ${msg}`);
}

function playStateName(state: CDJStatus.PlayState): string {
  const names: Partial<Record<CDJStatus.PlayState, string>> = {
    [CDJStatus.PlayState.Empty]:       'Empty',
    [CDJStatus.PlayState.Loading]:     'Loading',
    [CDJStatus.PlayState.Playing]:     'Playing',
    [CDJStatus.PlayState.Looping]:     'Looping',
    [CDJStatus.PlayState.Paused]:      'Paused',
    [CDJStatus.PlayState.Cued]:        'Cued',
    [CDJStatus.PlayState.Cuing]:       'Cuing',
    [CDJStatus.PlayState.PlatterHeld]: 'PlatterHeld',
    [CDJStatus.PlayState.Searching]:   'Searching',
    [CDJStatus.PlayState.SpunDown]:    'SpunDown',
    [CDJStatus.PlayState.Ended]:       'Ended',
  };
  return names[state] ?? `Unknown(0x${(state as number).toString(16)})`;
}

// ─── state tracking — suppress log noise for identical states ────────────────

interface LastState {
  isOnAir:   boolean;
  playState: CDJStatus.PlayState;
  trackId:   number;
}

const lastState = new Map<number, LastState>();

function hasChanged(status: CDJStatus.State): boolean {
  const prev = lastState.get(status.deviceId);
  if (!prev) return true;
  return (
    prev.isOnAir   !== status.isOnAir   ||
    prev.playState !== status.playState ||
    prev.trackId   !== status.trackId
  );
}

function updateLastState(status: CDJStatus.State): void {
  lastState.set(status.deviceId, {
    isOnAir:   status.isOnAir,
    playState: status.playState,
    trackId:   status.trackId,
  });
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  TRACKR Phase 0 — prolink-connect Hardware Validator ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Waiting for CDJs/mixer on the network...');
  console.log('Press Ctrl+C to stop.\n');

  // Step 1: bring sockets online. No config yet — autoconfigFromPeers handles it.
  const network = await bringOnline();
  log('INIT', 'prolink-connect online, waiting for autoconfig...');

  // ── device events (available before connect) ───────────────────────────────

  network.deviceManager.on('connected', device => {
    const typeStr =
      device.type === DeviceType.CDJ       ? 'CDJ'       :
      device.type === DeviceType.Mixer     ? 'Mixer'     :
      device.type === DeviceType.Rekordbox ? 'Rekordbox' :
      `Type(${device.type})`;

    log('DEVICE +', `${device.name}  [${typeStr}]  player=#${device.id}  ip=${device.ip.address}`);
    log('DEVICE +', `  → Total devices: ${network.deviceManager.devices.size}`);
  });

  network.deviceManager.on('disconnected', device => {
    log('DEVICE -', `${device.name}  player=#${device.id} disconnected`);
    log('DEVICE -', `  → Total devices: ${network.deviceManager.devices.size}`);
    lastState.delete(device.id);
  });

  // Step 2: autoconfig from the first peer that appears.
  await network.autoconfigFromPeers();
  log('INIT', 'Autoconfigured from peer — connecting...');

  // Step 3: connect. After this, statusEmitter and db are available.
  network.connect();

  // Type guard: narrow to ConnectedProlinkNetwork so statusEmitter/db are non-null.
  if (!network.isConnected()) {
    log('ERROR', 'network.isConnected() returned false after connect() — unexpected, exiting.');
    process.exit(1);
  }

  log('INIT', 'Connected! Listening for status + metadata.\n');

  // ── CDJ status events ──────────────────────────────────────────────────────

  network.statusEmitter.on('status', async (status: CDJStatus.State) => {
    if (!hasChanged(status)) return;
    updateLastState(status);

    const stateStr  = playStateName(status.playState);
    const onAirStr  = status.isOnAir   ? 'ON-AIR ' : 'off-air';
    const syncStr   = status.isSync    ? ' SYNC'   : '';
    const masterStr = status.isMaster  ? ' MASTER' : '';

    log(
      `CDJ #${status.deviceId}`,
      `${stateStr.padEnd(12)} ${onAirStr}${syncStr}${masterStr}  ` +
      `trackId=${status.trackId}  slot=${status.trackSlot}  type=${status.trackType}  ` +
      `bpm=${status.trackBPM ?? '—'}`
    );

    // ── metadata resolution ────────────────────────────────────────────────

    // Only attempt when a track is loaded
    if (status.trackId === 0) return;

    try {
      const track = await network.db.getMetadata({
        deviceId:  status.trackDeviceId,
        trackSlot: status.trackSlot,
        trackType: status.trackType,
        trackId:   status.trackId,
      });

      if (track) {
        const artist = track.artist?.name ?? '(no artist)';
        const title  = track.title        ?? '(no title)';
        const album  = track.album?.name  ?? '';
        log(
          `META  #${status.deviceId}`,
          `"${artist} — ${title}"${album ? `  [${album}]` : ''}`
        );
      } else {
        log(`META  #${status.deviceId}`, `No metadata for trackId=${status.trackId} (slot=${status.trackSlot}, type=${status.trackType})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`META  #${status.deviceId}`, `ERROR resolving metadata: ${msg}`);
    }
  });

  // ── heartbeat every 30s ────────────────────────────────────────────────────

  setInterval(() => {
    const deviceList = [...network.deviceManager.devices.values()]
      .map(d => `${d.name}(#${d.id})`)
      .join(', ');
    const count = network.deviceManager.devices.size;
    log('HEARTBEAT', `${count} device(s): ${count > 0 ? deviceList : 'none detected'}`);
  }, 30_000);

  // ── graceful shutdown ──────────────────────────────────────────────────────

  process.on('SIGINT', async () => {
    console.log('\n');
    log('SHUTDOWN', 'Ctrl+C — disconnecting...');
    try {
      await network.disconnect();
    } catch {
      // ignore
    }
    log('SHUTDOWN', 'Done.');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
