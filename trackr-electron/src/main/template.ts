/**
 * TRACKR Phase 3F — Template Store
 *
 * Port of python/trackr/template.py.
 * Persists the OBS overlay HTML template in SQLite and writes it to disk.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TrackrDatabase } from './database';

const TEMPLATE_PREF_KEY = 'overlay_template_html';

export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <style>
    body { margin: 0; background: transparent; font-family: "Segoe UI", sans-serif; }
    #current  { color: #ffffff; font-size: 36px; text-shadow: 0 2px 6px rgba(0,0,0,0.8); }
    #previous { color: #b8b8b8; font-size: 24px; margin-top: 8px; }
  </style>
</head>
<body>
  <div id="current">\u2014</div>
  <div id="previous">\u2014</div>
  <script>
    async function poll() {
      try {
        const r = await fetch("trackr-2-line.txt?t=" + Date.now(), { cache: "no-store" });
        const t = await r.text();
        const lines = t.split(/\\r?\\n/);
        document.getElementById("current").textContent  = (lines[0] || "\u2014").trim() || "\u2014";
        document.getElementById("previous").textContent = (lines[1] || "\u2014").trim() || "\u2014";
      } catch (_) {}
      setTimeout(poll, 750);
    }
    poll();
  </script>
</body>
</html>
`;

export class TemplateStore {
  private _overlayHtmlPath: string;
  private _db: TrackrDatabase;

  constructor(outputRoot: string, db: TrackrDatabase) {
    this._overlayHtmlPath = join(outputRoot, 'overlay', 'trackr-obs.html');
    this._db              = db;
  }

  get overlayHtmlPath(): string { return this._overlayHtmlPath; }

  getTemplate(): string {
    const saved = this._db.getPref(TEMPLATE_PREF_KEY);
    return saved?.trim() ? saved : DEFAULT_TEMPLATE;
  }

  setTemplate(templateHtml: string): string {
    if (!templateHtml?.trim()) throw new Error('template_html must be non-empty');
    this._db.setPref(TEMPLATE_PREF_KEY, templateHtml);
    this._writeTemplate(templateHtml);
    return templateHtml;
  }

  resetTemplate(): string {
    this._db.setPref(TEMPLATE_PREF_KEY, DEFAULT_TEMPLATE);
    this._writeTemplate(DEFAULT_TEMPLATE);
    return DEFAULT_TEMPLATE;
  }

  ensureTemplateFile(): string {
    this._writeTemplate(this.getTemplate());
    return this._overlayHtmlPath;
  }

  private _writeTemplate(html: string): void {
    mkdirSync(join(this._overlayHtmlPath, '..'), { recursive: true });
    // LF line endings, UTF-8 — matches Python behaviour
    writeFileSync(this._overlayHtmlPath, html, { encoding: 'utf8' });
  }
}
