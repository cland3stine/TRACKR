from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable

from trackr.config import TrackrConfig
from trackr.db import TrackrDatabase
from trackr.template import TemplateStore
from trackr.text_cleaner import clean_track_line
from trackr.writer import OutputWriter

EventCallback = Callable[[dict[str, Any]], None]


def _ok(data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"ok": True, "data": data or {}}


def _err(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


class TrackrCore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._app_state = "stopped"
        self._status_text = "stopped"
        self._device_count = 0
        self._last_published_line: str | None = None
        self._config: TrackrConfig | None = None
        self._db: TrackrDatabase | None = None
        self._writer: OutputWriter | None = None
        self._templates: TemplateStore | None = None
        self._running_tracklist: list[dict[str, Any]] = []
        self._subscribers: dict[int, EventCallback] = {}
        self._next_subscription_id = 1

    def start(self, config: dict[str, Any] | TrackrConfig | None) -> dict[str, Any]:
        with self._lock:
            if self._app_state == "running":
                return _ok({"status": self._snapshot_status()})

            self._set_state("starting", "starting")
            try:
                if self._db is not None:
                    self._db.close()
                    self._db = None
                    self._templates = None
                    self._writer = None

                if isinstance(config, TrackrConfig):
                    next_config = config
                else:
                    next_config = TrackrConfig.from_dict(config)

                self._config = next_config
                self._db = TrackrDatabase(next_config.db_path)
                self._writer = OutputWriter(
                    output_root=next_config.output_root,
                    timestamps_enabled=next_config.timestamps_enabled,
                    delay_seconds=next_config.delay_seconds,
                )
                session_file = self._writer.start_new_session()
                self._writer.ensure_overlay_nowplaying_exists()

                self._templates = TemplateStore(next_config.output_root, self._db)
                self._templates.ensure_template_file()

                self._running_tracklist.clear()
                self._last_published_line = None
                self._set_state("running", "running")
                self._emit(
                    "api_rebound",
                    {
                        "enabled": next_config.api_enabled,
                        "bind_host": next_config.effective_bind_host if next_config.api_enabled else None,
                        "port": next_config.api_port if next_config.api_enabled else None,
                    },
                )
                return _ok({"session_file_name": session_file.name, "status": self._snapshot_status()})
            except Exception as exc:
                self._set_state("error", f"start error: {exc}")
                self._emit("error", {"message": str(exc)})
                return _err("start_failed", str(exc))

    def stop(self) -> dict[str, Any]:
        with self._lock:
            if self._app_state == "stopped":
                return _ok({"status": self._snapshot_status()})

            self._set_state("stopping", "stopping")
            if self._db is not None:
                self._db.close()
                self._db = None
            self._writer = None
            self._templates = None
            self._running_tracklist.clear()
            self._last_published_line = None
            self._set_state("stopped", "stopped")
            return _ok({"status": self._snapshot_status()})

    def refresh(self) -> dict[str, Any]:
        with self._lock:
            if self._config is None:
                return _err("not_configured", "refresh requires an existing config")
            config = self._config

        stop_result = self.stop()
        if not stop_result["ok"]:
            return stop_result
        return self.start(config)

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return _ok(self._snapshot_status())

    def subscribe_events(self, callback: EventCallback) -> dict[str, Any]:
        with self._lock:
            subscription_id = self._next_subscription_id
            self._next_subscription_id += 1
            self._subscribers[subscription_id] = callback

        def unsubscribe() -> None:
            with self._lock:
                self._subscribers.pop(subscription_id, None)

        return _ok({"subscription_id": subscription_id, "unsubscribe": unsubscribe})

    def get_running_tracklist(self) -> dict[str, Any]:
        with self._lock:
            return _ok({"items": [dict(item) for item in self._running_tracklist]})

    def get_template(self) -> dict[str, Any]:
        with self._lock:
            if self._templates is None:
                return _err("not_started", "core is not started")
            return _ok({"template": self._templates.get_template()})

    def set_template(self, template_html: str) -> dict[str, Any]:
        with self._lock:
            if self._templates is None:
                return _err("not_started", "core is not started")
            try:
                saved = self._templates.set_template(template_html)
            except ValueError as exc:
                return _err("invalid_template", str(exc))
            return _ok({"template": saved})

    def reset_template(self) -> dict[str, Any]:
        with self._lock:
            if self._templates is None:
                return _err("not_started", "core is not started")
            restored = self._templates.reset_template()
            return _ok({"template": restored})

    def publish(self, track_line: str, published_at: float | None = None) -> dict[str, Any]:
        # Stub deterministic publish path used before Beat Link integration.
        with self._lock:
            if self._app_state != "running":
                return _err("not_running", "publish requires running state")
            if self._writer is None or self._db is None:
                return _err("not_started", "core is not started")

            cleaned_line = clean_track_line(track_line)
            if not cleaned_line:
                return _err("invalid_track_line", "track_line must be non-empty")

            if cleaned_line == self._last_published_line:
                self._emit("publish_skipped_dedupe", {"line": cleaned_line})
                return _ok({"published": False, "reason": "dedupe"})

            try:
                self._writer.write_overlay_nowplaying(cleaned_line)
            except Exception as exc:
                self._set_state("error", f"publish error: {exc}")
                self._emit("error", {"message": str(exc)})
                return _err("overlay_write_failed", str(exc))

            play_count = self._db.increment_play_count()
            entry = self._writer.append_track(cleaned_line, published_at=published_at)
            tracklist_item = None
            if entry is not None:
                tracklist_item = {"time": entry.time, "line": entry.line, "play_count": play_count}
                self._running_tracklist.append(tracklist_item)
                self._emit("tracklist_appended", tracklist_item)

            self._last_published_line = cleaned_line
            self._status_text = "published"
            self._emit(
                "publish_succeeded",
                {"line": cleaned_line, "play_count": play_count, "tracklist_appended": tracklist_item is not None},
            )
            return _ok(
                {
                    "published": True,
                    "play_count": play_count,
                    "tracklist_entry": tracklist_item,
                }
            )

    def _set_state(self, state: str, status_text: str) -> None:
        self._app_state = state
        self._status_text = status_text
        self._emit("state_changed", {"app_state": state})
        self._emit("status_message", {"status_text": status_text})

    def _snapshot_status(self) -> dict[str, Any]:
        session_name = None
        if self._writer is not None and self._writer.session_file is not None:
            session_name = self._writer.session_file.name

        api_bind = None
        api_port = None
        api_enabled = False
        api_access_mode = "localhost"
        share_count = False

        if self._config is not None:
            api_enabled = self._config.api_enabled
            api_access_mode = self._config.api_access_mode
            share_count = self._config.share_play_count_via_api
            if api_enabled:
                api_bind = self._config.effective_bind_host
                api_port = self._config.api_port

        return {
            "app_state": self._app_state,
            "status_text": self._status_text,
            "device_count": self._device_count,
            "last_published_line": self._last_published_line,
            "session_file_name": session_name,
            "api_effective_bind_host": api_bind,
            "api_port": api_port,
            "api_enabled": api_enabled,
            "api_access_mode": api_access_mode,
            "share_play_count_via_api": share_count,
        }

    def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        event = {
            "event_type": event_type,
            "timestamp_utc": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "payload": payload,
        }
        callbacks = list(self._subscribers.values())
        for callback in callbacks:
            try:
                callback(event)
            except Exception:
                continue
