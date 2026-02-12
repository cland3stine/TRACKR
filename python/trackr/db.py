from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import RLock


class TrackrDatabase:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._initialize_schema()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _initialize_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS counters (
                    name TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS prefs (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                "INSERT OR IGNORE INTO counters(name, value) VALUES ('play_count', 0)"
            )
            self._conn.commit()

    def get_play_count(self) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM counters WHERE name = 'play_count'"
            ).fetchone()
            if row is None:
                return 0
            return int(row[0])

    def increment_play_count(self) -> int:
        with self._lock:
            self._conn.execute(
                "UPDATE counters SET value = value + 1 WHERE name = 'play_count'"
            )
            self._conn.commit()
            return self.get_play_count()

    def get_pref(self, key: str) -> str | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM prefs WHERE key = ?",
                (key,),
            ).fetchone()
            if row is None:
                return None
            return str(row[0])

    def set_pref(self, key: str, value: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO prefs(key, value) VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )
            self._conn.commit()
