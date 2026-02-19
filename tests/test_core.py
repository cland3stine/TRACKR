from __future__ import annotations

import socket
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.core import TrackrCore  # noqa: E402
from test_utils import find_free_port, repo_temp_dir  # noqa: E402


class _CountingBridge:
    def __init__(self) -> None:
        self.start_calls = 0
        self.stop_calls = 0

    def start(self, _on_status, _on_device_count) -> None:
        self.start_calls += 1

    def stop(self) -> None:
        self.stop_calls += 1

    def get_metadata(self, _status):
        return None

    def get_latest_statuses(self):
        return []


def _port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", int(port))) == 0


class CoreTests(unittest.TestCase):
    def test_play_count_increments_only_on_publish(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            self.addCleanup(core.shutdown)
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

    def test_publish_dedupe_uses_normalized_line(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            self.addCleanup(core.shutdown)
            start_result = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 0,
                    "timestamps_enabled": True,
                    "api_enabled": False,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                }
            )
            self.assertTrue(start_result["ok"])

            first = core.publish("Artist  -   Track A", published_at=100.0)
            self.assertTrue(first["ok"])
            self.assertTrue(first["data"]["published"])

            duplicate = core.publish("artist - track a", published_at=101.0)
            self.assertTrue(duplicate["ok"])
            self.assertFalse(duplicate["data"]["published"])

            running_tracklist = core.get_running_tracklist()
            self.assertTrue(running_tracklist["ok"])
            items = running_tracklist["data"]["items"]
            self.assertEqual(len(items), 1)

    def test_start_gates_all_operational_side_effects_until_output_choice(self) -> None:
        with repo_temp_dir() as home_dir:
            legacy_root = home_dir / "NowPlayingLite"
            trackr_root = home_dir / "TRACKR"
            legacy_root.mkdir(parents=True, exist_ok=True)
            port = find_free_port()
            bridge = _CountingBridge()
            core = TrackrCore()

            start_result = core.start(
                {
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                    "api_port": port,
                    "device_bridge": bridge,
                    "home_dir": str(home_dir),
                }
            )

            self.assertTrue(start_result["ok"])
            self.assertTrue(start_result["data"]["needs_user_choice"])
            self.assertEqual(start_result["data"]["state"], "needs_user_choice")
            self.assertEqual(core.get_status()["data"]["app_state"], "needs_user_choice")

            # No operational startup side effects while choice unresolved.
            self.assertEqual(bridge.start_calls, 0)
            self.assertIsNone(core._api_server)
            self.assertIsNone(core._device_bridge)
            self.assertIsNone(core._writer)
            self.assertIsNone(core._db)
            self.assertIsNone(core._templates)
            self.assertIsNone(core._pending_publish_timer)
            self.assertEqual(core._pending_publish_key, None)
            self.assertEqual(len(core._metadata_retry_timers), 0)
            self.assertIsNone(core._startup_probe_timer)
            self.assertFalse(_port_is_open(port))

            self.assertFalse((legacy_root / "overlay").exists())
            self.assertFalse((legacy_root / "overlay" / "trackr-2-line.txt").exists())
            self.assertFalse((legacy_root / "overlay" / "trackr-obs.html").exists())
            self.assertFalse((legacy_root / "trackr.db").exists())
            self.assertFalse((trackr_root / "overlay").exists())
            self.assertFalse((trackr_root / "trackr.db").exists())

    def test_set_output_root_choice_resumes_pending_startup(self) -> None:
        with repo_temp_dir() as home_dir:
            legacy_root = home_dir / "NowPlayingLite"
            legacy_root.mkdir(parents=True, exist_ok=True)
            bridge = _CountingBridge()
            core = TrackrCore()

            blocked = core.start(
                {
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                    "api_enabled": False,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                    "device_bridge": bridge,
                    "home_dir": str(home_dir),
                }
            )
            self.assertTrue(blocked["ok"])
            self.assertTrue(blocked["data"]["needs_user_choice"])
            self.assertEqual(bridge.start_calls, 0)

            chosen = core.set_output_root_choice("legacy")
            self.assertTrue(chosen["ok"])
            self.assertEqual(chosen["data"]["state"], "resolved")
            self.assertEqual(chosen["data"]["output_root"], str(legacy_root))
            self.assertEqual(core.get_status()["data"]["app_state"], "running")
            self.assertEqual(bridge.start_calls, 1)

            # Operational startup happens only after choice is resolved.
            self.assertTrue((legacy_root / "overlay" / "trackr-2-line.txt").exists())
            self.assertTrue((legacy_root / "overlay" / "trackr-obs.html").exists())
            self.assertTrue((legacy_root / "trackr.db").exists())


if __name__ == "__main__":
    unittest.main()
