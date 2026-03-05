/**
 * TRACKR — Enrichment Orchestrator
 *
 * Async, non-blocking. Called after handlePublish completes.
 * Flow: SQLite cache check → Beatport search → upsert result.
 */

import { TrackrDatabase, TrackRow } from '../database';
import { getConfig, setConfig, EnrichmentConfig } from '../store';
import {
  scrapeClientId, authenticate, searchTrack, fetchReleaseLabel,
  BeatportTokenData,
} from './beatport';
import { ArtCache } from './art-cache';
import { EnrichmentResult } from './types';

// ─── module state ──────────────────────────────────────────────────────────

let _token: string | null = null;
let _tokenExpiresAt = 0;
let _clientId: string | null = null;
const _failedThisSession = new Set<string>(); // "artist|title" keys — don't retry in same session

// ─── helpers ───────────────────────────────────────────────────────────────

function trackKey(artist: string, title: string): string {
  return `${artist}|${title}`;
}

/** Split a published line ("Artist - Title") into [artist, title]. */
export function splitTrackLine(line: string): [string, string] | null {
  const idx = line.indexOf(' - ');
  if (idx <= 0) return null;
  const artist = line.substring(0, idx).trim();
  const title = line.substring(idx + 3).trim();
  if (!artist || !title) return null;
  return [artist, title];
}

/** Ensure we have a valid Beatport token. Re-authenticates if expired. */
async function ensureToken(cfg: EnrichmentConfig): Promise<string | null> {
  // Check if current token is still valid (30s buffer)
  if (_token && Date.now() + 30_000 < _tokenExpiresAt) {
    return _token;
  }

  if (!cfg.beatportUsername || !cfg.beatportPassword) {
    return null;
  }

  // Ensure client_id
  if (!_clientId) {
    _clientId = cfg.beatportClientId || await scrapeClientId();
    if (_clientId !== cfg.beatportClientId) {
      setConfig({ enrichment: { ...cfg, beatportClientId: _clientId } });
    }
  }

  try {
    console.log('[enricher] Authenticating with Beatport...');
    const tokenData: BeatportTokenData = await authenticate(
      cfg.beatportUsername, cfg.beatportPassword, _clientId,
    );
    _token = tokenData.accessToken;
    _tokenExpiresAt = tokenData.expiresAt;

    // Persist token to store
    setConfig({
      enrichment: {
        ...cfg,
        beatportToken: tokenData.accessToken,
        beatportRefreshToken: tokenData.refreshToken,
        beatportTokenExpiresAt: tokenData.expiresAt,
        beatportClientId: _clientId,
      },
    });

    console.log('[enricher] Beatport authenticated');
    return _token;
  } catch (err) {
    console.warn('[enricher] Beatport auth failed:', err);
    _token = null;
    return null;
  }
}

// ─── public API ────────────────────────────────────────────────────────────

/** Reset the per-session failure set (call on session reset). */
export function resetEnrichmentSession(): void {
  _failedThisSession.clear();
}

/**
 * Initialize token from stored config on startup.
 * Non-blocking — if token is expired it will re-auth on first enrichment call.
 */
export function initEnrichment(): void {
  const cfg = getConfig().enrichment;
  if (cfg.beatportToken && cfg.beatportTokenExpiresAt > Date.now() + 30_000) {
    _token = cfg.beatportToken;
    _tokenExpiresAt = cfg.beatportTokenExpiresAt;
    _clientId = cfg.beatportClientId || null;
    console.log('[enricher] Loaded stored Beatport token');
  }
}

