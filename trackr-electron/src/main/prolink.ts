/**
 * TRACKR — Pro DJ Link Integration
 *
 * Wraps prolink-connect to provide CDJ device monitoring and the track
 * publish trigger pipeline:
 *
 *   MixstatusProcessor (SmartTiming mode, 128-beat threshold)
 *     → "nowPlaying" event when track is confirmed as main track
 *   Gate 2: Metadata resolved (retry 350ms × 6 = ~2.1s max)
 *   Timer:  PUBLISH_DELAY_MS before committing (default 3s)
 *   Gate 3: Dedupe against lastPublished
 *
 * MixstatusProcessor replaces the old Gate 1 (isOnAir + isPlaying).
 * It uses beat counting to determine the "main" track, handling long
 * progressive house transitions where multiple faders are up simultaneously.
 *
 * resolveMetadata() applies cleanTrackLine() to track.title.
 * setPublishDelay(ms) wires the delay from the config store.
 * setPublishCallback(fn) lets index.ts handle file I/O on publish.
 */

import { bringOnline, CDJStatus, DeviceType, MixstatusMode } from 'prolink-connect';
import { cleanTrackLine } from './cleaner';

// ─── types ───────────────────────────────────────────────────────────────────

export interface DeviceSummary {
  name:  string;
  count: number;
}

/** Forward an event to the renderer (mainWindow.webContents.send). */
export type EmitFn = (channel: string, ...args: unknown[]) => void;

/** Called in the main process when a track is confirmed for publish. */
export type PublishCallback = (line: string, deviceId: number, publishedAt: number) => void;

/** Called when MixstatusProcessor detects a set ended (30s silence gap). */
export type SetEndedCallback = () => void;

type Network = Awaited<ReturnType<typeof bringOnline>>;

// ─── constants ───────────────────────────────────────────────────────────────

/** Delay (ms) — updated at runtime via setPublishDelay(). */
let _publishDelayMs = 3_000;

/** Max metadata fetch attempts before giving up. */
const METADATA_RETRIES  = 6;

/** Delay (ms) between metadata fetch attempts. */
const METADATA_RETRY_MS = 350;

// ─── module state ────────────────────────────────────────────────────────────

let _network:      Network           | null = null;
let _emit:         EmitFn            | null = null;
let _onPublish:    PublishCallback   | null = null;
let _onSetEnded: SetEndedCallback | null = null;

let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingKey:    string | null = null;
let _lastPublished: string | null = null;

const _dbWarmedDevices = new Set<string>();  // "deviceId|trackId" keys already warming
const _devicePlayStates = new Map<number, CDJStatus.PlayState>();  // latest play state per CDJ
let _nowPlayingDeviceId: number | null = null;  // device confirmed as "main" by MixstatusProcessor

// ─── helpers ─────────────────────────────────────────────────────────────────

