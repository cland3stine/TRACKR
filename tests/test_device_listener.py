from __future__ import annotations

import threading
import time
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.core import TrackrCore  # noqa: E402
from trackr.device_bridge import DeckStatus, TrackMetadata  # noqa: E402
from test_utils import repo_temp_dir, wait_until  # noqa: E402


class FakeBridge:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._on_status = None
        self._on_device_count = None
        self.device_count = 0
        self._latest_statuses: list[DeckStatus] = []
        self._metadata_sequences: dict[int, list[TrackMetadata | None]] = {}
        self.metadata_requests: dict[int, int] = {}

    def start(self, on_status, on_device_count) -> None:
        with self._lock:
            self._on_status = on_status
            self._on_device_count = on_device_count
            self._on_device_count(self.device_count)

    def stop(self) -> None:
        with self._lock:
            self._on_status = None
            self._on_device_count = None

    def set_metadata_sequence(self, deck: int, values: list[TrackMetadata | None]) -> None:
        with self._lock:
            self._metadata_sequences[int(deck)] = list(values)

    def set_latest_statuses(self, statuses: list[DeckStatus]) -> None:
        with self._lock:
            self._latest_statuses = list(statuses)

    def emit_status(self, status: DeckStatus) -> None:
        with self._lock:
            self._set_latest_status(status)
            callback = self._on_status
        if callback is not None:
            callback(status)

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None:
        with self._lock:
            deck = int(status.device_number)
            self.metadata_requests[deck] = self.metadata_requests.get(deck, 0) + 1
            seq = self._metadata_sequences.get(deck, [])
            if seq:
                return seq.pop(0)
            return None

    def get_latest_statuses(self) -> list[DeckStatus]:
        with self._lock:
            return list(self._latest_statuses)

    def _set_latest_status(self, status: DeckStatus) -> None:
        updated: list[DeckStatus] = []
        replaced = False
        for existing in self._latest_statuses:
            if existing.device_number == status.device_number:
                updated.append(status)
                replaced = True
            else:
                updated.append(existing)
        if not replaced:
            updated.append(status)
        self._latest_statuses = updated


class DeviceListenerTests(unittest.TestCase):
    def _start_core(self, temp_dir: Path, bridge: FakeBridge, **extra: object) -> TrackrCore:
        core = TrackrCore()
        start = core.start(
            {
                "output_root": str(temp_dir),
                "delay_seconds": extra.pop("delay_seconds", 0),
                "timestamps_enabled": True,
                "api_enabled": False,
                "api_access_mode": "localhost",
                "share_play_count_via_api": False,
                "device_bridge": bridge,
                **extra,
            }
        )
        self.assertTrue(start["ok"])
        self.addCleanup(core.stop)
        return core

    def _running_lines(self, core: TrackrCore) -> list[str]:
        result = core.get_running_tracklist()
        self.assertTrue(result["ok"])
        return [item["line"] for item in result["data"]["items"]]

    def test_is_on_air_and_is_playing_gating(self) -> None:
        with repo_temp_dir() as temp_dir:
            bridge = FakeBridge()
            bridge.set_metadata_sequence(1, [TrackMetadata(title="Song", artist="Artist")])
            core = self._start_core(temp_dir, bridge)

            bridge.emit_status(DeckStatus(device_number=1, is_on_air=False, is_playing=True))
            bridge.emit_status(DeckStatus(device_number=1, is_on_air=True, is_playing=False))
            time.sleep(0.05)
            self.assertEqual(self._running_lines(core), [])

            bridge.emit_status(DeckStatus(device_number=1, is_on_air=True, is_playing=True))
            ok = wait_until(lambda: len(self._running_lines(core)) == 1, timeout_seconds=1.0)
            self.assertTrue(ok)
            self.assertEqual(self._running_lines(core), ["Artist - Song"])

    def test_metadata_retry_cadence_and_publish(self) -> None:
        with repo_temp_dir() as temp_dir:
            bridge = FakeBridge()
            bridge.set_metadata_sequence(
                1,
                [
                    None,
                    None,
                    TrackMetadata(title="Resolved", artist="Retry Artist"),
                ],
            )
            core = self._start_core(
                temp_dir,
                bridge,
                metadata_retry_delay_ms=20,
                metadata_retry_attempts=4,
            )

            bridge.emit_status(DeckStatus(device_number=1, is_on_air=True, is_playing=True))

            ok = wait_until(lambda: len(self._running_lines(core)) == 1, timeout_seconds=1.0)
            self.assertTrue(ok)
            self.assertEqual(self._running_lines(core), ["Retry Artist - Resolved"])
            self.assertGreaterEqual(bridge.metadata_requests.get(1, 0), 3)

    def test_delayed_publish_cancels_previous_pending_key(self) -> None:
        with repo_temp_dir() as temp_dir:
            bridge = FakeBridge()
            bridge.set_metadata_sequence(
                1,
                [
                    TrackMetadata(title="Track A", artist="Artist A"),
                    TrackMetadata(title="Track B", artist="Artist B"),
                ],
            )
            core = self._start_core(
                temp_dir,
                bridge,
                delay_seconds=0.2,
                metadata_retry_delay_ms=20,
                metadata_retry_attempts=1,
            )

            bridge.emit_status(DeckStatus(device_number=1, is_on_air=True, is_playing=True))
            time.sleep(0.05)
            bridge.emit_status(DeckStatus(device_number=1, is_on_air=True, is_playing=True))

            ok = wait_until(lambda: len(self._running_lines(core)) == 1, timeout_seconds=1.0)
            self.assertTrue(ok)
            time.sleep(0.25)
            self.assertEqual(self._running_lines(core), ["Artist B - Track B"])

    def test_startup_probe_mitigates_missing_initial_status_callback(self) -> None:
        with repo_temp_dir() as temp_dir:
            bridge = FakeBridge()
            bridge.device_count = 1
            bridge.set_latest_statuses(
                [DeckStatus(device_number=2, is_on_air=True, is_playing=True)]
            )
            bridge.set_metadata_sequence(2, [TrackMetadata(title="Warmup", artist="Probe Artist")])

            core = self._start_core(
                temp_dir,
                bridge,
                startup_probe_count=4,
                startup_probe_interval_ms=30,
                metadata_retry_delay_ms=20,
                metadata_retry_attempts=2,
            )

            ok = wait_until(lambda: len(self._running_lines(core)) == 1, timeout_seconds=1.0)
            self.assertTrue(ok)
            self.assertEqual(self._running_lines(core), ["Probe Artist - Warmup"])


if __name__ == "__main__":
    unittest.main()