/**
 * Test the Beatport connection with current credentials.
 * Returns a status message.
 */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = getConfig().enrichment;
  if (!cfg.beatportUsername || !cfg.beatportPassword) {
    return { ok: false, message: 'Username and password required' };
  }

  try {
    if (!_clientId) {
      _clientId = await scrapeClientId();
    }
    const tokenData = await authenticate(cfg.beatportUsername, cfg.beatportPassword, _clientId);
    _token = tokenData.accessToken;
    _tokenExpiresAt = tokenData.expiresAt;

    setConfig({
      enrichment: {
        ...cfg,
        beatportToken: tokenData.accessToken,
        beatportRefreshToken: tokenData.refreshToken,
        beatportTokenExpiresAt: tokenData.expiresAt,
        beatportClientId: _clientId,
      },
    });

    return { ok: true, message: `Connected as ${cfg.beatportUsername}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

/**
 * Enrich a track asynchronously. Non-blocking, fire-and-forget.
 *
 * @param db        Database instance
 * @param line      Published track line ("Artist - Title")
 * @param artCache  Art cache instance (for downloading album art)
 * @param onDone    Callback when enrichment completes (for IPC notification)
 */
export async function enrichTrack(
  db: TrackrDatabase,
  line: string,
  artCache?: ArtCache | null,
  onDone?: (result: EnrichmentResult) => void,
): Promise<void> {
  const cfg = getConfig();
  if (!cfg.enrichment.enabled) return;

  const parts = splitTrackLine(line);
  if (!parts) return;
  const [artist, title] = parts;

  // Check SQLite cache
  const existing = db.getTrack(artist, title);
  if (existing?.enrichment_status === 'complete') {
    onDone?.(rowToResult(existing));
    return;
  }

  // Don't retry failures in the same session
  const key = trackKey(artist, title);
  if (_failedThisSession.has(key)) return;

  // Ensure token
  const token = await ensureToken(cfg.enrichment);
  if (!token) {
    _failedThisSession.add(key);
    db.updateEnrichment(artist, title, { enrichment_status: 'failed' });
    return;
  }

  try {
    const track = await searchTrack(token, artist, title, cfg.enrichment.timeoutMs);
    if (!track) {
      _failedThisSession.add(key);
      db.updateEnrichment(artist, title, { enrichment_status: 'failed' });
      return;
    }

    // Get label from release detail if not in search result
    let label = track.label;
    if (!label && track.releaseId) {
      label = await fetchReleaseLabel(token, track.releaseId, cfg.enrichment.timeoutMs) || undefined;
    }

    const year = track.publishDate ? parseInt(track.publishDate.substring(0, 4)) : undefined;
    const artUrl = track.artDynamicUri
      ? track.artDynamicUri.replace('{w}', '500').replace('{h}', '500')
      : track.artUri;

    // Download album art to local cache
    let artFilename: string | undefined;
    if (artUrl && artCache) {
      artFilename = await artCache.downloadArt(artist, title, artUrl) || undefined;
    }

    db.updateEnrichment(artist, title, {
      year: year || undefined,
      label: label || undefined,
      genre: track.genre || undefined,
      bpm: track.bpm || undefined,
      key_name: track.key || undefined,
      art_filename: artFilename,
      art_url: artUrl || undefined,
      source: 'beatport',
      enrichment_status: 'complete',
    });

    const updated = db.getTrack(artist, title);
    if (updated) onDone?.(rowToResult(updated));

    console.log(`[enricher] Enriched: ${artist} - ${title} → ${label || '?'} (${year || '?'})`);
  } catch (err) {
    console.warn(`[enricher] Failed for "${artist} - ${title}":`, err);
    _failedThisSession.add(key);
    db.updateEnrichment(artist, title, { enrichment_status: 'failed' });
  }
}

/** Convert a TrackRow to an EnrichmentResult for API/IPC consumption. */
export function rowToResult(row: TrackRow): EnrichmentResult {
  return {
    year: row.year ?? undefined,
    label: row.label ?? undefined,
    genre: row.genre ?? undefined,
    bpm: row.bpm ?? undefined,
    key: row.key_name ?? undefined,
    artUrl: row.art_url ?? undefined,
    artFilename: row.art_filename ?? undefined,
    source: row.source ?? 'beatport',
    status: row.enrichment_status as EnrichmentResult['status'],
  };
}
