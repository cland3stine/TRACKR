from __future__ import annotations

from pathlib import Path

from trackr.db import TrackrDatabase

TEMPLATE_PREF_KEY = "overlay_template_html"

DEFAULT_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <style>
    body { margin: 0; background: transparent; font-family: "Segoe UI", sans-serif; }
    #current { color: #ffffff; font-size: 36px; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8); }
    #previous { color: #b8b8b8; font-size: 24px; margin-top: 8px; }
  </style>
</head>
<body>
  <div id="current">—</div>
  <div id="previous">—</div>
  <script>
    async function poll() {
      try {
        const response = await fetch("trackr-2-line.txt?t=" + Date.now(), { cache: "no-store" });
        const text = await response.text();
        const lines = text.split(/\\r?\\n/);
        document.getElementById("current").textContent = (lines[0] || "—").trim() || "—";
        document.getElementById("previous").textContent = (lines[1] || "—").trim() || "—";
      } catch (_err) {}
      setTimeout(poll, 750);
    }
    poll();
  </script>
</body>
</html>
"""


class TemplateStore:
    def __init__(self, output_root: Path, db: TrackrDatabase) -> None:
        self._output_root = output_root
        self._db = db
        self._overlay_html_path = output_root / "overlay" / "trackr-obs.html"

    @property
    def overlay_html_path(self) -> Path:
        return self._overlay_html_path

    def get_template(self) -> str:
        saved = self._db.get_pref(TEMPLATE_PREF_KEY)
        if saved is None or not saved.strip():
            return DEFAULT_TEMPLATE
        return saved

    def set_template(self, template_html: str) -> str:
        if template_html is None or not template_html.strip():
            raise ValueError("template_html must be non-empty")
        self._db.set_pref(TEMPLATE_PREF_KEY, template_html)
        self._write_template(template_html)
        return template_html

    def reset_template(self) -> str:
        self._db.set_pref(TEMPLATE_PREF_KEY, DEFAULT_TEMPLATE)
        self._write_template(DEFAULT_TEMPLATE)
        return DEFAULT_TEMPLATE

    def ensure_template_file(self) -> Path:
        self._write_template(self.get_template())
        return self._overlay_html_path

    def _write_template(self, template_html: str) -> None:
        self._overlay_html_path.parent.mkdir(parents=True, exist_ok=True)
        self._overlay_html_path.write_text(template_html, encoding="utf-8", newline="\n")
