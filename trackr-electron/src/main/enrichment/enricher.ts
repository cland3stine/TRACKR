/**
 * TRACKR — Enrichment Orchestrator
 *
 * Async, non-blocking. Called after handlePublish completes.
 * Flow: SQLite cache check → Beatport search → upsert result.
 */

import { TrackrDatabase, TrackRow } from '../database';
import { getConfig, setConfig, EnrichmentConfig } from '../store';
import {
  scrapeClientId, authenticate, refreshToken, searchTrack, fetchReleaseLabel,
  BeatportTokenData,
} from './beatport';
import { ArtCache } from './art-cache';
import { EnrichmentResult } from './types';

// ─── module state ──────────────────────────────────────────────────────────

let _token: string | null = null;
let _tokenExpiresAt = 0;
let _clientId: string | null = null;
let _refreshToken: string | null = null;
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

/** Persist token data to in-memory state and electron-store. */
function _saveToken(cfg: EnrichmentConfig, tokenData: BeatportTokenData): void {
  _token = tokenData.accessToken;
  _tokenExpiresAt = tokenData.expiresAt;
  _refreshToken = tokenData.refreshToken || _refreshToken;
  setConfig({
    enrichment: {
      ...cfg,
      beatportToken: tokenData.accessToken,
      beatportRefreshToken: tokenData.refreshToken || cfg.beatportRefreshToken,
      beatportTokenExpiresAt: tokenData.expiresAt,
      beatportClientId: _clientId || cfg.beatportClientId,
    },
  });
}

/** Ensure we have a valid Beatport token. Tries refresh first, falls back to full auth. */
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

  // Try refresh token first (1 HTTP call vs 3 for full auth)
  const storedRefresh = _refreshToken || cfg.beatportRefreshToken;
  if (storedRefresh && _clientId) {
    try {
      const t0 = Date.now();
      console.log('[enricher] Refreshing Beatport token...');
      const tokenData = await refreshToken(storedRefresh, _clientId);
      _saveToken(cfg, tokenData);
      console.log(`[enricher] Token refreshed (${Date.now() - t0}ms)`);
      return _token;
    } catch (err) {
      console.warn('[enricher] Token refresh failed, falling back to full auth:', err);
    }
  }

  // Full re-authentication
  try {
    const t0 = Date.now();
    console.log('[enricher] Authenticating with Beatport...');
    const tokenData: BeatportTokenData = await authenticate(
      cfg.beatportUsername, cfg.beatportPassword, _clientId,
    );
    _saveToken(cfg, tokenData);
    console.log(`[enricher] Beatport authenticated (${Date.now() - t0}ms)`);
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
  _refreshToken = cfg.beatportRefreshToken || null;
  _clientId = cfg.beatportClientId || null;
  if (cfg.beatportToken && cfg.beatportTokenExpiresAt > Date.now() + 30_000) {
    _token = cfg.beatportToken;
    _tokenExpiresAt = cfg.beatportTokenExpiresAt;
    console.log('[enricher] Loaded stored Beatport token');
  } else if (_refreshToken) {
    console.log('[enricher] Stored token expired — will refresh on first enrichment');
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
    const t0 = Date.now();
    const track = await searchTrack(token, artist, title, cfg.enrichment.timeoutMs);
    const searchMs = Date.now() - t0;
    if (!track) {
      console.log(`[enricher] Search miss: ${artist} - ${title} (${searchMs}ms)`);
      _failedThisSession.add(key);
      db.updateEnrichment(artist, title, { enrichment_status: 'failed' });
      return;
    }
    console.log(`[enricher] Search hit: ${searchMs}ms`);

    // Get label from release detail if not in search result
    let label = track.label;
    if (!label && track.releaseId) {
      const t1 = Date.now();
      label = await fetchReleaseLabel(token, track.releaseId, cfg.enrichment.timeoutMs) || undefined;
      console.log(`[enricher] Label fetch: ${Date.now() - t1}ms`);
    }

    const releaseDate = track.publishDate || undefined;   // full "YYYY-MM-DD"
    const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : undefined;
    const artUrl = track.artDynamicUri
      ? track.artDynamicUri.replace('{w}', '500').replace('{h}', '500')
      : track.artUri;

    // Download album art to local cache
    let artFilename: string | undefined;
    if (artUrl && artCache) {
      const t2 = Date.now();
      artFilename = await artCache.downloadArt(artist, title, artUrl) || undefined;
      console.log(`[enricher] Art download: ${Date.now() - t2}ms`);
    }

    db.updateEnrichment(artist, title, {
      year: year || undefined,
      release_date: releaseDate,
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

    console.log(`[enricher] Enriched: ${artist} - ${title} → ${label || '?'} (${year || '?'}) [total ${Date.now() - t0}ms]`);
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
    releaseDate: row.release_date ?? undefined,
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
