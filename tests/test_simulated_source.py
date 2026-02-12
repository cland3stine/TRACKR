from __future__ import annotations

import json
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.core import TrackrCore  # noqa: E402
from trackr.simulated_source import SimulatedEventSource, SimulatedTrackEvent  # noqa: E402
from test_utils import repo_temp_dir  # noqa: E402


def _load_fixture(name: str) -> dict:
    fixture_path = Path(__file__).resolve().parent / "fixtures" / name
    return json.loads(fixture_path.read_text(encoding="utf-8"))


class SimulatedSourceTests(unittest.TestCase):
    def test_replay_deck_changes_repeats_and_cancellation(self) -> None:
        fixture = _load_fixture("sim_deck_changes_and_repeats.json")

        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            start = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": fixture["delay_seconds"],
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "lan",
                    "share_play_count_via_api": False,
                }
            )
            self.assertTrue(start["ok"])

            source = SimulatedEventSource(core, delay_seconds=fixture["delay_seconds"])
            events = [
                SimulatedTrackEvent(at=e["at"], deck=e["deck"], line=e["line"])
                for e in fixture["events"]
            ]
            report = source.replay(events)

            self.assertEqual(report["published_lines"], fixture["expected_published_lines"])
            self.assertEqual(
                report["skipped_dedupe_lines"],
                fixture["expected_skipped_dedupe_lines"],
            )

            running = core.get_running_tracklist()
            self.assertTrue(running["ok"])
            items = running["data"]["items"]
            self.assertEqual(len(items), 3)
            self.assertEqual([item["line"] for item in items], fixture["expected_published_lines"])
            self.assertEqual([item["play_count"] for item in items], [1, 2, 3])

            overlay_path = Path(temp_dir) / "overlay" / "nowplaying.txt"
            self.assertEqual(
                overlay_path.read_bytes(),
                "D - Four\r\nC - Three\r\n".encode("utf-8"),
            )

    def test_same_pending_key_does_not_reschedule_delay(self) -> None:
        fixture = _load_fixture("sim_same_key_no_reschedule.json")

        with repo_temp_dir() as temp_dir:
            core = TrackrCore()
            start = core.start(
                {
                    "output_root": str(temp_dir),
                    "delay_seconds": fixture["delay_seconds"],
                    "timestamps_enabled": True,
                    "api_enabled": True,
                    "api_access_mode": "lan",
                    "share_play_count_via_api": False,
                }
            )
            self.assertTrue(start["ok"])

            source = SimulatedEventSource(core, delay_seconds=fixture["delay_seconds"])
            events = [
                SimulatedTrackEvent(at=e["at"], deck=e["deck"], line=e["line"])
                for e in fixture["events"]
            ]
            report = source.replay(events)

            self.assertEqual(report["published_lines"], fixture["expected_published_lines"])
            self.assertEqual(
                report["skipped_dedupe_lines"],
                fixture["expected_skipped_dedupe_lines"],
            )
            attempt_times = [attempt["at"] for attempt in report["attempts"]]
            self.assertEqual(attempt_times, fixture["expected_publish_times"])


if __name__ == "__main__":
    unittest.main()
