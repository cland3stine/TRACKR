/**
 * TRACKR Phase 3C — Session Tracker
 *
 * Port of python/trackr/session.py.
 * Manages per-session tracklist files with deduplication and timestamps.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { cleanTrackLine, normalizeForDedupe } from './cleaner';

export interface SessionEntry {
  time:     string;
  line:     string;
  rendered: string;
}

export function formatElapsed(seconds: number): string {
  const total   = Math.max(0, Math.trunc(seconds));
  const hours   = Math.trunc(total / 3600);
  const minutes = Math.trunc((total % 3600) / 60);
  const secs    = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Returns "YYYY-MM-DD(N)-tracklist.txt" */
export function buildSessionFilename(date: Date, index: number): string {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${dateStr}(${index})-tracklist.txt`;
}

/** Finds the next available session file path. Creates outputRoot if needed. */
export function chooseNextSessionPath(outputRoot: string, sessionDate?: Date): string {
  const day = sessionDate ?? new Date();
  mkdirSync(outputRoot, { recursive: true });
  let index = 1;
  while (true) {
    const candidate = join(outputRoot, buildSessionFilename(day, index));
    if (!existsSync(candidate)) return candidate;
    index++;
  }
}

export class SessionTracker {
  private _outputRoot:        string;
  private _timestampsEnabled: boolean;
  private _delaySeconds:      number;
  private _sessionFile:       string | null = null;
  private _mixStartAt:        number | null = null;
  private _seen = new Set<string>();

  constructor(outputRoot: string, timestampsEnabled: boolean, delaySeconds: number) {
    this._outputRoot        = outputRoot;
    this._timestampsEnabled = timestampsEnabled;
    this._delaySeconds      = Math.max(0, delaySeconds);
  }

  get sessionFile(): string | null { return this._sessionFile; }

  startNewSession(sessionDate?: Date): string {
    this._sessionFile = chooseNextSessionPath(this._outputRoot, sessionDate);
    mkdirSync(dirname(this._sessionFile), { recursive: true });
    if (!existsSync(this._sessionFile)) writeFileSync(this._sessionFile, '', 'utf8');
    this._seen.clear();
    this._mixStartAt = null;
    this._primeSeen();
    return this._sessionFile;
  }

  resetBaseline(): void {
    this._mixStartAt = null;
  }

  append(line: string, publishedAt?: number): SessionEntry | null {
    if (!this._sessionFile) throw new Error('session not started');

    const cleanedLine = cleanTrackLine(line);
    if (!cleanedLine) return null;

    const normalized = normalizeForDedupe(cleanedLine);
    if (!normalized) return null;
    if (this._seen.has(normalized)) return null;

    // publishedAt is seconds since epoch (matches Python time.time())
    const when               = publishedAt ?? Date.now() / 1000;
    const estimatedTrackStart = when - this._delaySeconds;
    if (this._mixStartAt === null) this._mixStartAt = estimatedTrackStart;
    const relSeconds = Math.max(0, estimatedTrackStart - this._mixStartAt);

    const timestamp = this._timestampsEnabled ? formatElapsed(relSeconds) : '';
    const rendered  = this._timestampsEnabled ? `${timestamp}  ${cleanedLine}` : cleanedLine;

    appendFileSync(this._sessionFile, `${rendered}\n`, { encoding: 'utf8' });
    this._seen.add(normalized);

    return { time: timestamp, line: cleanedLine, rendered };
  }

  /**
   * Append a suffix (e.g. " [Label, 2024]") to a previously written line.
   * Finds the last line in the session file containing `cleanLine` and appends `suffix`.
   */
  appendSuffix(cleanLine: string, suffix: string): boolean {
    if (!this._sessionFile || !existsSync(this._sessionFile)) return false;
    const content = readFileSync(this._sessionFile, 'utf8');
    const lines = content.split('\n');
    let found = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(cleanLine) && !lines[i].includes(suffix)) {
        lines[i] = lines[i] + suffix;
        found = true;
        break;
      }
    }
    if (!found) return false;
    writeFileSync(this._sessionFile, lines.join('\n'), 'utf8');
    return true;
  }

  deleteSessionFile(): boolean {
    if (!this._sessionFile || !existsSync(this._sessionFile)) return false;
    unlinkSync(this._sessionFile);
    return true;
  }

  private _primeSeen(): void {
    if (!this._sessionFile || !existsSync(this._sessionFile)) return;
    const content = readFileSync(this._sessionFile, 'utf8');
    for (const raw of content.split('\n')) {
      const normalized = normalizeForDedupe(raw);
      if (normalized) this._seen.add(normalized);
    }
  }
}
