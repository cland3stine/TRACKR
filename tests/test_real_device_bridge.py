from __future__ import annotations

import socket
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from trackr.device_bridge import DeckStatus, RealDeviceBridge  # noqa: E402
from test_utils import find_free_port, wait_until  # noqa: E402


class _TestableRealBridge(RealDeviceBridge):
    SOCKET_TIMEOUT_SECONDS = 0.05
    STALE_DEVICE_TIMEOUT_SECONDS = 0.2

    def __init__(self, port: int) -> None:
        super().__init__()
        self.DISCOVERY_PORTS = (int(port),)


class RealDeviceBridgeTests(unittest.TestCase):
    def test_discovers_and_expires_device_from_udp_packets(self) -> None:
        port = find_free_port()
        bridge = _TestableRealBridge(port)

        device_counts: list[int] = []
        statuses: list[DeckStatus] = []

        bridge.start(lambda status: statuses.append(status), lambda count: device_counts.append(int(count)))
        self.addCleanup(bridge.stop)

        packet = bytearray(64)
        packet[0x21] = 7
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.sendto(bytes(packet), ("127.0.0.1", port))

        discovered = wait_until(lambda: any(count >= 1 for count in device_counts), timeout_seconds=1.0)
        self.assertTrue(discovered)
        self.assertTrue(statuses)
        self.assertEqual(statuses[-1].device_number, 7)
        self.assertFalse(statuses[-1].is_on_air)
        self.assertFalse(statuses[-1].is_playing)

        expired = wait_until(lambda: device_counts and device_counts[-1] == 0, timeout_seconds=1.5)
        self.assertTrue(expired)


if __name__ == "__main__":
    unittest.main()
