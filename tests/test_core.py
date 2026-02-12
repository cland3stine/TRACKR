from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.core import TrackrCore  # noqa: E402
from test_utils import repo_temp_dir  # noqa: E402


class CoreTests(unittest.TestCase):
    def test_play_count_increments_only_on_publish(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            start_result = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "lan",
                    "share_play_count_via_api": False,
                }
            )
            self.assertTrue(start_result["ok"])

            first = core.publish("Artist - Track A", published_at=100.0)
            self.assertTrue(first["ok"])
            self.assertTrue(first["data"]["published"])
            self.assertEqual(first["data"]["play_count"], 1)

            duplicate = core.publish("Artist - Track A", published_at=101.0)
            self.assertTrue(duplicate["ok"])
            self.assertFalse(duplicate["data"]["published"])

            second = core.publish("Artist - Track B", published_at=120.0)
            self.assertTrue(second["ok"])
            self.assertTrue(second["data"]["published"])
            self.assertEqual(second["data"]["play_count"], 2)

            running_tracklist = core.get_running_tracklist()
            self.assertTrue(running_tracklist["ok"])
            items = running_tracklist["data"]["items"]
            self.assertEqual(len(items), 2)
            self.assertEqual(items[0]["play_count"], 1)
            self.assertEqual(items[1]["play_count"], 2)


if __name__ == "__main__":
    unittest.main()
