from __future__ import annotations

from dataclasses import dataclass, replace
import json
from pathlib import Path
from typing import Any, Mapping

API_ACCESS_LOCALHOST = "localhost"
API_ACCESS_LAN = "lan"
VALID_API_ACCESS_MODES = {API_ACCESS_LOCALHOST, API_ACCESS_LAN}
OUTPUT_ROOT_CHOICE_LEGACY = "legacy"
OUTPUT_ROOT_CHOICE_TRACKR = "trackr"
VALID_OUTPUT_ROOT_CHOICES = {OUTPUT_ROOT_CHOICE_LEGACY, OUTPUT_ROOT_CHOICE_TRACKR}
OUTPUT_ROOT_STATE_RESOLVED = "resolved"
OUTPUT_ROOT_STATE_NEEDS_USER_CHOICE = "needs_user_choice"
_PREFS_FILE_NAME = "trackr_config.json"


@dataclass(frozen=True)
class TrackrConfig:
    output_root: Path | None = None
    migration_prompt_seen: bool = False
    delay_seconds: float = 3
    timestamps_enabled: bool = True
    api_enabled: bool = True
    api_access_mode: str = API_ACCESS_LAN
    share_play_count_via_api: bool = False
    api_port: int = 8755

    @staticmethod
    def default_output_root(home_dir: Path | None = None) -> Path:
        home = home_dir or Path.home()
        return home / "TRACKR"

    @staticmethod
    def legacy_output_root(home_dir: Path | None = None) -> Path:
        home = home_dir or Path.home()
        return home / "NowPlayingLite"

    def with_output_root(
        self,
        output_root: Path,
        migration_prompt_seen: bool | None = None,
    ) -> "TrackrConfig":
        next_seen = self.migration_prompt_seen if migration_prompt_seen is None else migration_prompt_seen
        return replace(self, output_root=Path(output_root), migration_prompt_seen=bool(next_seen))

    def require_output_root(self) -> Path:
        if self.output_root is None:
            raise ValueError("output_root is not resolved")
        return self.output_root

    @property
    def effective_bind_host(self) -> str:
        if self.api_access_mode == API_ACCESS_LOCALHOST:
            return "127.0.0.1"
        return "0.0.0.0"

    @property
    def db_path(self) -> Path:
        return self.require_output_root() / "trackr.db"

    @property
    def overlay_dir(self) -> Path:
        return self.require_output_root() / "overlay"

    def to_dict(self) -> dict[str, Any]:
        return {
            "output_root": str(self.output_root) if self.output_root is not None else None,
            "migration_prompt_seen": self.migration_prompt_seen,
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
        output_root_raw = data.get("output_root")
        output_root = Path(output_root_raw) if output_root_raw else None
        delay_seconds = float(data.get("delay_seconds", 3))
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
            migration_prompt_seen=bool(data.get("migration_prompt_seen", False)),
            delay_seconds=delay_seconds,
            timestamps_enabled=bool(data.get("timestamps_enabled", True)),
            api_enabled=bool(data.get("api_enabled", True)),
            api_access_mode=api_access_mode,
            share_play_count_via_api=bool(data.get("share_play_count_via_api", False)),
            api_port=api_port,
        )


@dataclass(frozen=True)
class OutputRootResolution:
    state: str
    output_root: Path | None
    legacy_output_root: Path
    trackr_output_root: Path
    migration_prompt_seen: bool


@dataclass(frozen=True)
class PersistedRootConfig:
    output_root: Path | None = None
    migration_prompt_seen: bool = False


def _prefs_path(home_dir: Path | None = None) -> Path:
    home = home_dir or Path.home()
    return home / _PREFS_FILE_NAME


def load_persisted_root_config(home_dir: Path | None = None) -> PersistedRootConfig:
    path = _prefs_path(home_dir)
    if not path.exists():
        return PersistedRootConfig()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return PersistedRootConfig()

    output_root_raw = payload.get("output_root")
    output_root = Path(output_root_raw) if isinstance(output_root_raw, str) and output_root_raw.strip() else None
    migration_prompt_seen = bool(payload.get("migration_prompt_seen", False))
    return PersistedRootConfig(output_root=output_root, migration_prompt_seen=migration_prompt_seen)


def save_persisted_root_config(
    output_root: Path | None,
    migration_prompt_seen: bool,
    home_dir: Path | None = None,
) -> PersistedRootConfig:
    path = _prefs_path(home_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "output_root": str(output_root) if output_root is not None else None,
        "migration_prompt_seen": bool(migration_prompt_seen),
    }
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return PersistedRootConfig(output_root=output_root, migration_prompt_seen=bool(migration_prompt_seen))


def resolve_output_root(config: TrackrConfig, home_dir: Path | None = None) -> OutputRootResolution:
    legacy = TrackrConfig.legacy_output_root(home_dir)
    trackr = TrackrConfig.default_output_root(home_dir)

    if config.output_root is not None:
        return OutputRootResolution(
            state=OUTPUT_ROOT_STATE_RESOLVED,
            output_root=config.output_root,
            legacy_output_root=legacy,
            trackr_output_root=trackr,
            migration_prompt_seen=config.migration_prompt_seen,
        )

    persisted = load_persisted_root_config(home_dir)
    if persisted.output_root is not None:
        return OutputRootResolution(
            state=OUTPUT_ROOT_STATE_RESOLVED,
            output_root=persisted.output_root,
            legacy_output_root=legacy,
            trackr_output_root=trackr,
            migration_prompt_seen=persisted.migration_prompt_seen,
        )

    migration_prompt_seen = bool(config.migration_prompt_seen or persisted.migration_prompt_seen)
    if legacy.exists() and not migration_prompt_seen:
        return OutputRootResolution(
            state=OUTPUT_ROOT_STATE_NEEDS_USER_CHOICE,
            output_root=None,
            legacy_output_root=legacy,
            trackr_output_root=trackr,
            migration_prompt_seen=migration_prompt_seen,
        )

    save_persisted_root_config(output_root=trackr, migration_prompt_seen=migration_prompt_seen, home_dir=home_dir)
    return OutputRootResolution(
        state=OUTPUT_ROOT_STATE_RESOLVED,
        output_root=trackr,
        legacy_output_root=legacy,
        trackr_output_root=trackr,
        migration_prompt_seen=migration_prompt_seen,
    )


def persist_output_root_choice(choice: str, home_dir: Path | None = None) -> OutputRootResolution:
    lowered = str(choice).strip().lower()
    if lowered not in VALID_OUTPUT_ROOT_CHOICES:
        raise ValueError("choice must be 'legacy' or 'trackr'")

    legacy = TrackrConfig.legacy_output_root(home_dir)
    trackr = TrackrConfig.default_output_root(home_dir)
    output_root = legacy if lowered == OUTPUT_ROOT_CHOICE_LEGACY else trackr
    save_persisted_root_config(output_root=output_root, migration_prompt_seen=True, home_dir=home_dir)

    return OutputRootResolution(
        state=OUTPUT_ROOT_STATE_RESOLVED,
        output_root=output_root,
        legacy_output_root=legacy,
        trackr_output_root=trackr,
        migration_prompt_seen=True,
    )
