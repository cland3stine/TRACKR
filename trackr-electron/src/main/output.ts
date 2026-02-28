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
// Self-contained HTML that polls /trackr for track data and /style for visual
// preferences. OBS Browser Source: http://127.0.0.1:8755/trackr-current.html
const CURRENT_OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <link id="gfonts" rel="stylesheet" href="" />
  <style>
    :root {
      --ff: "Good Times", Arial, sans-serif;
      --fs: 36px;
      --tt: uppercase;
      --ls: 0.15em;
      --fc: #ffffff;
      --lg: 14px;
      --shadow: drop-shadow(6px 6px 6px #000000);
    }
    body { margin: 0; background: transparent; overflow: hidden; }
    .wrap { display: inline-block; max-width: 100vw; }
    .artist, .title {
      font-family: var(--ff);
      color: var(--fc);
      font-size: var(--fs);
      text-transform: var(--tt);
      letter-spacing: var(--ls);
      filter: var(--shadow);
      white-space: nowrap;
      transform-origin: left center;
    }
    .title { margin-top: var(--lg); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="artist"></div>
    <div class="title"></div>
  </div>
  <script>
    const EM = "\\u2014";
    const root = document.documentElement;
    const elArtist = document.querySelector(".artist");
    const elTitle  = document.querySelector(".title");
    const elWrap   = document.querySelector(".wrap");
    const elGfonts = document.getElementById("gfonts");

    // Google Fonts that are NOT local-only
    const GFONTS = ["Orbitron","Rajdhani","Exo 2","Oxanium","Michroma","Share Tech","Audiowide","Bruno Ace","Chakra Petch"];
    let lastFontHref = "";

    function fitText() {
      [elArtist, elTitle].forEach(function(el) {
        el.style.transform = "scaleX(1)";
        var cw = elWrap.offsetWidth || window.innerWidth;
        var sw = el.scrollWidth;
        if (sw > cw && cw > 0) {
          var ratio = Math.max(0.5, cw / sw);
          el.style.transform = "scaleX(" + ratio + ")";
        }
      });
    }

    function applyStyle(s) {
      if (!s) return;
      var ff = s.font_family || "Good Times";
      root.style.setProperty("--ff", '"' + ff + '", Arial, sans-serif');
      root.style.setProperty("--fs", (s.font_size || 36) + "px");
      root.style.setProperty("--tt", s.text_transform || "uppercase");
      root.style.setProperty("--ls", (s.letter_spacing != null ? s.letter_spacing : 0.15) + "em");
      root.style.setProperty("--fc", s.font_color || "#ffffff");
      root.style.setProperty("--lg", (s.line_gap != null ? s.line_gap : 14) + "px");
      if (s.drop_shadow_on !== false) {
        var sx = s.drop_shadow_x != null ? s.drop_shadow_x : 6;
        var sy = s.drop_shadow_y != null ? s.drop_shadow_y : 6;
        var sb = s.drop_shadow_blur != null ? s.drop_shadow_blur : 6;
        var sc = s.drop_shadow_color || "#000000";
        root.style.setProperty("--shadow", "drop-shadow(" + sx + "px " + sy + "px " + sb + "px " + sc + ")");
      } else {
        root.style.setProperty("--shadow", "none");
      }
      // Dynamic Google Fonts link
      var matched = GFONTS.find(function(g) { return g === ff; });
      var href = matched ? "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(matched) + ":wght@400;700&display=swap" : "";
      if (href !== lastFontHref) { elGfonts.href = href; lastFontHref = href; }
      fitText();
    }

    async function pollTrack() {
      try {
        var r = await fetch("/trackr?t=" + Date.now(), { cache: "no-store" });
        var d = await r.json();
        var line = d.current || EM;
        var sep = line.indexOf(" - ");
        if (sep !== -1) {
          elArtist.textContent = line.substring(0, sep);
          elTitle.textContent  = line.substring(sep + 3);
        } else {
          elArtist.textContent = line;
          elTitle.textContent  = "";
        }
        fitText();
      } catch (_) {}
      setTimeout(pollTrack, 750);
    }

    async function pollStyle() {
      try {
        var r = await fetch("/style?t=" + Date.now(), { cache: "no-store" });
        var s = await r.json();
        applyStyle(s);
      } catch (_) {}
      setTimeout(pollStyle, 2000);
    }

    pollTrack();
    pollStyle();
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
