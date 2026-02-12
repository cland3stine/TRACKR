from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.session import (  # noqa: E402
    SessionTracker,
    choose_next_session_path,
    format_elapsed,
)
from test_utils import repo_temp_dir  # noqa: E402


class SessionTests(unittest.TestCase):
    def test_session_filename_selection(self) -> None:
        with repo_temp_dir() as root:
            day = date(2026, 2, 12)
            (root / "2026-02-12(1)-tracklist.txt").write_text("", encoding="utf-8")
            (root / "2026-02-12(2)-tracklist.txt").write_text("", encoding="utf-8")

            next_path = choose_next_session_path(root, session_date=day)
            self.assertEqual(next_path.name, "2026-02-12(3)-tracklist.txt")

    def test_timestamp_formatting_rules(self) -> None:
        self.assertEqual(format_elapsed(0), "00:00")
        self.assertEqual(format_elapsed(65), "01:05")
        self.assertEqual(format_elapsed(3661), "1:01:01")

    def test_timestamp_baseline_first_track_is_zero(self) -> None:
        with repo_temp_dir() as temp_dir:
            tracker = SessionTracker(temp_dir, timestamps_enabled=True, delay_seconds=10)
            tracker.start_new_session(session_date=date(2026, 2, 12))

            first = tracker.append("Artist A - First", published_at=100.0)
            second = tracker.append("Artist B - Second", published_at=160.0)

            self.assertIsNotNone(first)
            self.assertIsNotNone(second)
            assert first is not None
            assert second is not None
            self.assertEqual(first.time, "00:00")
            self.assertEqual(second.time, "01:00")

    def test_session_dedupe_ignores_timestamp_prefix_and_case(self) -> None:
        with repo_temp_dir() as temp_dir:
            tracker = SessionTracker(temp_dir, timestamps_enabled=True, delay_seconds=0)
            tracker.start_new_session(session_date=date(2026, 2, 12))

            first = tracker.append("Artist - Title", published_at=100.0)
            duplicate = tracker.append("00:15   artist - title", published_at=105.0)

            self.assertIsNotNone(first)
            self.assertIsNone(duplicate)


if __name__ == "__main__":
    unittest.main()
