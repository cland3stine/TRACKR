from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from time import time

from trackr.text_cleaner import clean_track_line, normalize_for_dedupe


def build_session_filename(session_date: date, index: int) -> str:
    if index < 1:
        raise ValueError("session index must be >= 1")
    return f"{session_date.isoformat()}({index})-tracklist.txt"


def choose_next_session_path(output_root: Path, session_date: date | None = None) -> Path:
    day = session_date or date.today()
    output_root.mkdir(parents=True, exist_ok=True)
    index = 1
    while True:
        candidate = output_root / build_session_filename(day, index)
        if not candidate.exists():
            return candidate
        index += 1


def format_elapsed(seconds: int | float) -> str:
    total_seconds = int(max(0, seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


@dataclass(frozen=True)
class SessionEntry:
    time: str
    line: str
    rendered: str


class SessionTracker:
    def __init__(self, output_root: Path, timestamps_enabled: bool, delay_seconds: int) -> None:
        self._output_root = output_root
        self._timestamps_enabled = timestamps_enabled
        self._delay_seconds = max(0, delay_seconds)
        self._session_file: Path | None = None
        self._mix_start_at: float | None = None
        self._seen: set[str] = set()

    @property
    def session_file(self) -> Path | None:
        return self._session_file

    def start_new_session(self, session_date: date | None = None) -> Path:
        self._session_file = choose_next_session_path(self._output_root, session_date)
        self._session_file.parent.mkdir(parents=True, exist_ok=True)
        self._session_file.touch(exist_ok=True)
        self._seen.clear()
        self._mix_start_at = None
        self._prime_seen()
        return self._session_file

    def reset_baseline(self) -> None:
        self._mix_start_at = None

    def append(self, line: str, published_at: float | None = None) -> SessionEntry | None:
        if self._session_file is None:
            raise RuntimeError("session is not started")

        cleaned_line = clean_track_line(line)
        if not cleaned_line:
            return None

        normalized = normalize_for_dedupe(cleaned_line)
        if not normalized:
            return None
        if normalized in self._seen:
            return None

        when = time() if published_at is None else published_at
        estimated_track_start = when - self._delay_seconds
        if self._mix_start_at is None:
            self._mix_start_at = estimated_track_start
        rel_seconds = max(0, estimated_track_start - self._mix_start_at)

        timestamp = format_elapsed(rel_seconds) if self._timestamps_enabled else ""
        rendered = f"{timestamp}  {cleaned_line}" if self._timestamps_enabled else cleaned_line

        with self._session_file.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(f"{rendered}\n")

        self._seen.add(normalized)
        return SessionEntry(time=timestamp, line=cleaned_line, rendered=rendered)

    def _prime_seen(self) -> None:
        if self._session_file is None or not self._session_file.exists():
            return
        for raw in self._session_file.read_text(encoding="utf-8").splitlines():
            normalized = normalize_for_dedupe(raw)
            if normalized:
                self._seen.add(normalized)
