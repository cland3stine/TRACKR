/**
 * TRACKR Phase 2 — Pro DJ Link Integration
 *
 * Wraps prolink-connect to provide CDJ device monitoring and the track
 * publish trigger pipeline (v2 spec Section B, steps 10–17):
 *
 *   Gate 1: isOnAir && isPlaying (Playing or Looping)
 *   Gate 2: Metadata resolved (retry 350ms × 6 = ~2.1s max)
 *   Timer:  PUBLISH_DELAY_MS before committing (default 3s)
 *   Gate 3: Dedupe against lastPublished
 *
 * Phase 3: resolveMetadata() applies cleanTrackLine() to track.title.
 *   setPublishDelay(ms) wires the delay from the config store.
 *   setPublishCallback(fn) lets index.ts handle file I/O on publish.
 */

import { bringOnline, CDJStatus, DeviceType } from 'prolink-connect';
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

type Network = Awaited<ReturnType<typeof bringOnline>>;

// ─── constants ───────────────────────────────────────────────────────────────

/** Delay (ms) — updated at runtime via setPublishDelay(). */
let _publishDelayMs = 3_000;

/** Max metadata fetch attempts before giving up. */
const METADATA_RETRIES  = 6;

/** Delay (ms) between metadata fetch attempts. */
const METADATA_RETRY_MS = 350;

// ─── module state ────────────────────────────────────────────────────────────

let _network:      Network         | null = null;
let _emit:         EmitFn          | null = null;
let _onPublish:    PublishCallback | null = null;

let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingKey:    string | null = null;
let _lastPublished: string | null = null;

interface LastState {
  isOnAir:   boolean;
  playState: CDJStatus.PlayState;
  trackId:   number;
}
const _lastState = new Map<number, LastState>();

// ─── helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isPlaying(state: CDJStatus.PlayState): boolean {
  return state === CDJStatus.PlayState.Playing ||
         state === CDJStatus.PlayState.Looping;
}

function stateChanged(status: CDJStatus.State): boolean {
  const prev = _lastState.get(status.deviceId);
  if (!prev) return true;
  return prev.isOnAir   !== status.isOnAir   ||
         prev.playState !== status.playState ||
         prev.trackId   !== status.trackId;
}

function saveState(status: CDJStatus.State): void {
  _lastState.set(status.deviceId, {
    isOnAir:   status.isOnAir,
    playState: status.playState,
    trackId:   status.trackId,
  });
}

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
      console.log(`[prolink] dedupe — already published: "${line}"`);
      return;
    }

    _lastPublished = line;
    const publishedAt = Date.now() / 1000;
    console.log(`[prolink] PUBLISH device=#${deviceId}: "${line}"`);
    _onPublish?.(line, deviceId, publishedAt);
    _emit?.('trackr:publish', { line, deviceId, publishedAt });
  }, _publishDelayMs);
}

/**
 * Resolve track metadata with retries (Gate 2).
 *
 * Returns the cleaned track line ready for publish.
 * Art's library: IDv3 stripped, track.artist is null, full
 * "Key - Artist - Title (Mix)" string is in track.title.
 * cleanTrackLine() strips the Camelot key and normalizes the result.
 */
async function resolveMetadata(status: CDJStatus.State): Promise<string | null> {
  const net = _network;
  if (!net || !net.isConnected()) return null;
  const { db } = net;

  for (let attempt = 1; attempt <= METADATA_RETRIES; attempt++) {
    try {
      const track = await db.getMetadata({
        deviceId:  status.trackDeviceId,
        trackSlot: status.trackSlot,
        trackType: status.trackType,
        trackId:   status.trackId,
      });
      if (track?.title) return cleanTrackLine(track.title) || null;
    } catch (err) {
      console.error(`[prolink] getMetadata attempt ${attempt}/${METADATA_RETRIES}:`, err);
    }
    if (attempt < METADATA_RETRIES) await sleep(METADATA_RETRY_MS);
  }
  return null;
}

/** Process one CDJ status packet. */
function handleStatus(status: CDJStatus.State): void {
  if (!stateChanged(status)) return;
  saveState(status);

  // Forward raw status to renderer for device display
  _emit?.('trackr:cdj-status', {
    deviceId:  status.deviceId,
    playState: status.playState,
    isOnAir:   status.isOnAir,
    trackId:   status.trackId,
  });

  // Gate 1: must be on-air, playing, and have a loaded track
  if (!status.isOnAir || !isPlaying(status.playState) || status.trackId === 0) {
    if (_pendingKey?.startsWith(`${status.deviceId}|`)) {
      console.log(`[prolink] Gate 1 dropped for device #${status.deviceId} — cancelling pending`);
      cancelPending();
    }
    return;
  }

  // Gate 2: metadata (async with retries)
  const { deviceId } = status;
  resolveMetadata(status).then(line => {
    if (!line) {
      console.log(`[prolink] Gate 2 — no metadata for device #${deviceId} trackId=${status.trackId}`);
      return;
    }
    schedulePending(`${deviceId}|${line}`, line, deviceId);
  }).catch(err => console.error('[prolink] resolveMetadata error:', err));
}

// ─── phase 3 config hooks ────────────────────────────────────────────────────

/** Update the publish delay (called from index.ts when config changes). */
export function setPublishDelay(ms: number): void {
  _publishDelayMs = Math.max(0, ms);
}

/** Set a callback that fires in the main process when a track is published. */
export function setPublishCallback(cb: PublishCallback | null): void {
  _onPublish = cb;
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

  console.log('[prolink] Starting...');
  const network = await bringOnline();

  // Wire device events before autoconfigFromPeers so all devices are caught
  network.deviceManager.on('connected', device => {
    console.log(`[prolink] + ${device.name} #${device.id}`);
    emit('trackr:device-update', buildSummaries(network));
  });

  network.deviceManager.on('disconnected', device => {
    console.log(`[prolink] - ${device.name} #${device.id}`);
    _lastState.delete(device.id);
    emit('trackr:device-update', buildSummaries(network));
  });

  console.log('[prolink] Autoconfiguring from network peers...');
  await network.autoconfigFromPeers();

  console.log('[prolink] Connecting...');
  network.connect();

  if (!network.isConnected()) {
    throw new Error('[prolink] Failed to enter connected state after connect()');
  }

  network.statusEmitter.on('status', handleStatus);

  _network = network;
  console.log('[prolink] Online — monitoring CDJs.');
  emit('trackr:connected', {});
}

/** Disconnect from the Pro DJ Link network and clean up all state. */
export async function stopProlink(): Promise<void> {
  cancelPending();
  _lastState.clear();
  _lastPublished = null;
  _emit?.('trackr:disconnected', {});
  _emit      = null;
  _onPublish = null;

  if (_network) {
    try { await _network.disconnect(); } catch { /* ignore */ }
    _network = null;
  }

  console.log('[prolink] Stopped.');
}
