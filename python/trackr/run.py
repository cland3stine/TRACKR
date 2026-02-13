from __future__ import annotations

import json
import time
from urllib.error import URLError
from urllib.request import urlopen

from trackr.beatlink_bridge import build_runtime_device_bridge
from trackr.config import TrackrConfig
from trackr.core import TrackrCore


def _print_error(error: dict[str, object] | None) -> None:
    if not isinstance(error, dict):
        print("TRACKR failed to start")
        return
    code = str(error.get("code", "start_failed"))
    message = str(error.get("message", "failed to start"))
    print(f"TRACKR failed to start [{code}]: {message}")


def _is_bind_in_use_error(error: dict[str, object] | None) -> bool:
    if not isinstance(error, dict):
        return False
    message = str(error.get("message", "")).lower()
    return "address already in use" in message or "only one usage of each socket address" in message


def _existing_backend_running(port: int) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{int(port)}/health", timeout=1.0) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return bool(isinstance(payload, dict) and payload.get("ok") is True)
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return False


def main() -> int:
    core = TrackrCore(default_device_bridge_factory=build_runtime_device_bridge)
    try:
        cfg = TrackrConfig.from_dict({})
        if _existing_backend_running(cfg.api_port):
            print(f"TRACKR already running at http://127.0.0.1:{cfg.api_port}")
            print("Use the existing backend process, or stop it before launching another instance.")
            return 0

        supervisor = core.start_api_supervisor(cfg)
        if not supervisor.get("ok"):
            error = supervisor.get("error")  # type: ignore[assignment]
            if _is_bind_in_use_error(error) and _existing_backend_running(cfg.api_port):
                print(f"TRACKR already running at http://127.0.0.1:{cfg.api_port}")
                print("Use the existing backend process, or stop it before launching another instance.")
                return 0
            _print_error(supervisor.get("error"))  # type: ignore[arg-type]
            return 1

        start_result = core.start(cfg)

        if not start_result.get("ok"):
            _print_error(start_result.get("error"))  # type: ignore[arg-type]
            return 1

        data = start_result.get("data")
        if isinstance(data, dict) and data.get("needs_user_choice"):
            print("TRACKR requires an output root choice before startup.")
            print("Choose via UI/API: POST /output-root/choose with {\"choice\":\"legacy\"|\"trackr\"}.")
            while True:
                time.sleep(1.0)

        print("TRACKR running")
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        core.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
