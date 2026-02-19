from __future__ import annotations

import re

EM_DASH = "\u2014"

# Camelot keys: [8A], (12B), or bare 8A / 12B
_CAMELOT = re.compile(
    r"(?i)[\[\(]\s*\d{1,2}\s*[AB]\s*[\]\)]|\b\d{1,2}[AB]\b"
)

# Any remaining [...] bracket tags (genre tags, notes, etc.)
_BRACKET_TAGS = re.compile(r"\[[^\]]*\]")

# Dash-like separators (hyphens, en-dashes, em-dashes)
_DASHES = re.compile(r"\s*[\-\u2013\u2014]+\s*")

# Common redundant mix labels at end of string: (Original Mix), (Extended Mix)
_MIX_LABELS = re.compile(
    r"(?i)\s*\((original mix|extended mix)\)\s*$"
)

_WHITESPACE = re.compile(r"\s+")
_TRAILING_DASH = re.compile(r"\s*-\s*$")
_LEADING_DASH = re.compile(r"^\s*-\s*")
_TIMESTAMP_PREFIX = re.compile(r"^\s*\d{1,2}:\d{2}(?::\d{2})?\s+")


def clean_track_line(line: str | None, *, strip_mix_labels: bool = True) -> str:
    if line is None:
        return ""
    out = line.strip()
    if not out:
        return ""

    # Remove Camelot keys like 8A / 12B, including [8A] or (12B)
    out = _CAMELOT.sub("", out)

    # Remove non-Camelot bracket tags like [breaks], [warmup], etc.
    out = _BRACKET_TAGS.sub(" ", out)

    # Normalize dash-like separators
    out = _DASHES.sub(" - ", out)

    if strip_mix_labels:
        out = _MIX_LABELS.sub("", out)

    # Collapse whitespace
    out = _WHITESPACE.sub(" ", out).strip()

    # Cleanup trailing/leading dash leftovers
    out = _TRAILING_DASH.sub("", out).strip()
    out = _LEADING_DASH.sub("", out)

    return out


def normalize_for_dedupe(line: str | None) -> str:
    cleaned = clean_track_line(line)
    if not cleaned:
        return ""
    cleaned = _TIMESTAMP_PREFIX.sub("", cleaned)
    return cleaned.lower().strip()
