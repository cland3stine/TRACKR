from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock, Timer
import time
from typing import Any, Callable

from trackr.api import TrackrApiServer
from trackr.config import TrackrConfig
from trackr.db import TrackrDatabase
from trackr.device_bridge import DeckStatus, DeviceBridge, NullDeviceBridge
from trackr.template import TemplateStore
from trackr.text_cleaner import EM_DASH, clean_track_line
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
        self._api_server: TrackrApiServer | None = None
        self._device_bridge: DeviceBridge | None = None
        self._running_tracklist: list[dict[str, Any]] = []
        self._subscribers: dict[int, EventCallback] = {}
        self._next_subscription_id = 1
        self._pending_publish_key: str | None = None
        self._pending_publish_timer: Timer | None = None
        self._metadata_retry_timers: dict[int, Timer] = {}
        self._metadata_retry_delay_seconds = 0.35
        self._metadata_retry_attempts = 6
        self._startup_probe_timer: Timer | None = None
        self._startup_probe_count = 6
        self._startup_probe_interval_seconds = 0.5
        self._last_metadata_wait_status_at = 0.0

    def start(self, config: dict[str, Any] | TrackrConfig | None) -> dict[str, Any]:
        with self._lock:
            if self._app_state == "running":
                return _ok({"status": self._snapshot_status()})

            self._set_state("starting", "starting")
            try:
                self._stop_api_server()
                self._stop_listener_pipeline()
                if self._db is not None:
                    self._db.close()
                    self._db = None
                    self._templates = None
                    self._writer = None

                runtime_options: dict[str, Any] = {}
                if isinstance(config, TrackrConfig):
                    next_config = config
                elif isinstance(config, dict):
                    runtime_options = config
                    next_config = TrackrConfig.from_dict(config)
                else:
                    next_config = TrackrConfig.from_dict(config)

                self._config = next_config
                self._configure_runtime_pipeline(runtime_options)
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
                self._status_text = "listening (close rekordbox on this PC)"

                if next_config.api_enabled:
                    self._api_server = TrackrApiServer(
                        bind_host=next_config.effective_bind_host,
                        port=next_config.api_port,
                        nowplaying_provider=self._api_nowplaying_payload,
                        health_provider=self._api_health_payload,
                    )
                    self._api_server.start()

                self._start_device_listener(runtime_options.get("device_bridge"))

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
                self._stop_api_server()
                self._stop_listener_pipeline()
                if self._db is not None:
                    self._db.close()
                    self._db = None
                self._writer = None
                self._templates = None
                self._set_state("error", f"start error: {exc}")
                self._emit("error", {"message": str(exc)})
                return _err("start_failed", str(exc))

    def stop(self) -> dict[str, Any]:
        with self._lock:
            if self._app_state == "stopped":
                return _ok({"status": self._snapshot_status()})

            self._set_state("stopping", "stopping")
            self._stop_api_server()
            self._stop_listener_pipeline()
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

    def _configure_runtime_pipeline(self, options: dict[str, Any]) -> None:
        retry_delay_ms = options.get("metadata_retry_delay_ms", 350)
        retry_attempts = options.get("metadata_retry_attempts", 6)
        probe_count = options.get("startup_probe_count", 6)
        probe_interval_ms = options.get("startup_probe_interval_ms", 500)

        try:
            retry_delay_ms = int(retry_delay_ms)
        except (TypeError, ValueError):
            retry_delay_ms = 350
        try:
            retry_attempts = int(retry_attempts)
        except (TypeError, ValueError):
            retry_attempts = 6
        try:
            probe_count = int(probe_count)
        except (TypeError, ValueError):
            probe_count = 6
        try:
            probe_interval_ms = int(probe_interval_ms)
        except (TypeError, ValueError):
            probe_interval_ms = 500

        self._metadata_retry_delay_seconds = max(0.05, retry_delay_ms / 1000.0)
        self._metadata_retry_attempts = max(0, retry_attempts)
        self._startup_probe_count = max(0, probe_count)
        self._startup_probe_interval_seconds = max(0.1, probe_interval_ms / 1000.0)
        self._last_metadata_wait_status_at = 0.0

    def _start_device_listener(self, runtime_bridge: Any) -> None:
        bridge = runtime_bridge if runtime_bridge is not None else NullDeviceBridge()
        self._device_bridge = bridge
        self._device_bridge.start(self._on_device_status, self._on_device_count)
        self._status_text = "listening (close rekordbox on this PC)"
        self._emit("status_message", {"status_text": self._status_text})
        self._run_startup_probe(self._startup_probe_count)

    def _stop_listener_pipeline(self) -> None:
        self._cancel_pending_publish()
        for deck in list(self._metadata_retry_timers.keys()):
            self._cancel_metadata_retry(deck)
        if self._startup_probe_timer is not None:
            self._startup_probe_timer.cancel()
            self._startup_probe_timer = None
        if self._device_bridge is not None:
            try:
                self._device_bridge.stop()
            except Exception:
                pass
            self._device_bridge = None

    def _cancel_pending_publish(self) -> None:
        if self._pending_publish_timer is not None:
            self._pending_publish_timer.cancel()
            self._pending_publish_timer = None
        self._pending_publish_key = None

    def _cancel_metadata_retry(self, deck: int) -> None:
        timer = self._metadata_retry_timers.pop(deck, None)
        if timer is not None:
            timer.cancel()

    def _on_device_count(self, count: int) -> None:
        with self._lock:
            if self._app_state not in {"starting", "running"}:
                return
            self._device_count = max(0, int(count))

    def _on_device_status(self, status: DeckStatus) -> None:
        with self._lock:
            if self._app_state != "running":
                return
            self._process_status(status, retries_left=self._metadata_retry_attempts)

    def _run_startup_probe(self, remaining: int) -> None:
        with self._lock:
            if self._app_state != "running" or self._device_bridge is None:
                return
            try:
                statuses = self._device_bridge.get_latest_statuses()
            except Exception:
                statuses = []
            for status in statuses:
                self._process_status(status, retries_left=self._metadata_retry_attempts)

            if remaining <= 1:
                return

            timer = Timer(
                self._startup_probe_interval_seconds,
                lambda: self._run_startup_probe(remaining - 1),
            )
            timer.daemon = True
            self._startup_probe_timer = timer
            timer.start()

    def _process_status(self, status: DeckStatus, retries_left: int) -> None:
        if self._app_state != "running" or self._device_bridge is None:
            return
        self._cancel_metadata_retry(status.device_number)
        if not status.is_on_air or not status.is_playing:
            return

        metadata = None
        try:
            metadata = self._device_bridge.get_metadata(status)
        except Exception:
            metadata = None

        if metadata is None:
            now = time.monotonic()
            if now - self._last_metadata_wait_status_at > 1.5:
                self._last_metadata_wait_status_at = now
                self._status_text = f"waiting for metadata... (deck {status.device_number})"
                self._emit("status_message", {"status_text": self._status_text})
            if retries_left > 0:
                self._schedule_metadata_retry(status, retries_left - 1)
            return

        line = self._line_from_metadata(metadata.title, metadata.artist)
        if not line:
            return
        self._schedule_delayed_publish(status.device_number, line)

    def _schedule_metadata_retry(self, status: DeckStatus, retries_left: int) -> None:
        self._cancel_metadata_retry(status.device_number)

        def _retry() -> None:
            with self._lock:
                self._metadata_retry_timers.pop(status.device_number, None)
                if self._app_state != "running":
                    return
                self._process_status(status, retries_left=retries_left)

        timer = Timer(self._metadata_retry_delay_seconds, _retry)
        timer.daemon = True
        self._metadata_retry_timers[status.device_number] = timer
        timer.start()

    def _line_from_metadata(self, title: str | None, artist: str | None) -> str:
        cleaned_title = clean_track_line(title)
        if not cleaned_title:
            return ""
        cleaned_artist = clean_track_line(artist)
        return f"{cleaned_artist} - {cleaned_title}" if cleaned_artist else cleaned_title

    def _schedule_delayed_publish(self, device_number: int, line: str) -> None:
        if self._config is None:
            return
        key = f"{device_number}|{line}"
        if key == self._pending_publish_key and self._pending_publish_timer is not None:
            return

        self._cancel_pending_publish()
        self._pending_publish_key = key

        def _fire_publish() -> None:
            with self._lock:
                if self._app_state != "running":
                    return
                if self._pending_publish_key != key:
                    return
                self._pending_publish_key = None
                self._pending_publish_timer = None
                result = self.publish(line, published_at=time.time())
                if not result.get("ok"):
                    self._status_text = f"publish error: {result['error']['message']}"
                    self._emit("status_message", {"status_text": self._status_text})

        timer = Timer(max(0, self._config.delay_seconds), _fire_publish)
        timer.daemon = True
        self._pending_publish_timer = timer
        timer.start()

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

    def _stop_api_server(self) -> None:
        if self._api_server is not None:
            self._api_server.stop()
            self._api_server = None

    def _api_health_payload(self) -> dict[str, Any]:
        with self._lock:
            return {
                "ok": True,
                "is_running": self._app_state == "running",
            }

    def _api_nowplaying_payload(self) -> dict[str, Any]:
        with self._lock:
            current, previous = self._read_overlay_lines()
            session_file_name = None
            if self._writer is not None and self._writer.session_file is not None:
                session_file_name = self._writer.session_file.name

            payload: dict[str, Any] = {
                "current": current,
                "previous": previous,
                "session_file": session_file_name,
                "is_running": self._app_state == "running",
                "device_count": self._device_count,
            }
            if (
                self._config is not None
                and self._config.share_play_count_via_api
                and self._db is not None
            ):
                payload["play_count"] = self._db.get_play_count()
            return payload

    def _read_overlay_lines(self) -> tuple[str, str]:
        overlay_path = None
        if self._writer is not None:
            overlay_path = self._writer.overlay_nowplaying_path
        elif self._config is not None:
            overlay_path = self._config.overlay_dir / "nowplaying.txt"

        if overlay_path is None or not overlay_path.exists():
            return EM_DASH, EM_DASH

        try:
            raw = overlay_path.read_text(encoding="utf-8")
        except Exception:
            return EM_DASH, EM_DASH

        lines = raw.splitlines()
        current = (lines[0].strip() if len(lines) > 0 else "") or EM_DASH
        previous = (lines[1].strip() if len(lines) > 1 else "") or EM_DASH
        return current, previous
