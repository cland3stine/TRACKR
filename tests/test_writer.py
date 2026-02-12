from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.writer import OutputWriter  # noqa: E402
from test_utils import repo_temp_dir  # noqa: E402


class WriterTests(unittest.TestCase):
    def test_overlay_nowplaying_exact_format(self) -> None:
        with repo_temp_dir() as temp_dir:
            writer = OutputWriter(temp_dir, timestamps_enabled=True, delay_seconds=3)
            writer.start_new_session(session_date=date(2026, 2, 12))
            writer.ensure_overlay_nowplaying_exists()

            writer.write_overlay_nowplaying("Artist One - First")
            first_payload = writer.overlay_nowplaying_path.read_bytes()
            self.assertEqual(first_payload, "Artist One - First\r\n—\r\n".encode("utf-8"))

            writer.write_overlay_nowplaying("Artist Two - Second")
            second_payload = writer.overlay_nowplaying_path.read_bytes()
            self.assertEqual(second_payload, "Artist Two - Second\r\nArtist One - First\r\n".encode("utf-8"))


if __name__ == "__main__":
    unittest.main()
