from __future__ import annotations

import time

from trackr.config import TrackrConfig
from trackr.core import TrackrCore


def _print_error(error: dict[str, object] | None) -> None:
    if not isinstance(error, dict):
        print("TRACKR failed to start")
        return
    code = str(error.get("code", "start_failed"))
    message = str(error.get("message", "failed to start"))
    print(f"TRACKR failed to start [{code}]: {message}")


def main() -> int:
    core = TrackrCore()
    try:
        start_result = core.start(TrackrConfig.from_dict({}))
        if not start_result.get("ok"):
            _print_error(start_result.get("error"))  # type: ignore[arg-type]
            return 1

        data = start_result.get("data")
        if isinstance(data, dict) and data.get("needs_user_choice"):
            print("TRACKR requires an output root choice before startup.")
            print("Choose via UI/API: POST /output-root/choose with {\"choice\":\"legacy\"|\"trackr\"}.")
            return 0

        print("TRACKR running")
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        core.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
