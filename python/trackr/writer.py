from __future__ import annotations

from datetime import date
from pathlib import Path

from trackr.session import SessionEntry, SessionTracker
from trackr.text_cleaner import EM_DASH, clean_track_line


class OutputWriter:
    def __init__(self, output_root: Path, timestamps_enabled: bool, delay_seconds: int) -> None:
        self._output_root = output_root
        self._overlay_dir = output_root / "overlay"
        self._overlay_nowplaying_path = self._overlay_dir / "trackr-2-line.txt"
        self._session_tracker = SessionTracker(output_root, timestamps_enabled, delay_seconds)
        self._previous_overlay_line = EM_DASH
        self._running_entries: list[SessionEntry] = []

    @property
    def overlay_nowplaying_path(self) -> Path:
        return self._overlay_nowplaying_path

    @property
    def session_file(self) -> Path | None:
        return self._session_tracker.session_file

    def start_new_session(self, session_date: date | None = None) -> Path:
        self._previous_overlay_line = EM_DASH
        self._running_entries.clear()
        return self._session_tracker.start_new_session(session_date=session_date)

    def ensure_overlay_nowplaying_exists(self) -> None:
        self._overlay_dir.mkdir(parents=True, exist_ok=True)
        if not self._overlay_nowplaying_path.exists():
            self._write_overlay_text(EM_DASH, EM_DASH)
            self._previous_overlay_line = EM_DASH

    def write_overlay_nowplaying(self, line: str) -> None:
        self._overlay_dir.mkdir(parents=True, exist_ok=True)
        current = clean_track_line(line) or EM_DASH
        previous = self._previous_overlay_line or EM_DASH
        self._write_overlay_text(current, previous)
        self._previous_overlay_line = current

    def append_track(self, line: str, published_at: float | None = None) -> SessionEntry | None:
        entry = self._session_tracker.append(line, published_at=published_at)
        if entry is not None:
            self._running_entries.append(entry)
        return entry

    def get_running_entries(self) -> list[dict[str, str]]:
        return [{"time": entry.time, "line": entry.line} for entry in self._running_entries]

    def _write_overlay_text(self, current: str, previous: str) -> None:
        # Contract requires UTF-8, CRLF newlines, and trailing newline.
        payload = f"{current}\r\n{previous}\r\n"
        self._overlay_nowplaying_path.write_bytes(payload.encode("utf-8"))
