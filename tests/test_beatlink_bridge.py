from __future__ import annotations

import os
import time
import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.beatlink_bridge import (  # noqa: E402
    HybridDeviceBridge,
    JavaNowPlayingSidecarBridge,
    _count_pioneer_devices_from_arp_text,
    build_runtime_device_bridge,
)
from trackr.device_bridge import DeckStatus, RealDeviceBridge, TrackMetadata  # noqa: E402
from test_utils import repo_temp_dir, wait_until  # noqa: E402


class _DiscoveryStubBridge:
    def __init__(self) -> None:
        self._on_status = None
        self._on_device_count = None

    def start(self, on_status, on_device_count) -> None:
        self._on_status = on_status
        self._on_device_count = on_device_count
        on_device_count(2)

    def stop(self) -> None:
        self._on_status = None
        self._on_device_count = None

    def get_metadata(self, _status):
        return None

    def get_latest_statuses(self):
        return [DeckStatus(device_number=2, is_on_air=False, is_playing=False)]


class BeatLinkBridgeTests(unittest.TestCase):
    def test_arp_parser_counts_unique_pioneer_devices(self) -> None:
        arp_text = """
Interface: 192.168.1.177 --- 0x8
  Internet Address      Physical Address      Type
  192.168.1.200         c8-3d-fc-0e-db-b3     dynamic
  192.168.1.202         c8-3d-fc-0e-d1-80     dynamic
  192.168.1.246         c8-3d-fc-18-c6-11     dynamic
  192.168.1.159         00-17-88-b3-0e-51     dynamic
  192.168.1.159         00-17-88-b3-0e-51     dynamic
  192.168.1.170         b0-fc-0d-7f-44-ae     dynamic
"""
        # 3 not 4: 00-17-88 is excluded (shared with Philips Hue)
        self.assertEqual(_count_pioneer_devices_from_arp_text(arp_text), 3)

    def test_runtime_builder_prefers_sidecar_when_executable_exists(self) -> None:
        with repo_temp_dir() as temp_dir:
            sidecar_exe = temp_dir / "NowPlayingLite.exe"
            sidecar_exe.write_text("", encoding="utf-8")
            with patch("trackr.beatlink_bridge._detect_sidecar_executable", return_value=sidecar_exe):
                bridge = build_runtime_device_bridge()
            self.assertIsInstance(bridge, JavaNowPlayingSidecarBridge)

    def test_runtime_builder_falls_back_to_real_bridge_when_sidecar_missing(self) -> None:
        with patch("trackr.beatlink_bridge._detect_sidecar_executable", return_value=None):
            bridge = build_runtime_device_bridge()
        self.assertIsInstance(bridge, RealDeviceBridge)

    def test_sidecar_bridge_emits_playing_status_and_metadata_from_nowplaying_file(self) -> None:
        with repo_temp_dir() as temp_dir:
            nowplaying = temp_dir / "overlay" / "nowplaying.txt"
            nowplaying.parent.mkdir(parents=True, exist_ok=True)
            nowplaying.write_text("\u2014\r\n\u2014\r\n", encoding="utf-8")

            sidecar = JavaNowPlayingSidecarBridge(
                nowplaying_path=nowplaying,
                sidecar_executable=temp_dir / "missing-sidecar.exe",
                poll_interval_seconds=0.05,
                recent_file_window_seconds=120.0,
            )

            statuses: list[DeckStatus] = []
            counts: list[int] = []
            sidecar.start(lambda status: statuses.append(status), lambda count: counts.append(int(count)))
            self.addCleanup(sidecar.stop)

            nowplaying.write_text("Artist X - Track Y\r\n\u2014\r\n", encoding="utf-8")
            emitted = wait_until(lambda: len(statuses) > 0, timeout_seconds=1.0)
            self.assertTrue(emitted)

            latest = statuses[-1]
            self.assertEqual(latest.device_number, 1)
            self.assertTrue(latest.is_on_air)
            self.assertTrue(latest.is_playing)

            metadata = sidecar.get_metadata(latest)
            self.assertIsNotNone(metadata)
            self.assertEqual(metadata.artist, "Artist X")
            self.assertEqual(metadata.title, "Track Y")
            self.assertTrue(any(count >= 1 for count in counts))

    def test_sidecar_reports_probed_device_count_when_available(self) -> None:
        with repo_temp_dir() as temp_dir:
            nowplaying = temp_dir / "overlay" / "nowplaying.txt"
            nowplaying.parent.mkdir(parents=True, exist_ok=True)
            nowplaying.write_text("\u2014\r\n\u2014\r\n", encoding="utf-8")

            sidecar = JavaNowPlayingSidecarBridge(
                nowplaying_path=nowplaying,
                sidecar_executable=temp_dir / "missing-sidecar.exe",
                poll_interval_seconds=0.05,
                recent_file_window_seconds=120.0,
                lan_count_probe_interval_seconds=0.1,
            )

            statuses: list[DeckStatus] = []
            counts: list[int] = []
            sidecar.start(lambda status: statuses.append(status), lambda count: counts.append(int(count)))
            self.addCleanup(sidecar.stop)

            sidecar._probe_lan_device_count = lambda: 5  # type: ignore[method-assign]

            nowplaying.write_text("Artist N - Track M\r\n\u2014\r\n", encoding="utf-8")
            emitted = wait_until(lambda: len(statuses) > 0 and any(c >= 5 for c in counts), timeout_seconds=1.5)
            self.assertTrue(emitted)

    def test_sidecar_emits_when_same_line_file_is_refreshed_after_start(self) -> None:
        with repo_temp_dir() as temp_dir:
            nowplaying = temp_dir / "overlay" / "nowplaying.txt"
            nowplaying.parent.mkdir(parents=True, exist_ok=True)
            nowplaying.write_text("Artist Z - Track Q\r\n\u2014\r\n", encoding="utf-8")

            stale_time = time.time() - 3600.0
            # Stale seed should not auto-emit until file is refreshed after start.
            os.utime(nowplaying, (stale_time, stale_time))

            sidecar = JavaNowPlayingSidecarBridge(
                nowplaying_path=nowplaying,
                sidecar_executable=temp_dir / "missing-sidecar.exe",
                poll_interval_seconds=0.05,
                recent_file_window_seconds=120.0,
            )

            statuses: list[DeckStatus] = []
            sidecar.start(lambda status: statuses.append(status), lambda _count: None)
            self.addCleanup(sidecar.stop)

            not_emitted_yet = wait_until(lambda: len(statuses) > 0, timeout_seconds=0.25)
            self.assertFalse(not_emitted_yet)

            # Rewrite same line (content unchanged) with fresh mtime.
            nowplaying.write_text("Artist Z - Track Q\r\n\u2014\r\n", encoding="utf-8")
            emitted = wait_until(lambda: len(statuses) > 0, timeout_seconds=1.0)
            self.assertTrue(emitted)

    def test_hybrid_bridge_prefers_metadata_bridge_for_latest_status_and_metadata(self) -> None:
        with repo_temp_dir() as temp_dir:
            nowplaying = temp_dir / "overlay" / "nowplaying.txt"
            nowplaying.parent.mkdir(parents=True, exist_ok=True)
            nowplaying.write_text("\u2014\r\n\u2014\r\n", encoding="utf-8")

            hybrid = HybridDeviceBridge(
                discovery_bridge=_DiscoveryStubBridge(),
                metadata_bridge=JavaNowPlayingSidecarBridge(
                    nowplaying_path=nowplaying,
                    sidecar_executable=temp_dir / "missing-sidecar.exe",
                    poll_interval_seconds=0.05,
                ),
            )

            statuses: list[DeckStatus] = []
            counts: list[int] = []
            hybrid.start(lambda status: statuses.append(status), lambda count: counts.append(int(count)))
            self.addCleanup(hybrid.stop)

            nowplaying.write_text("Artist A - Track B\r\n\u2014\r\n", encoding="utf-8")
            emitted = wait_until(lambda: len(statuses) > 0, timeout_seconds=1.0)
            self.assertTrue(emitted)

            latest_statuses = hybrid.get_latest_statuses()
            by_deck = {status.device_number: status for status in latest_statuses}
            self.assertIn(1, by_deck)
            self.assertIn(2, by_deck)
            self.assertTrue(by_deck[1].is_on_air)
            self.assertTrue(by_deck[1].is_playing)
            self.assertFalse(by_deck[2].is_on_air)
            self.assertFalse(by_deck[2].is_playing)

            metadata = hybrid.get_metadata(DeckStatus(device_number=1, is_on_air=True, is_playing=True))
            self.assertEqual(metadata, TrackMetadata(title="Track B", artist="Artist A"))
            self.assertEqual(counts[0], 2)


if __name__ == "__main__":
    unittest.main()
