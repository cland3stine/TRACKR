from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from trackr.core import TrackrCore
from trackr.text_cleaner import clean_track_line


@dataclass(frozen=True)
class SimulatedTrackEvent:
    at: float
    deck: int
    line: str


class SimulatedEventSource:
    """Deterministic virtual-time event feeder for TrackrCore.publish testing."""

    def __init__(self, core: TrackrCore, delay_seconds: int) -> None:
        self._core = core
        self._delay_seconds = max(0, delay_seconds)
        self._clock = 0.0
        self._pending: dict[str, Any] | None = None
        self._attempts: list[dict[str, Any]] = []
        self._published_lines: list[str] = []
        self._skipped_dedupe_lines: list[str] = []

    def feed(self, event: SimulatedTrackEvent) -> None:
        when = float(event.at)
        if when < self._clock:
            raise ValueError("events must be fed in non-decreasing time order")
        self.advance_to(when)

        cleaned_line = clean_track_line(event.line)
        if not cleaned_line:
            return

        key = f"{event.deck}|{cleaned_line}"
        if self._pending is not None and self._pending["key"] == key:
            # Same pending key: keep existing timer, no reschedule.
            return

        self._pending = {
            "key": key,
            "deck": int(event.deck),
            "line": cleaned_line,
            "due_at": when + self._delay_seconds,
        }

    def advance_to(self, when: float) -> None:
        if when < self._clock:
            raise ValueError("cannot move simulated clock backwards")
        self._clock = when
        self._flush_due()

    def replay(self, events: Iterable[SimulatedTrackEvent]) -> dict[str, Any]:
        for event in events:
            self.feed(event)
        return self.finalize()

    def finalize(self) -> dict[str, Any]:
        self.advance_to(float("inf"))
        return {
            "attempts": list(self._attempts),
            "published_lines": list(self._published_lines),
            "skipped_dedupe_lines": list(self._skipped_dedupe_lines),
        }

    def _flush_due(self) -> None:
        if self._pending is None:
            return
        if self._pending["due_at"] > self._clock:
            return

        pending = self._pending
        self._pending = None

        result = self._core.publish(pending["line"], published_at=pending["due_at"])
        attempt = {
            "at": pending["due_at"],
            "deck": pending["deck"],
            "line": pending["line"],
            "result": result,
        }
        self._attempts.append(attempt)

        if result.get("ok"):
            data = result.get("data", {})
            if data.get("published") is True:
                self._published_lines.append(pending["line"])
            elif data.get("reason") == "dedupe":
                self._skipped_dedupe_lines.append(pending["line"])
