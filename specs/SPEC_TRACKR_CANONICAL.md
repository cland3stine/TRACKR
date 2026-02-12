# TRACKR Canonical Spec (Python Rewrite)

## 1. Scope and Authority
- This document is the canonical behavior spec for the Python rewrite renamed `TRACKR`.
- `ui/trackr-dashboard.jsx` is the UI layout contract and must not be redesigned by core implementation work.
- The output root remains `%USERPROFILE%\NowPlayingLite` for this phase.
- This spec supersedes legacy output behavior from Java where explicitly marked as removed.

## 2. Locked Output Contract
TRACKR writes only the following artifacts under `%USERPROFILE%\NowPlayingLite`:

1. `overlay/nowplaying.txt`
2. `overlay/nowplaying.html`
3. Session tracklist file at output root:
   - `YYYY-MM-DD(1)-tracklist.txt`
   - `YYYY-MM-DD(2)-tracklist.txt`
   - etc.

No other publish artifacts are allowed in this phase.

## 3. File Format and Write Rules
### 3.1 `overlay/nowplaying.txt`
- Encoding: UTF-8.
- Newlines: CRLF.
- Must end with a trailing newline.
- Exactly 2 lines:
  - Line 1: current track text.
  - Line 2: previous track text.
- Fallback for missing/blank value is em dash: `—`.
- File is rewritten on each successful publish.

### 3.2 `overlay/nowplaying.html`
- This is the only HTML output file.
- OBS reads this file as Browser Source.
- Template is fully editable in UI and persisted by core.
- Core writes/rewrites this file when template is saved/applied/reset and on startup to ensure presence.

### 3.3 Session Tracklist Files
- Location: output root (not in `overlay/`).
- Naming: `YYYY-MM-DD(N)-tracklist.txt`, where `N` is 1-based index for sessions started that day.
- File is append-only for the active session.
- First track timestamp is always `00:00`.
- Timestamp is optional (based on setting), but when enabled it is relative mix time.
- Session dedupe applies per session file.

## 4. Intentional Removals
TRACKR must not generate any of the following:
- root `nowplaying.txt`
- root `nowplaying.html`
- `nowplaying_2line.txt`

## 5. Publish Pipeline (Locked)
Publish for a deck/status event is allowed only when all gates pass:

1. `isOnAir == true`
2. `isPlaying == true`
3. Metadata resolved (with retry cadence around 350 ms when missing)
4. Delayed publish timer expires
5. Dedupe checks pass

### 5.1 Metadata Retry
- If metadata is missing, retry on approximately 350 ms cadence.
- Retry attempts are bounded (implementation-defined constant; Java legacy behavior used a small fixed count).
- While retrying, status may indicate metadata wait state.

### 5.2 Delayed Publish
- Delay is user-configured seconds.
- Pending delayed publish is keyed by `deck|line`.
- New pending key cancels/replaces prior pending publish.

### 5.3 Dedupe Rules
- Publish dedupe:
  - Do not publish if candidate line equals `lastPublished` (line-level dedupe across decks).
  - Pending dedupe key is `deck|line`.
- Session tracklist dedupe:
  - Normalize candidate text before compare.
  - Ignore timestamp prefix when deduping.
  - Case-insensitive compare.
  - Duplicate within current session is not appended.

### 5.4 Success Sequence
On successful publish event (after delay and dedupe):

1. Write `overlay/nowplaying.txt` (2-line current+previous format).
2. Increment all-time play count in SQLite (`trackr.db`).
3. Append track to active session tracklist file (if not session-duplicate).
4. Emit UI/API events with current running-state data.

Play count increments only after step 1 succeeds.

## 6. Controls (Locked)
### 6.1 Start/Stop
- UI has one Start/Stop toggle button.
- `start` creates/activates a new session if none is active.
- `stop` detaches listeners, cancels pending publish, stops schedulers cleanly.

### 6.2 Refresh
- Refresh is explicit button and performs Stop then Start.
- Refresh must always create a new session file using next index for current date.
- Refresh must reset timestamp baseline so first published track is `00:00`.
- Refresh must reset session dedupe memory.

## 7. Play Count (Locked)
- Store all-time play count in SQLite DB: `%USERPROFILE%\NowPlayingLite\trackr.db`.
- Increment only on successful publish after delay+dedupe and after overlay txt write.
- Show play count only in running tracklist UI.
- Text/HTML output files must never include play count.
- API may include play count only when `Share play count via API` is enabled.

## 8. API (Locked)
TRACKR exposes a local HTTP API for LAN integration.

Required settings:
1. Enable API (toggle)
2. API access mode: `Localhost` or `LAN` (toggle)
3. Share play count via API (toggle)

Binding rules:
- Localhost mode binds `127.0.0.1`
- LAN mode binds `0.0.0.0`

Reachability requirement:
- In LAN mode, API must be reachable from other PCs on the same LAN.

## 9. Legacy Known Issue (Documented, Not New)
- Legacy behavior can show app as online but not publish until a subsequent transport/status change.
- This is tied to startup timing and status-event sequencing (device discovered but no qualifying follow-up state callback yet).
- Keep this noted for parity tracking; do not silently treat as new regression.
- Mitigation allowed without changing outputs: on listener start, probe latest known device statuses and retry brief startup probes to trigger normal gated publish evaluation (`isOnAir && isPlaying`, metadata retry, delayed publish, dedupe).

## 10. Non-Negotiable Compatibility Notes
- Do not redesign `ui/trackr-dashboard.jsx`.
- Preserve file path and naming contract exactly as defined here.
- Preserve fallback character as `—` in overlay text file.
- Preserve refresh semantics as explicit new session boundary.
