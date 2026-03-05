/**
 * TRACKR — Album Art Cache
 *
 * Downloads album art from Beatport and caches locally.
 * Optionally copies current art to overlay/ for OBS.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const USER_AGENT = 'TRACKR/1.0';

// 1x1 transparent PNG — written to overlay when no art is available
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function artKey(artist: string, title: string): string {
  return createHash('md5').update(`${artist}|${title}`).digest('hex');
}

export class ArtCache {
  private _cacheDir: string;
  private _overlayDir: string;
  private _overlayArtPath: string;

  constructor(outputRoot: string) {
    this._cacheDir = join(outputRoot, 'cache', 'art');
    this._overlayDir = join(outputRoot, 'overlay');
    this._overlayArtPath = join(this._overlayDir, 'albumart.jpg');
    mkdirSync(this._cacheDir, { recursive: true });
  }

  /** Filename for a track's cached art (deterministic from artist+title). */
  getFilename(artist: string, title: string): string {
    return `${artKey(artist, title)}.jpg`;
  }

  /** Full path for a cached art file by filename. Null if doesn't exist. */
  getFullPath(filename: string): string | null {
    const p = join(this._cacheDir, filename);
    return existsSync(p) ? p : null;
  }

  /** Full path for a track's cached art. Null if not cached. */
  getCachedPath(artist: string, title: string): string | null {
    return this.getFullPath(this.getFilename(artist, title));
  }

  /** Download art from URL and save to cache. Returns filename or null on failure. */
  async downloadArt(
    artist: string,
    title: string,
    artUrl: string,
    timeoutMs = 10_000,
  ): Promise<string | null> {
    const filename = this.getFilename(artist, title);
    const filepath = join(this._cacheDir, filename);

    if (existsSync(filepath)) return filename;

    try {
      const res = await fetch(artUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) return null;
      writeFileSync(filepath, buffer);
      console.log(`[art-cache] Downloaded: ${filename} (${Math.round(buffer.length / 1024)}KB)`);
      return filename;
    } catch (err) {
      console.warn(`[art-cache] Download failed for ${artist} - ${title}:`, err);
      return null;
    }
  }

  /** Copy a track's cached art to overlay/albumart.jpg. Returns true if copied. */
  copyToOverlay(artist: string, title: string): boolean {
    const cachedPath = this.getCachedPath(artist, title);
    if (!cachedPath) return false;
    mkdirSync(this._overlayDir, { recursive: true });
    copyFileSync(cachedPath, this._overlayArtPath);
    return true;
  }

  /** Write a transparent placeholder to overlay (no art available or session reset). */
  clearOverlay(): void {
    mkdirSync(this._overlayDir, { recursive: true });
    writeFileSync(this._overlayArtPath, TRANSPARENT_PNG);
  }

  get overlayArtPath(): string { return this._overlayArtPath; }
}
