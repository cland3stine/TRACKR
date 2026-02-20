from __future__ import annotations

import csv
from dataclasses import dataclass
import logging
from pathlib import Path
import re
import subprocess
import sys
from threading import Event, RLock, Thread
import time
import os
from typing import Any, Callable

from trackr.device_bridge import (
    DeckStatus,
    DeviceBridge,
    DeviceCountCallback,
    RealDeviceBridge,
    StatusCallback,
    TrackMetadata,
)
from trackr.text_cleaner import EM_DASH, clean_track_line

logger = logging.getLogger(__name__)
_ARP_DEVICE_LINE = re.compile(
    r"^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})\s+dynamic\s*$",
    re.IGNORECASE,
)
_PIONEER_OUI_PREFIXES = {
    "00-17-88",  # Pioneer
    "2c-f0-a2",  # Pioneer
    "8c-f5-a3",  # Pioneer
    "c8-3d-fc",  # AlphaTheta/Pioneer DJ
}


def _split_artist_title(line: str) -> tuple[str, str]:
    text = clean_track_line(line)
    if not text:
        return "", ""
    parts = text.split(" - ", 1)
    if len(parts) == 2:
        artist = clean_track_line(parts[0])
        title = clean_track_line(parts[1])
        if title:
            return artist, title
    return "", text


