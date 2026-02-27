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

// ─── current-track overlay HTML ─────────────────────────────────────────────
// Self-contained HTML that polls /trackr and shows only the current track.
// OBS Browser Source: http://127.0.0.1:8755/trackr-current.html
const CURRENT_OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <style>
    body { margin: 0; background: transparent; overflow: hidden; }
    .artist, .title {
      font-family: "Good Times Regular", "Good Times", Arial, sans-serif;
      color: #ffffff;
      font-size: 36px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      filter: drop-shadow(6px 6px 6px #000000);
      white-space: nowrap;
    }
    .title { margin-top: 14px; }
  </style>
</head>
<body>
  <div class="artist"></div>
  <div class="title"></div>
  <script>
    const EM = "\\u2014";
    const elArtist = document.querySelector(".artist");
    const elTitle  = document.querySelector(".title");
    async function poll() {
      try {
        const r = await fetch("/trackr?t=" + Date.now(), { cache: "no-store" });
        const d = await r.json();
        const line = d.current || EM;
        const sep = line.indexOf(" - ");
        if (sep !== -1) {
          elArtist.textContent = line.substring(0, sep);
          elTitle.textContent  = line.substring(sep + 3);
        } else {
          elArtist.textContent = line;
          elTitle.textContent  = "";
        }
      } catch (_) {}
      setTimeout(poll, 750);
    }
    poll();
  </script>
</body>
</html>
`;

export class OutputWriter {
  private _overlayDir:             string;
  private _overlayTxtPath:         string;
  private _currentTxtPath:         string;
  private _currentHtmlPath:        string;
  private _sessionTracker:         SessionTracker;
  private _previousOverlayLine:    string = EM_DASH;
  private _runningEntries:         SessionEntry[] = [];

  constructor(outputRoot: string, timestampsEnabled: boolean, delaySeconds: number) {
    this._overlayDir            = join(outputRoot, 'overlay');
    this._overlayTxtPath        = join(this._overlayDir, 'trackr-2-line.txt');
    this._currentTxtPath        = join(this._overlayDir, 'trackr-current.txt');
    this._currentHtmlPath       = join(this._overlayDir, 'trackr-current.html');
    this._sessionTracker        = new SessionTracker(outputRoot, timestampsEnabled, delaySeconds);
  }

  get overlayTxtPath(): string   { return this._overlayTxtPath; }
  get sessionFile():           string | null { return this._sessionTracker.sessionFile; }

  startNewSession(sessionDate?: Date): string {
    this._previousOverlayLine = EM_DASH;
    this._runningEntries      = [];
    // Clear overlay so /trackr returns em-dash (no stale track from previous session)
    this._writeOverlayText(EM_DASH, EM_DASH);
    this._writeCurrentText(EM_DASH);
    return this._sessionTracker.startNewSession(sessionDate);
  }

  ensureOverlayExists(): void {
    mkdirSync(this._overlayDir, { recursive: true });
    if (!existsSync(this._overlayTxtPath)) {
      this._writeOverlayText(EM_DASH, EM_DASH);
      this._previousOverlayLine = EM_DASH;
    }
    // Always write the current-track HTML overlay (keeps it up to date)
    writeFileSync(this._currentHtmlPath, CURRENT_OVERLAY_HTML, 'utf8');
  }

  writeOverlay(line: string): void {
    mkdirSync(this._overlayDir, { recursive: true });
    const current  = cleanTrackLine(line) || EM_DASH;
    const previous = this._previousOverlayLine || EM_DASH;
    this._writeOverlayText(current, previous);
    this._writeCurrentText(current);
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

  private _writeCurrentText(current: string): void {
    writeFileSync(this._currentTxtPath, Buffer.from(`${current}\r\n`, 'utf8'));
  }
}
