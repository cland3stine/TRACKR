/**
 * TRACKR Phase 3B — Output Writer
 *
 * Port of python/trackr/writer.py.
 * Manages the 2-line overlay text file and delegates to SessionTracker.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EM_DASH, cleanTrackLine } from './cleaner';
import { SessionEntry, SessionTracker } from './session';

export class OutputWriter {
  private _overlayDir:             string;
  private _overlayTxtPath:         string;
  private _sessionTracker:         SessionTracker;
  private _previousOverlayLine:    string = EM_DASH;
  private _runningEntries:         SessionEntry[] = [];

  constructor(outputRoot: string, timestampsEnabled: boolean, delaySeconds: number) {
    this._overlayDir            = join(outputRoot, 'overlay');
    this._overlayTxtPath        = join(this._overlayDir, 'trackr-2-line.txt');
    this._sessionTracker        = new SessionTracker(outputRoot, timestampsEnabled, delaySeconds);
  }

  get overlayTxtPath(): string   { return this._overlayTxtPath; }
  get sessionFile():           string | null { return this._sessionTracker.sessionFile; }

  startNewSession(sessionDate?: Date): string {
    this._previousOverlayLine = EM_DASH;
    this._runningEntries      = [];
    return this._sessionTracker.startNewSession(sessionDate);
  }

  ensureOverlayExists(): void {
    mkdirSync(this._overlayDir, { recursive: true });
    if (!existsSync(this._overlayTxtPath)) {
      this._writeOverlayText(EM_DASH, EM_DASH);
      this._previousOverlayLine = EM_DASH;
    }
  }

  writeOverlay(line: string): void {
    mkdirSync(this._overlayDir, { recursive: true });
    const current  = cleanTrackLine(line) || EM_DASH;
    const previous = this._previousOverlayLine || EM_DASH;
    this._writeOverlayText(current, previous);
    this._previousOverlayLine = current;
  }

  appendTrack(line: string, publishedAt?: number): SessionEntry | null {
    const entry = this._sessionTracker.append(line, publishedAt);
    if (entry) this._runningEntries.push(entry);
    return entry;
  }

  getRunningEntries(): Array<{ time: string; line: string }> {
    return this._runningEntries.map(e => ({ time: e.time, line: e.line }));
  }

  private _writeOverlayText(current: string, previous: string): void {
    // Contract: UTF-8, CRLF line endings, trailing newline.
    const payload = `${current}\r\n${previous}\r\n`;
    writeFileSync(this._overlayTxtPath, Buffer.from(payload, 'utf8'));
  }
}
