from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.api import TrackrApiServer  # noqa: E402
from trackr.core import TrackrCore  # noqa: E402
from trackr.text_cleaner import EM_DASH  # noqa: E402
from test_utils import find_free_port, repo_temp_dir, request_json, wait_get_json  # noqa: E402


class ApiTests(unittest.TestCase):
    def test_localhost_vs_lan_bind_configuration(self) -> None:
        with repo_temp_dir() as temp_dir:
            localhost_port = find_free_port()
            localhost_core = TrackrCore()
            self.addCleanup(localhost_core.shutdown)

            start_local = localhost_core.start(
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
            status_local = localhost_core.get_status()["data"]
            self.assertEqual(status_local["api_effective_bind_host"], "127.0.0.1")

            health_local = wait_get_json(f"http://127.0.0.1:{localhost_port}/health")
            self.assertTrue(health_local["ok"])
            self.assertTrue(health_local["is_running"])

            lan_port = find_free_port()
            lan_core = TrackrCore()
            self.addCleanup(lan_core.shutdown)
            start_lan = lan_core.start(
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
            status_lan = lan_core.get_status()["data"]
            self.assertEqual(status_lan["api_effective_bind_host"], "0.0.0.0")

            health_lan = wait_get_json(f"http://127.0.0.1:{lan_port}/health")
            self.assertTrue(health_lan["ok"])
            self.assertTrue(health_lan["is_running"])

            status_payload = wait_get_json(f"http://127.0.0.1:{lan_port}/status")
            self.assertEqual(status_payload["app_state"], "running")
            self.assertEqual(status_payload["api_access_mode"], "lan")

    def test_nowplaying_play_count_omitted_or_included_without_file_changes(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            self.addCleanup(core.shutdown)

            api_port = find_free_port()
            start_hidden_count = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": False,
                    "api_port": api_port,
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

            nowplaying_without_count = wait_get_json(f"http://127.0.0.1:{api_port}/nowplaying")
            self.assertEqual(nowplaying_without_count["current"], "Artist - Track One")
            self.assertEqual(nowplaying_without_count["previous"], EM_DASH)
            self.assertNotIn("play_count", nowplaying_without_count)
            self.assertEqual(overlay_path_one.read_bytes(), overlay_before_one)
            self.assertEqual(session_path_one.read_bytes(), session_before_one)

            core.stop()

            start_shared_count = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": 3,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "share_play_count_via_api": True,
                    "api_port": api_port,
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

            nowplaying_with_count = wait_get_json(f"http://127.0.0.1:{api_port}/nowplaying")
            self.assertEqual(nowplaying_with_count["current"], "Artist - Track Two")
            self.assertEqual(nowplaying_with_count["previous"], EM_DASH)
            self.assertIn("play_count", nowplaying_with_count)
            self.assertEqual(nowplaying_with_count["play_count"], 2)
            self.assertEqual(overlay_path_two.read_bytes(), overlay_before_two)
            self.assertEqual(session_path_two.read_bytes(), session_before_two)

    def test_start_stop_start_again_and_api_remains_alive(self) -> None:
        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            self.addCleanup(core.shutdown)
            port = find_free_port()

            supervisor = core.start_api_supervisor(
                {
                    "output_root": str(temp_dir),
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "api_port": port,
                }
            )
            self.assertTrue(supervisor["ok"])

            first_start_status, _first_start_payload = request_json(
                f"http://127.0.0.1:{port}/control/start",
                method="POST",
                payload={
                    "output_root": str(temp_dir),
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "api_port": port,
                },
            )
            self.assertEqual(first_start_status, 200)

            stop_status, _stop_payload = request_json(
                f"http://127.0.0.1:{port}/control/stop",
                method="POST",
            )
            self.assertEqual(stop_status, 200)

            health_after_stop = wait_get_json(f"http://127.0.0.1:{port}/health")
            self.assertTrue(health_after_stop["ok"])
            self.assertFalse(health_after_stop["is_running"])

            second_start_status, _second_start_payload = request_json(
                f"http://127.0.0.1:{port}/control/start",
                method="POST",
                payload={
                    "output_root": str(temp_dir),
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "localhost",
                    "api_port": port,
                },
            )
            self.assertEqual(second_start_status, 200)

            status_payload = wait_get_json(f"http://127.0.0.1:{port}/status")
            self.assertEqual(status_payload["app_state"], "running")

    def test_control_start_refused_when_output_root_choice_unresolved(self) -> None:
        with repo_temp_dir() as home_dir:
            (home_dir / "NowPlayingLite").mkdir(parents=True, exist_ok=True)
            core = TrackrCore()
            server = TrackrApiServer(
                bind_host="127.0.0.1",
                port=find_free_port(),
                route_handlers=core._api_route_handlers(),  # noqa: SLF001 - route harness for API tests
            )
            server.start()
            self.addCleanup(server.stop)
            self.addCleanup(core.shutdown)

            status_code, payload = request_json(
                f"http://127.0.0.1:{server.port}/control/start",
                method="POST",
                payload={
                    "home_dir": str(home_dir),
                    "api_enabled": False,
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                },
            )
            self.assertEqual(status_code, 409)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"]["code"], "needs_user_choice")
            self.assertTrue(payload["needs_user_choice"])

            self.assertFalse((home_dir / "NowPlayingLite" / "overlay").exists())
            self.assertFalse((home_dir / "TRACKR" / "overlay").exists())

    def test_template_endpoints_write_html_only_after_choice_resolved(self) -> None:
        with repo_temp_dir() as home_dir:
            legacy_root = home_dir / "NowPlayingLite"
            legacy_root.mkdir(parents=True, exist_ok=True)

            core = TrackrCore()
            server = TrackrApiServer(
                bind_host="127.0.0.1",
                port=find_free_port(),
                route_handlers=core._api_route_handlers(),  # noqa: SLF001 - route harness for API tests
            )
            server.start()
            self.addCleanup(server.stop)
            self.addCleanup(core.shutdown)

            start_status, _ = request_json(
                f"http://127.0.0.1:{server.port}/control/start",
                method="POST",
                payload={
                    "home_dir": str(home_dir),
                    "api_enabled": False,
                    "delay_seconds": 1,
                    "timestamps_enabled": True,
                },
            )
            self.assertEqual(start_status, 409)

            template_html = "<html><body><div id='current'>X</div><div id='previous'>Y</div></body></html>"
            set_status, set_payload = request_json(
                f"http://127.0.0.1:{server.port}/template",
                method="POST",
                payload={"template": template_html},
            )
            self.assertEqual(set_status, 409)
            self.assertFalse(set_payload["ok"])
            self.assertEqual(set_payload["error"]["code"], "needs_user_choice")

            legacy_html = legacy_root / "overlay" / "nowplaying.html"
            trackr_html = home_dir / "TRACKR" / "overlay" / "nowplaying.html"
            self.assertFalse(legacy_html.exists())
            self.assertFalse(trackr_html.exists())

            choose_status, choose_payload = request_json(
                f"http://127.0.0.1:{server.port}/output-root/choose",
                method="POST",
                payload={"choice": "legacy"},
            )
            self.assertEqual(choose_status, 200)
            self.assertEqual(choose_payload["state"], "resolved")
            self.assertEqual(choose_payload["output_root"], str(legacy_root))
            self.assertTrue(legacy_html.exists())

            update_status, update_payload = request_json(
                f"http://127.0.0.1:{server.port}/template",
                method="POST",
                payload={"template": template_html},
            )
            self.assertEqual(update_status, 200)
            self.assertEqual(update_payload["template"], template_html)
            self.assertEqual(legacy_html.read_text(encoding="utf-8"), template_html)


if __name__ == "__main__":
    unittest.main()
