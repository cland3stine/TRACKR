from __future__ import annotations

import time
import traceback

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
        cfg = TrackrConfig.from_dict({})
        supervisor = core.start_api_supervisor(cfg)
        if not supervisor.get("ok"):
            _print_error(supervisor.get("error"))  # type: ignore[arg-type]
            return 1

        try:
            start_result = core.start(cfg)
            print("START RESULT:", start_result)
        except Exception:
            traceback.print_exc()
            raise

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
