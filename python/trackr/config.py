from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

API_ACCESS_LOCALHOST = "localhost"
API_ACCESS_LAN = "lan"
VALID_API_ACCESS_MODES = {API_ACCESS_LOCALHOST, API_ACCESS_LAN}


@dataclass(frozen=True)
class TrackrConfig:
    output_root: Path
    delay_seconds: int = 3
    timestamps_enabled: bool = True
    api_enabled: bool = True
    api_access_mode: str = API_ACCESS_LAN
    share_play_count_via_api: bool = False
    api_port: int = 8755

    @staticmethod
    def default_output_root() -> Path:
        return Path.home() / "NowPlayingLite"

    @property
    def effective_bind_host(self) -> str:
        if self.api_access_mode == API_ACCESS_LOCALHOST:
            return "127.0.0.1"
        return "0.0.0.0"

    @property
    def db_path(self) -> Path:
        return self.output_root / "trackr.db"

    @property
    def overlay_dir(self) -> Path:
        return self.output_root / "overlay"

    def to_dict(self) -> dict[str, Any]:
        return {
            "output_root": str(self.output_root),
            "delay_seconds": self.delay_seconds,
            "timestamps_enabled": self.timestamps_enabled,
            "api_enabled": self.api_enabled,
            "api_access_mode": self.api_access_mode,
            "share_play_count_via_api": self.share_play_count_via_api,
            "api_port": self.api_port,
            "api_effective_bind_host": self.effective_bind_host,
        }

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any] | None) -> "TrackrConfig":
        data = dict(raw or {})
        output_root = Path(data.get("output_root") or cls.default_output_root())
        delay_seconds = int(data.get("delay_seconds", 3))
        if delay_seconds < 0:
            raise ValueError("delay_seconds must be >= 0")

        api_access_mode = str(data.get("api_access_mode", API_ACCESS_LAN)).lower()
        if api_access_mode not in VALID_API_ACCESS_MODES:
            raise ValueError("api_access_mode must be 'localhost' or 'lan'")

        api_port = int(data.get("api_port", 8755))
        if api_port <= 0 or api_port > 65535:
            raise ValueError("api_port must be between 1 and 65535")

        return cls(
            output_root=output_root,
            delay_seconds=delay_seconds,
            timestamps_enabled=bool(data.get("timestamps_enabled", True)),
            api_enabled=bool(data.get("api_enabled", True)),
            api_access_mode=api_access_mode,
            share_play_count_via_api=bool(data.get("share_play_count_via_api", False)),
            api_port=api_port,
        )
