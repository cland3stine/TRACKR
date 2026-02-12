from __future__ import annotations

import re

EM_DASH = "—"

_TIMESTAMP_PREFIX = re.compile(r"^\s*\d{1,2}:\d{2}(?::\d{2})?\s+")
_WHITESPACE = re.compile(r"\s+")


def clean_track_line(line: str | None) -> str:
    if line is None:
        return ""
    return _WHITESPACE.sub(" ", line).strip()


def normalize_for_dedupe(line: str | None) -> str:
    cleaned = clean_track_line(line)
    if not cleaned:
        return ""
    cleaned = _TIMESTAMP_PREFIX.sub("", cleaned)
    return cleaned.lower().strip()
