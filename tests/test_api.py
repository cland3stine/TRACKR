from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.core import TrackrCore  # noqa: E402
from test_utils import find_free_port, repo_temp_dir, wait_get_json  # noqa: E402


class ApiTests(unittest.TestCase):
    def test_localhost_vs_lan_bind_configuration(self) -> None:
        with repo_temp_dir() as temp_dir:
            localhost_port = find_free_port()
            core = TrackrCore()
            self.addCleanup(core.stop)

            start_local = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                    "api_port": localhost_port,
                }
            )
            self.assertTrue(start_local["ok"])
            status_local = core.get_status()["data"]
            self.assertEqual(status_local["api_effective_bind_host"], "127.0.0.1")

            health_local = wait_get_json(f"http://127.0.0.1:{localhost_port}/health")
            self.assertTrue(health_local["ok"])
            self.assertTrue(health_local["is_running"])

            core.stop()

            lan_port = find_free_port()
            start_lan = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "lan",
                    "share_play_count_via_api": False,
                    "api_port": lan_port,
                }
            )
            self.assertTrue(start_lan["ok"])
            status_lan = core.get_status()["data"]
            self.assertEqual(status_lan["api_effective_bind_host"], "0.0.0.0")

            health_lan = wait_get_json(f"http://127.0.0.1:{lan_port}/health")
            self.assertTrue(health_lan["ok"])
            self.assertTrue(health_lan["is_running"])

    def test_nowplaying_play_count_omitted_or_included_without_file_changes(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            self.addCleanup(core.stop)

            first_port = find_free_port()
            start_hidden_count = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                    "api_port": first_port,
                }
            )
            self.assertTrue(start_hidden_count["ok"])
            publish_one = core.publish("Artist - Track One", published_at=100.0)
            self.assertTrue(publish_one["ok"])
            self.assertTrue(publish_one["data"]["published"])

            status_one = core.get_status()["data"]
            session_path_one = Path(temp_dir) / status_one["session_file_name"]
            overlay_path_one = Path(temp_dir) / "overlay" / "nowplaying.txt"
            overlay_before_one = overlay_path_one.read_bytes()
            session_before_one = session_path_one.read_bytes()

            nowplaying_without_count = wait_get_json(f"http://127.0.0.1:{first_port}/nowplaying")
            self.assertEqual(nowplaying_without_count["current"], "Artist - Track One")
            self.assertEqual(nowplaying_without_count["previous"], "—")
            self.assertNotIn("play_count", nowplaying_without_count)
            self.assertEqual(overlay_path_one.read_bytes(), overlay_before_one)
            self.assertEqual(session_path_one.read_bytes(), session_before_one)

            core.stop()

            second_port = find_free_port()
            start_shared_count = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": True,
                    "api_port": second_port,
                }
            )
            self.assertTrue(start_shared_count["ok"])
            publish_two = core.publish("Artist - Track Two", published_at=200.0)
            self.assertTrue(publish_two["ok"])
            self.assertTrue(publish_two["data"]["published"])

            status_two = core.get_status()["data"]
            session_path_two = Path(temp_dir) / status_two["session_file_name"]
            overlay_path_two = Path(temp_dir) / "overlay" / "nowplaying.txt"
            overlay_before_two = overlay_path_two.read_bytes()
            session_before_two = session_path_two.read_bytes()

            nowplaying_with_count = wait_get_json(f"http://127.0.0.1:{second_port}/nowplaying")
            self.assertEqual(nowplaying_with_count["current"], "Artist - Track Two")
            self.assertEqual(nowplaying_with_count["previous"], "—")
            self.assertIn("play_count", nowplaying_with_count)
            self.assertEqual(nowplaying_with_count["play_count"], 2)
            self.assertEqual(overlay_path_two.read_bytes(), overlay_before_two)
            self.assertEqual(session_path_two.read_bytes(), session_before_two)


if __name__ == "__main__":
    unittest.main()
