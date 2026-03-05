/**
 * TRACKR — Beatport API v4 Client
 *
 * Auth flow reverse-engineered from beets-beatport4 plugin.
 * 3-step session-cookie authorization code grant using public client_id
 * scraped from Beatport's Swagger UI docs.
 */

import { BeatportTrack } from './types';

const API_BASE = 'https://api.beatport.com/v4';
const REDIRECT_URI = 'https://api.beatport.com/v4/auth/o/post-message/';
const DOCS_URL = 'https://api.beatport.com/v4/docs/';
const HARDCODED_CLIENT_ID = '0GIvkCltVIuPkkwSJHp6NDb3s0potTjLBQr388Dd';
const USER_AGENT = 'TRACKR/1.0';

// ─── cookie jar (minimal) ──────────────────────────────────────────────────

class CookieJar {
  private cookies = new Map<string, string>();

  capture(headers: Headers): void {
    const raw = headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        this.cookies.set(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
      }
    }
  }

  toString(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// ─── token type ────────────────────────────────────────────────────────────

export interface BeatportTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

// ─── public API ────────────────────────────────────────────────────────────

/** Scrape the public client_id from Beatport's docs page. */
export async function scrapeClientId(): Promise<string> {
  try {
    const res = await fetch(DOCS_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    const scriptUrls = [...html.matchAll(/src=["']([^"']*\.js)["']/g)]
      .map(m => m[1])
      .map(u => u.startsWith('http') ? u : `https://api.beatport.com${u}`);

    for (const url of scriptUrls) {
      const jsRes = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      const js = await jsRes.text();
      const match = js.match(/API_CLIENT_ID:\s*['"]([^'"]+)['"]/);
      if (match) {
        console.log(`[beatport] Scraped client_id: ${match[1]}`);
        return match[1];
      }
    }
  } catch (err) {
    console.warn('[beatport] Client ID scrape failed:', err);
  }
  console.log(`[beatport] Using hardcoded client_id: ${HARDCODED_CLIENT_ID}`);
  return HARDCODED_CLIENT_ID;
}

/**
 * Authenticate with Beatport using the 3-step session-cookie auth flow.
 * Returns token data on success, throws on failure.
 */
export async function authenticate(
  username: string,
  password: string,
  clientId: string,
): Promise<BeatportTokenData> {
  const jar = new CookieJar();
  const timeout = 15_000;

  // Step 1: Login
  const loginRes = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
  });
  jar.capture(loginRes.headers);

  if (!loginRes.ok) {
    throw new Error(`Beatport login failed (HTTP ${loginRes.status})`);
  }
  const loginData = await loginRes.json() as Record<string, unknown>;
  if (!loginData.username && !loginData.email) {
    throw new Error('Beatport login failed: invalid credentials');
  }

  // Step 2: Get authorization code (must NOT follow redirect)
  const authUrl = `${API_BASE}/auth/o/authorize/?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  const authRes = await fetch(authUrl, {
    headers: { 'User-Agent': USER_AGENT, Cookie: jar.toString() },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
  });
  jar.capture(authRes.headers);

  const location = authRes.headers.get('location') || '';
  const codeMatch = location.match(/[?&]code=([^&]+)/);
  if (!codeMatch) {
    throw new Error(`Beatport auth: no code in redirect (status ${authRes.status})`);
  }

  // Step 3: Exchange code for token (params as query string)
  const tokenUrl = `${API_BASE}/auth/o/token/?code=${codeMatch[1]}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${clientId}`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Cookie: jar.toString() },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
  });

  if (!tokenRes.ok) {
    throw new Error(`Beatport token exchange failed (HTTP ${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json() as Record<string, unknown>;
  if (!tokenData.access_token) {
    throw new Error('Beatport token exchange: no access_token');
  }

  return {
    accessToken: tokenData.access_token as string,
    refreshToken: (tokenData.refresh_token as string) || '',
    expiresAt: Date.now() + ((tokenData.expires_in as number) || 3600) * 1000,
  };
}

/** Search Beatport for a track by artist + title. Returns null if not found. */
export async function searchTrack(
  token: string,
  artist: string,
  title: string,
  timeoutMs = 5000,
): Promise<BeatportTrack | null> {
  const query = `${artist} ${title}`;
  const url = `${API_BASE}/catalog/search/?q=${encodeURIComponent(query)}&type=tracks&per_page=5`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;

  const data = await res.json() as Record<string, unknown>;
  const tracks = (data.tracks || []) as Array<Record<string, unknown>>;
  if (tracks.length === 0) return null;

  // Find best match — prefer exact artist match
  const artistLower = artist.toLowerCase().split(',')[0].trim();
  let best: Record<string, unknown> | null = null;
  let confidence = 'weak';

  for (const t of tracks) {
    const tArtists = ((t.artists || []) as Array<{ name: string }>).map(a => a.name.toLowerCase());
    const tName = ((t.name || '') as string).toLowerCase();
    const titleLower = title.toLowerCase();
    const artistMatch = tArtists.some(a => a.includes(artistLower) || artistLower.includes(a));

    if (artistMatch && tName === titleLower) {
      best = t; confidence = 'exact'; break;
    }
    if (artistMatch && tName.includes(titleLower)) {
      best = t; confidence = 'strong'; break;
    }
    if (artistMatch && !best) {
      best = t; confidence = 'artist-match';
    }
  }

  if (!best) {
    best = tracks[0];
    confidence = 'weak';
  }

  // If confidence is weak (no artist match at all), treat as not found
  if (confidence === 'weak') return null;

  const release = (best.release || {}) as Record<string, unknown>;
  const image = (release.image || {}) as Record<string, unknown>;
  const label = best.label as { name?: string } | undefined;
  const key = best.key as { name?: string } | undefined;
  const genre = best.genre as { name?: string } | undefined;
  const subGenre = best.sub_genre as { name?: string } | undefined;
  const artists = (best.artists || []) as Array<{ name: string }>;

  return {
    id: best.id as number,
    name: best.name as string,
    mixName: best.mix_name as string | undefined,
    artists: artists.map(a => ({ id: (a as Record<string, unknown>).id as number, name: a.name })),
    bpm: best.bpm as number | undefined,
    key: key?.name,
    genre: subGenre?.name || genre?.name,
    publishDate: (best.publish_date as string) || (release.publish_date as string) || undefined,
    label: label?.name || undefined,
    releaseName: release.name as string | undefined,
    releaseId: release.id as number | undefined,
    artUri: image.uri as string | undefined,
    artDynamicUri: image.dynamic_uri as string | undefined,
  };
}

/** Fetch label from a release detail endpoint (fallback when search doesn't include it). */
export async function fetchReleaseLabel(
  token: string,
  releaseId: number,
  timeoutMs = 5000,
): Promise<string | null> {
  const url = `${API_BASE}/catalog/releases/${releaseId}/`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const label = data.label as { name?: string } | undefined;
    return label?.name || null;
  } catch {
    return null;
  }
}