def _detect_sidecar_executable() -> Path | None:
    # Frozen mode (PyInstaller): look for NowPlayingLite in Tauri resources
    if getattr(sys, "frozen", False):
        frozen_dir = Path(sys.executable).resolve().parent
        frozen_candidate = frozen_dir / "beatlink" / "NowPlayingLite.exe"
        if frozen_candidate.exists():
            return frozen_candidate

    # Source mode: scan jpackage build output
    repo_root = Path(__file__).resolve().parents[2]
    jpackage_dir = repo_root / "build" / "jpackage"
    if not jpackage_dir.exists():
        return None
    candidates = sorted(
        jpackage_dir.glob("*/NowPlayingLite.exe"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return None
    return candidates[0]


def _sidecar_process_already_running(executable: Path) -> bool:
    return len(_sidecar_process_ids(executable)) > 0


def _sidecar_process_ids(executable: Path) -> list[int]:
    if os.name != "nt":
        return []
    image_name = executable.name
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return []
    if result.returncode != 0:
        return []
    output = (result.stdout or "").strip()
    if not output:
        return []
    # "INFO: No tasks are running which match the specified criteria."
    lowered = output.lower()
    if "no tasks are running" in lowered:
        return []

    pids: list[int] = []
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            fields = next(csv.reader([line]))
        except Exception:
            continue
        if len(fields) < 2:
            continue
        if fields[0].strip().lower() != image_name.lower():
            continue
        try:
            pids.append(int(fields[1].strip()))
        except ValueError:
            continue
    return pids


def _terminate_process_pid(pid: int) -> None:
    if os.name != "nt":
        return
    try:
        subprocess.run(
            ["taskkill", "/PID", str(int(pid)), "/F", "/T"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return


def _pioneer_ips_from_arp_text(text: str) -> set[str]:
    """Parse ``arp -a`` output and return IPs with Pioneer/AlphaTheta MACs."""
    seen_ips: set[str] = set()
    for raw_line in str(text or "").splitlines():
        match = _ARP_DEVICE_LINE.match(raw_line.strip())
        if match is None:
            continue
        ip = str(match.group(1))
        mac = str(match.group(2)).lower()
        prefix = mac[:8]
        if prefix in _PIONEER_OUI_PREFIXES:
            seen_ips.add(ip)
    return seen_ips


def _count_pioneer_devices_from_arp_text(text: str) -> int:
    return len(_pioneer_ips_from_arp_text(text))


def _is_pdl_device_active(ip: str, timeout_seconds: float = 0.5) -> bool:
    """Check if a Pro DJ Link device is fully booted (not just in standby).

    Probes TCP 50002 which CDJs/DJMs listen on when running Pro DJ Link.
    Devices in standby keep their network interface alive (respond to ping)
    but don't have Pro DJ Link services running — TCP 50002 will time out.
    """
    import socket as _socket
    try:
        sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
        sock.settimeout(timeout_seconds)
        err = sock.connect_ex((str(ip), 50002))
        sock.close()
        # 0 = port open (connected), device is running Pro DJ Link
        # 10061 = WSAECONNREFUSED — device OS is up, port just not listening
        #         (could be mid-boot); treat as active to avoid flicker
        return err == 0 or err == 10061
    except Exception:
        return False


class JavaNowPlayingSidecarBridge:
    """Bridge Beat Link metadata by tailing the Java app's overlay nowplaying file."""

    DEVICE_NUMBER = 1

    def __init__(
        self,
        nowplaying_path: Path | None = None,
        sidecar_executable: Path | None = None,
        restart_existing_sidecar: bool = False,
        poll_interval_seconds: float = 0.35,
        recent_file_window_seconds: float = 120.0,
        lan_count_probe_interval_seconds: float = 2.5,
    ) -> None:
        self._lock = RLock()
        self._on_status: StatusCallback | None = None
        self._on_device_count: DeviceCountCallback | None = None
        self._stop_event = Event()
        self._thread: Thread | None = None
        self._latest_status: DeckStatus | None = None
        self._latest_metadata: TrackMetadata | None = None
        self._last_line: str | None = None
        self._poll_interval_seconds = max(0.1, float(poll_interval_seconds))
        self._recent_file_window_seconds = max(10.0, float(recent_file_window_seconds))
        self._nowplaying_path = nowplaying_path or (Path.home() / "NowPlayingLite" / "overlay" / "nowplaying.txt")
        self._sidecar_executable = sidecar_executable or _detect_sidecar_executable()
        self._restart_existing_sidecar = bool(restart_existing_sidecar)
        self._lan_count_probe_interval_seconds = max(1.0, float(lan_count_probe_interval_seconds))
        self._sidecar_process: subprocess.Popen[str] | None = None
        self._sidecar_started_by_bridge = False
        self._last_lan_count_probe_at = 0.0
        self._last_known_device_count = 0
        self._last_known_active_ips: list[str] = []
        self._last_file_mtime: float = 0.0
        self._bridge_started_wall_time: float = 0.0

    def start(self, on_status: StatusCallback, on_device_count: DeviceCountCallback) -> None:
        with self._lock:
            self._on_status = on_status
            self._on_device_count = on_device_count
            if self._thread is not None:
                return
            self._stop_event.clear()
            self._start_sidecar_if_available_locked()
            self._last_lan_count_probe_at = 0.0
            self._last_known_device_count = 0
            self._last_file_mtime = 0.0
            self._bridge_started_wall_time = time.time()
            self._thread = Thread(
                target=self._poll_loop,
                name="trackr-beatlink-sidecar-bridge",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            thread = self._thread
            self._thread = None
            process = self._sidecar_process
            started_by_bridge = self._sidecar_started_by_bridge
            self._sidecar_process = None
            self._sidecar_started_by_bridge = False
            self._on_status = None
            self._on_device_count = None
            self._latest_status = None
            self._latest_metadata = None
            self._last_line = None

        if thread is not None:
            thread.join(timeout=1.0)

        if started_by_bridge and process is not None:
            self._stop_sidecar_process(process)

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None:
        with self._lock:
            if status.device_number != self.DEVICE_NUMBER:
                return None
            return self._latest_metadata

    def get_latest_statuses(self) -> list[DeckStatus]:
        with self._lock:
            if self._latest_status is None:
                return []
            return [self._latest_status]

    def _start_sidecar_if_available_locked(self) -> None:
        if self._sidecar_executable is None:
            return
        if not self._sidecar_executable.exists():
            return
        if self._sidecar_process is not None and self._sidecar_process.poll() is None:
            return
        running_pids = _sidecar_process_ids(self._sidecar_executable)
        if running_pids and self._restart_existing_sidecar:
            logger.info("restarting existing Beat Link sidecar processes: %s", running_pids)
            for pid in running_pids:
                _terminate_process_pid(pid)
            time.sleep(0.2)
            running_pids = _sidecar_process_ids(self._sidecar_executable)
        if running_pids:
            logger.info("Beat Link sidecar already running: %s", self._sidecar_executable.name)
            self._sidecar_started_by_bridge = False
            return
        try:
            process = subprocess.Popen(  # noqa: S603
                [str(self._sidecar_executable), "--tray"],  # noqa: S607
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._sidecar_process = process
            self._sidecar_started_by_bridge = True
            logger.info("started Beat Link sidecar: %s", self._sidecar_executable)
        except Exception as exc:
            logger.warning("unable to start Beat Link sidecar %s: %s", self._sidecar_executable, exc)

    def _stop_sidecar_process(self, process: subprocess.Popen[str]) -> None:
        try:
            if process.poll() is not None:
                return
            process.terminate()
            process.wait(timeout=2.0)
        except Exception:
            try:
                process.kill()
            except Exception:
                return

    def _poll_loop(self) -> None:
        self._seed_from_existing_file()
        while not self._stop_event.wait(self._poll_interval_seconds):
            self._emit_lan_device_count_if_due()
            line, modified = self._read_current_snapshot()
            if not line:
                continue
            emit = False
            with self._lock:
                # Publish on line changes, and also on same-line file refreshes
                # after startup if we have never emitted a status yet.
                if line != self._last_line:
                    self._last_line = line
                    self._last_file_mtime = modified
                    emit = True
                elif (
                    modified > self._last_file_mtime
                    and self._latest_status is None
                    and modified >= self._bridge_started_wall_time
                ):
                    self._last_file_mtime = modified
                    emit = True
            if emit:
                self._emit_track_status(line)

    def _seed_from_existing_file(self) -> None:
        line, modified = self._read_current_snapshot()
        if not line:
            return
        age_seconds = max(0.0, time.time() - float(modified))
        with self._lock:
            self._last_line = line
            self._last_file_mtime = modified
        if age_seconds <= self._recent_file_window_seconds:
            self._emit_track_status(line)

    def _read_current_snapshot(self) -> tuple[str, float]:
        path = self._nowplaying_path
        if not path.exists():
            return "", 0.0
        try:
            stat = path.stat()
            modified = float(stat.st_mtime)
            raw = path.read_text(encoding="utf-8")
        except Exception:
            return "", 0.0
        first = (raw.splitlines()[0] if raw.splitlines() else "").strip()
        cleaned = clean_track_line(first)
        if not cleaned or cleaned == EM_DASH:
            return "", modified
        return cleaned, modified

    def _emit_track_status(self, line: str) -> None:
        artist, title = _split_artist_title(line)
        if not title:
            title = line
        metadata = TrackMetadata(title=title, artist=artist)
        status = DeckStatus(
            device_number=self.DEVICE_NUMBER,
            is_on_air=True,
            is_playing=True,
        )

        callback: StatusCallback | None = None
        count_callback: DeviceCountCallback | None = None
        with self._lock:
            self._latest_metadata = metadata
            self._latest_status = status
            callback = self._on_status
            count_callback = self._on_device_count
            known_count = self._last_known_device_count

        if count_callback is not None:
            try:
                count_callback(max(1, int(known_count)))
            except Exception:
                pass
        if callback is not None:
            try:
                callback(status)
            except Exception:
                pass

    def _emit_lan_device_count_if_due(self) -> None:
        now = time.monotonic()
        with self._lock:
            if now - self._last_lan_count_probe_at < self._lan_count_probe_interval_seconds:
                return
            self._last_lan_count_probe_at = now
        probed_count = self._probe_lan_device_count()
        if probed_count is None:
            return
        callback: DeviceCountCallback | None = None
        should_emit = False
        with self._lock:
            callback = self._on_device_count
            if probed_count != self._last_known_device_count:
                self._last_known_device_count = int(probed_count)
                should_emit = True
        if callback is None or not should_emit:
            return
        try:
            callback(int(probed_count))
        except Exception:
            return

    def _probe_lan_devices(self) -> list[str]:
        """Return list of reachable Pioneer device IPs via ARP + ping."""
        if os.name != "nt":
            return []
        try:
            result = subprocess.run(
                ["arp", "-a"],
                capture_output=True,
                text=True,
                check=False,
                timeout=1.5,
            )
        except Exception:
            return []
        if result.returncode != 0:
            return []
        candidate_ips = _pioneer_ips_from_arp_text(result.stdout or "")
        return [ip for ip in sorted(candidate_ips) if _is_pdl_device_active(ip)]

    def _probe_lan_device_count(self) -> int | None:
        active = self._probe_lan_devices()
        with self._lock:
            self._last_known_active_ips = list(active)
        return len(active)

    def get_device_summaries(self) -> list[dict[str, Any]]:
        with self._lock:
            active = list(getattr(self, "_last_known_active_ips", []))
        if not active:
            return []
        return [{"name": "Pioneer Device", "count": len(active)}]


@dataclass
class HybridDeviceBridge:
    discovery_bridge: DeviceBridge
    metadata_bridge: DeviceBridge

    def __post_init__(self) -> None:
        self._on_status: StatusCallback | None = None
        self._on_device_count: DeviceCountCallback | None = None

    def start(self, on_status: StatusCallback, on_device_count: DeviceCountCallback) -> None:
        self._on_status = on_status
        self._on_device_count = on_device_count

        self.metadata_bridge.start(self._forward_status, lambda _count: None)
        self.discovery_bridge.start(self._forward_status, on_device_count)

    def stop(self) -> None:
        self.metadata_bridge.stop()
        self.discovery_bridge.stop()
        self._on_status = None
        self._on_device_count = None

    def get_metadata(self, status: DeckStatus) -> TrackMetadata | None:
        metadata = self.metadata_bridge.get_metadata(status)
        if metadata is not None:
            return metadata
        return self.discovery_bridge.get_metadata(status)

    def get_latest_statuses(self) -> list[DeckStatus]:
        merged: dict[int, DeckStatus] = {}
        for status in self.discovery_bridge.get_latest_statuses():
            merged[int(status.device_number)] = status
        for status in self.metadata_bridge.get_latest_statuses():
            merged[int(status.device_number)] = status
        return list(merged.values())

    def get_device_summaries(self) -> list[dict[str, Any]]:
        if hasattr(self.discovery_bridge, "get_device_summaries"):
            return self.discovery_bridge.get_device_summaries()
        return []

    def _forward_status(self, status: DeckStatus) -> None:
        callback = self._on_status
        if callback is None:
            return
        callback(status)


def build_runtime_device_bridge() -> DeviceBridge:
    """Runtime default bridge.

    Prefer Java Beat Link sidecar when available; it provides on-air/playing
    status + metadata.  Device discovery uses ARP-based probing (with ping
    validation) because sharing UDP broadcast ports with the Java sidecar is
    unreliable on Windows.

    Falls back to RealDeviceBridge (direct Pro DJ Link UDP) when the sidecar
    is not available — this path provides full device-name parsing.
    """
    sidecar_executable = _detect_sidecar_executable()
    if sidecar_executable is not None and sidecar_executable.exists():
        logger.info(
            "using Java sidecar bridge for runtime publish pipeline: %s",
            sidecar_executable,
        )
        return JavaNowPlayingSidecarBridge(
            sidecar_executable=sidecar_executable,
            restart_existing_sidecar=True,
        )
    logger.info("Java sidecar executable not found; falling back to RealDeviceBridge discovery only")
    return RealDeviceBridge()
