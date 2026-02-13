from __future__ import annotations

from dataclasses import dataclass
import logging
import socket
from threading import Event, RLock, Thread
import time
from typing import Callable, Protocol

StatusCallback = Callable[["DeckStatus"], None]
DeviceCountCallback = Callable[[int], None]
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeckStatus:
    device_number: int
    is_on_air: bool
    is_playing: bool


@dataclass(frozen=True)
class TrackMetadata:
    title: str
    artist: str = ""


class DeviceBridge(Protocol):
    def start(self, on_status: StatusCallback, on_device_count: DeviceCountCallback) -> None: ...

    def stop(self) -> None: ...

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None: ...

    def get_latest_statuses(self) -> list[DeckStatus]: ...


class NullDeviceBridge:
    """No-op default bridge when Beat Link integration is not attached."""

    def __init__(self) -> None:
        self._on_status: StatusCallback | None = None
        self._on_device_count: DeviceCountCallback | None = None

    def start(self, on_status: StatusCallback, on_device_count: DeviceCountCallback) -> None:
        self._on_status = on_status
        self._on_device_count = on_device_count
        self._on_device_count(0)

    def stop(self) -> None:
        self._on_status = None
        self._on_device_count = None

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None:
        return None

    def get_latest_statuses(self) -> list[DeckStatus]:
        return []


@dataclass
class _DiscoveredDevice:
    ip: str
    device_number: int
    last_seen_monotonic: float


class RealDeviceBridge:
    """Lightweight Pioneer LAN discovery bridge.

    This bridge discovers devices from Pro DJ Link traffic on UDP port 50000 and
    reports discovered deck count to the core. Status defaults to not-on-air and
    not-playing until a full transport parser is added.
    """

    DISCOVERY_PORT = 50000
    SOCKET_TIMEOUT_SECONDS = 0.5
    STALE_DEVICE_TIMEOUT_SECONDS = 5.0

    def __init__(self) -> None:
        self._lock = RLock()
        self._on_status: StatusCallback | None = None
        self._on_device_count: DeviceCountCallback | None = None
        self._devices_by_ip: dict[str, _DiscoveredDevice] = {}
        self._status_by_device: dict[int, DeckStatus] = {}
        self._socket: socket.socket | None = None
        self._thread: Thread | None = None
        self._stop_event = Event()

    def start(self, on_status: StatusCallback, on_device_count: DeviceCountCallback) -> None:
        with self._lock:
            self._on_status = on_status
            self._on_device_count = on_device_count
            if self._thread is not None:
                self._emit_device_count_locked()
                return

            self._stop_event.clear()
            self._devices_by_ip.clear()
            self._status_by_device.clear()
            self._bind_socket_locked()
            self._emit_device_count_locked()
            self._thread = Thread(target=self._run_loop, name="trackr-real-device-bridge", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            sock = self._socket
            self._socket = None
            thread = self._thread
            self._thread = None
            self._devices_by_ip.clear()
            self._status_by_device.clear()
            self._on_status = None
            self._on_device_count = None
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass
        if thread is not None:
            thread.join(timeout=1.0)

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None:
        return None

    def get_latest_statuses(self) -> list[DeckStatus]:
        with self._lock:
            return list(self._status_by_device.values())

    def _bind_socket_locked(self) -> None:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("", self.DISCOVERY_PORT))
            sock.settimeout(self.SOCKET_TIMEOUT_SECONDS)
            self._socket = sock
            logger.info("real device bridge listening on UDP %s", self.DISCOVERY_PORT)
        except Exception as exc:
            self._socket = None
            logger.warning("real device bridge could not bind UDP %s: %s", self.DISCOVERY_PORT, exc)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            with self._lock:
                sock = self._socket
            if sock is None:
                time.sleep(0.5)
                self._expire_stale_devices()
                continue

            try:
                payload, address = sock.recvfrom(2048)
            except socket.timeout:
                self._expire_stale_devices()
                continue
            except OSError:
                if self._stop_event.is_set():
                    break
                continue
            except Exception:
                continue

            ip = str(address[0])
            self._ingest_packet(ip, payload)
            self._expire_stale_devices()

    def _ingest_packet(self, ip: str, payload: bytes) -> None:
        now = time.monotonic()
        found: _DiscoveredDevice | None = None
        emit_count = False
        emit_status: DeckStatus | None = None
        emit_count_value = 0

        with self._lock:
            existing = self._devices_by_ip.get(ip)
            if existing is None:
                device_number = self._infer_device_number(payload, ip)
                found = _DiscoveredDevice(ip=ip, device_number=device_number, last_seen_monotonic=now)
                self._devices_by_ip[ip] = found
                status = DeckStatus(device_number=device_number, is_on_air=False, is_playing=False)
                self._status_by_device[device_number] = status
                emit_status = status
                emit_count = True
            else:
                existing.last_seen_monotonic = now
            emit_count_value = len(self._devices_by_ip)

        if found is not None:
            logger.info("device found: deck=%s ip=%s", found.device_number, found.ip)
        if emit_count:
            self._emit_device_count(emit_count_value)
        if emit_status is not None:
            logger.debug(
                "status update: deck=%s on_air=%s playing=%s",
                emit_status.device_number,
                emit_status.is_on_air,
                emit_status.is_playing,
            )
            self._emit_status(emit_status)

    def _expire_stale_devices(self) -> None:
        now = time.monotonic()
        removed: list[_DiscoveredDevice] = []
        emit_count_value = 0

        with self._lock:
            for ip, device in list(self._devices_by_ip.items()):
                if now - device.last_seen_monotonic > self.STALE_DEVICE_TIMEOUT_SECONDS:
                    removed.append(device)
                    self._devices_by_ip.pop(ip, None)
                    self._status_by_device.pop(device.device_number, None)
            emit_count_value = len(self._devices_by_ip)

        if not removed:
            return
        for device in removed:
            logger.info("device lost: deck=%s ip=%s", device.device_number, device.ip)
        self._emit_device_count(emit_count_value)

    def _infer_device_number(self, payload: bytes, ip: str) -> int:
        # Heuristic player number offsets observed in common Pro DJ Link packets.
        for index in (0x21, 0x24, 0x25):
            if index < len(payload):
                candidate = int(payload[index])
                if 1 <= candidate <= 16:
                    return candidate

        try:
            last_octet = int(ip.rsplit(".", 1)[-1])
        except Exception:
            last_octet = 0
        if 1 <= last_octet <= 16:
            return last_octet

        used = {device.device_number for device in self._devices_by_ip.values()}
        for candidate in range(1, 17):
            if candidate not in used:
                return candidate
        return max(1, len(used))

    def _emit_status(self, status: DeckStatus) -> None:
        callback: StatusCallback | None = None
        with self._lock:
            callback = self._on_status
        if callback is None:
            return
        try:
            callback(status)
        except Exception:
            return

    def _emit_device_count(self, count: int) -> None:
        callback: DeviceCountCallback | None = None
        with self._lock:
            callback = self._on_device_count
        if callback is None:
            return
        try:
            callback(int(count))
        except Exception:
            return

    def _emit_device_count_locked(self) -> None:
        callback = self._on_device_count
        if callback is None:
            return
        try:
            callback(len(self._devices_by_ip))
        except Exception:
            return