const _t0 = Date.now();
const ts = () => `[+${((Date.now() - _t0) / 1000).toFixed(1)}s]`;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Build CDJ device summaries from a network instance. */
function buildSummaries(net: Network): DeviceSummary[] {
  const counts = new Map<string, number>();
  for (const device of net.deviceManager.devices.values()) {
    if (device.type === DeviceType.CDJ) {
      counts.set(device.name, (counts.get(device.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

// ─── public queries ──────────────────────────────────────────────────────────

/** CDJ device summaries (name + count). Excludes mixer. */
export function getDeviceSummaries(): DeviceSummary[] {
  return _network ? buildSummaries(_network) : [];
}

/** Total connected device count (CDJs + mixer). */
export function getDeviceCount(): number {
  return _network?.deviceManager.devices.size ?? 0;
}

/** True when MixstatusProcessor has a confirmed "now playing" track. */
export function isPlaybackActive(): boolean {
  return _nowPlayingDeviceId !== null;
}

// ─── publish pipeline ────────────────────────────────────────────────────────

function cancelPending(): void {
  if (_pendingTimer !== null) clearTimeout(_pendingTimer);
  _pendingTimer = null;
  _pendingKey   = null;
}

function schedulePending(key: string, line: string, deviceId: number): void {
  cancelPending();
  _pendingKey   = key;
  _pendingTimer = setTimeout(() => {
    if (_pendingKey !== key) return; // stale guard
    _pendingTimer = null;
    _pendingKey   = null;

    // Gate 3: dedupe against last published track
    if (line === _lastPublished) {
      console.log(`${ts()} [prolink] dedupe — already published: "${line}"`);
      return;
    }

    _lastPublished = line;
    const publishedAt = Date.now() / 1000;
    console.log(`${ts()} [prolink] PUBLISH device=#${deviceId}: "${line}"`);
    _onPublish?.(line, deviceId, publishedAt);
    _emit?.('trackr:publish', { line, deviceId, publishedAt });
  }, _publishDelayMs);
}

/**
 * Resolve track metadata with retries.
 *
 * Art's library: IDv3 stripped, track.artist is null, full
 * "Key - Artist - Title (Mix)" string is in track.title.
 * cleanTrackLine() strips the Camelot key and normalizes the result.
 *
 * Note: db.getMetadata() routes CDJ+RB tracks through localdb which
 * downloads the rekordbox DB from USB via NFS (~54s cold start, once).
 * Pre-warming in handleStatus() starts this download ASAP.
 */
async function resolveMetadata(status: CDJStatus.State): Promise<string | null> {
  const net = _network;
  if (!net || !net.isConnected()) return null;

  for (let attempt = 1; attempt <= METADATA_RETRIES; attempt++) {
    try {
      const track = await net.db.getMetadata({
        deviceId:  status.trackDeviceId,
        trackSlot: status.trackSlot,
        trackType: status.trackType,
        trackId:   status.trackId,
      });
      if (track?.title) return cleanTrackLine(track.title) || null;
    } catch (err) {
      console.error(`${ts()} [prolink] getMetadata attempt ${attempt}/${METADATA_RETRIES}:`, err);
    }
    if (attempt < METADATA_RETRIES) await sleep(METADATA_RETRY_MS);
  }
  return null;
}

/**
 * Handle raw CDJ status packets — pre-warms localdb and forwards to renderer.
 * Does NOT trigger the publish pipeline (MixstatusProcessor does that).
 */
function handleStatus(status: CDJStatus.State): void {
  _devicePlayStates.set(status.deviceId, status.playState);
  const trackId = status.trackId;

  // Pre-warm localdb: fire a background db.getMetadata() to trigger the NFS
  // download of the rekordbox DB. Runs early so data is cached when needed.
  if (trackId !== 0 && _network?.isConnected()) {
    const warmKey = `${status.trackDeviceId}|${trackId}`;
    if (!_dbWarmedDevices.has(warmKey)) {
      _dbWarmedDevices.add(warmKey);
      console.log(`${ts()} [prolink] pre-warming localdb for device #${status.trackDeviceId} trackId=${trackId}`);
      _network.db.getMetadata({
        deviceId:  status.trackDeviceId,
        trackSlot: status.trackSlot,
        trackType: status.trackType,
        trackId:   status.trackId,
      }).then(t => {
        console.log(`${ts()} [prolink] localdb warm done: device #${status.trackDeviceId} trackId=${trackId} → ${t?.title ? 'OK' : 'no title'}`);
      }).catch(() => {});
    }
  }

  // Forward raw status to renderer for device display
  _emit?.('trackr:cdj-status', {
    deviceId:  status.deviceId,
    playState: status.playState,
    isOnAir:   status.isOnAir,
    trackId:   status.trackId,
  });
}

/**
 * Handle MixstatusProcessor "nowPlaying" event.
 *
 * Fired when a track is confirmed as the main on-air track (128 beats
 * of consecutive play in SmartTiming mode). This replaces our old Gate 1.
 */
function handleNowPlaying(status: CDJStatus.State): void {
  const { deviceId, trackId } = status;
  _nowPlayingDeviceId = deviceId;
  console.log(`${ts()} [prolink] NOW PLAYING #${deviceId} trackId=${trackId} — resolving metadata...`);

  resolveMetadata(status).then(line => {
    if (!line) {
      console.log(`${ts()} [prolink] no metadata for device #${deviceId} trackId=${trackId}`);
      return;
    }

    console.log(`${ts()} [prolink] metadata resolved #${deviceId} — scheduling publish: "${line}"`);
    schedulePending(`${deviceId}|${line}`, line, deviceId);
  }).catch(err => console.error('[prolink] resolveMetadata error:', err));
}

// ─── phase 3 config hooks ────────────────────────────────────────────────────

/** Clear dedupe state so the next track publishes even if it matches the previous session's last track. */
export function resetLastPublished(): void {
  _lastPublished = null;
}

/** Update the publish delay (called from index.ts when config changes). */
export function setPublishDelay(ms: number): void {
  _publishDelayMs = Math.max(0, ms);
}

/** Set a callback that fires in the main process when a track is published. */
export function setPublishCallback(cb: PublishCallback | null): void {
  _onPublish = cb;
}

/** Set a callback that fires when a set ends (30s silence gap detected). */
export function setOnSetEnded(cb: SetEndedCallback | null): void {
  _onSetEnded = cb;
}

// ─── lifecycle ───────────────────────────────────────────────────────────────

/**
 * Bring Pro DJ Link online and start monitoring CDJs.
 * No-op if already running.
 *
 * @param emit  Forwards events to the renderer (mainWindow.webContents.send).
 */
export async function startProlink(emit: EmitFn): Promise<void> {
  if (_network) return;
  _emit = emit;

  console.log(`${ts()} [prolink] Starting...`);
  const network = await bringOnline();

  // Wire device events before autoconfigFromPeers so all devices are caught
  network.deviceManager.on('connected', device => {
    console.log(`${ts()} [prolink] + ${device.name} #${device.id}`);
    emit('trackr:device-update', buildSummaries(network));
  });

  network.deviceManager.on('disconnected', device => {
    console.log(`${ts()} [prolink] - ${device.name} #${device.id}`);
    emit('trackr:device-update', buildSummaries(network));
  });

  console.log(`${ts()} [prolink] Autoconfiguring from network peers...`);
  await network.autoconfigFromPeers();

  console.log(`${ts()} [prolink] Connecting...`);
  network.connect();

  if (!network.isConnected()) {
    throw new Error('[prolink] Failed to enter connected state after connect()');
  }

  // Raw status: pre-warm localdb + forward to renderer
  network.statusEmitter.on('status', handleStatus);

  // MixstatusProcessor: smart beat-counting to determine the "main" track.
  // Accessing network.mixstatus auto-initializes and wires status packets.
  const mixstatus = network.mixstatus!;
  mixstatus.configure({
    mode: MixstatusMode.SmartTiming,
    beatsUntilReported: 128,    // 2 phrases (~62s at 124 BPM) before reporting
    allowedInterruptBeats: 8,   // 2 bars tolerance for brief interruptions
    useOnAirStatus: true,       // respect DJM on-air flag
  });
  mixstatus.on('nowPlaying', handleNowPlaying);
  mixstatus.on('stopped', ({ deviceId }) => {
    console.log(`${ts()} [prolink] mixstatus: device #${deviceId} stopped`);
    if (_nowPlayingDeviceId === deviceId) _nowPlayingDeviceId = null;
    // Cancel pending publish if the stopped device had one queued
    if (_pendingKey?.startsWith(`${deviceId}|`)) {
      console.log(`${ts()} [prolink] cancelling pending publish for stopped device #${deviceId}`);
      cancelPending();
    }
  });
  mixstatus.on('setStarted', () => console.log(`${ts()} [prolink] mixstatus: SET STARTED`));
  mixstatus.on('setEnded', () => {
    _nowPlayingDeviceId = null;

    // Don't auto-reset if any CDJ is paused — DJ might resume.
    // Only count as "set ended" if all CDJs are truly done (cued, ended, empty, etc.)
    const anyPaused = [..._devicePlayStates.values()].some(
      ps => ps === CDJStatus.PlayState.Paused ||
            ps === CDJStatus.PlayState.Loading ||
            ps === CDJStatus.PlayState.PlatterHeld ||
            ps === CDJStatus.PlayState.Searching
    );
    if (anyPaused) {
      console.log(`${ts()} [prolink] mixstatus: SET ENDED (suppressed -- CDJ paused/loading)`);
      return;
    }

    console.log(`${ts()} [prolink] mixstatus: SET ENDED`);
    _onSetEnded?.();
  });

  _network = network;
  console.log(`${ts()} [prolink] Online — MixstatusProcessor active (SmartTiming, 128 beats).`);
  emit('trackr:connected', {});
}

/** Disconnect from the Pro DJ Link network and clean up all state. */
export async function stopProlink(): Promise<void> {
  cancelPending();
  _dbWarmedDevices.clear();
  _devicePlayStates.clear();
  _lastPublished = null;
  _nowPlayingDeviceId = null;
  _emit?.('trackr:disconnected', {});
  _emit       = null;
  _onPublish  = null;
  _onSetEnded = null;

  if (_network) {
    try { await _network.disconnect(); } catch { /* ignore */ }
    _network = null;
  }

  console.log('[prolink] Stopped.');
}
