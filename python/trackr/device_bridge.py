from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol

StatusCallback = Callable[["DeckStatus"], None]
DeviceCountCallback = Callable[[int], None]


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
