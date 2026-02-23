/**
 * TRACKR Phase 3A — Track Text Cleaner
 *
 * Exact port of python/trackr/text_cleaner.py.
 * Transform order must match the Python original (tests in Phase 8 will verify).
 */

export const EM_DASH = '\u2014';

// Camelot keys: [8A], (12B), or bare 8A / 12B — case-insensitive
const CAMELOT = /(?:\[|\()\s*\d{1,2}\s*[AB]\s*(?:\]|\))|\b\d{1,2}[AB]\b/gi;

// Remaining [...] bracket tags (genre notes, warmup labels, etc.)
const BRACKET_TAGS = /\[[^\]]*\]/g;

// Dash-like separators: hyphen, en-dash, em-dash
const DASHES = /\s*[-\u2013\u2014]+\s*/g;

// Redundant mix labels at end of string: (Original Mix), (Extended Mix)
const MIX_LABELS = /\s*\((original mix|extended mix)\)\s*$/i;

const WHITESPACE = /\s+/g;
const TRAILING_DASH = /\s*-\s*$/;
const LEADING_DASH = /^\s*-\s*/;

// Timestamp prefix like "00:00  " or "1:23:45  " used in tracklist lines
const TIMESTAMP_PREFIX = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/;

export function cleanTrackLine(
  line: string | null | undefined,
  stripMixLabels = true,
): string {
  if (!line) return '';
  let out = line.trim();
  if (!out) return '';

  out = out.replace(CAMELOT, '');
  out = out.replace(BRACKET_TAGS, ' ');
  out = out.replace(DASHES, ' - ');

  if (stripMixLabels) {
    out = out.replace(MIX_LABELS, '');
  }

  out = out.replace(WHITESPACE, ' ').trim();
  out = out.replace(TRAILING_DASH, '').trim();
  out = out.replace(LEADING_DASH, '');

  return out;
}

export function normalizeForDedupe(line: string | null | undefined): string {
  const cleaned = cleanTrackLine(line);
  if (!cleaned) return '';
  return cleaned.replace(TIMESTAMP_PREFIX, '').toLowerCase().trim();
}
