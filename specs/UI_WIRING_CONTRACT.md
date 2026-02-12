# TRACKR UI Wiring Contract

## 1. Purpose
This document defines the narrow, stable interface between the UI layer (`ui/trackr-dashboard.jsx`) and Python core runtime.

The UI must use only the methods defined below to control core behavior.

## 2. Core Interface
Expose a single service object with exactly these methods:

1. `start(config)`
2. `stop()`
3. `refresh()`
4. `get_status()`
5. `subscribe_events(callback)`
6. `get_running_tracklist()`
7. `get_template()`
8. `set_template(template_html)`
9. `reset_template()`

Additive methods allowed for output-root migration flow:
10. `resolve_output_root(config?)`
11. `set_output_root_choice(choice)` where `choice` is `"legacy"` or `"trackr"`

## 3. Method Contracts
### 3.1 `start(config)`
- Starts TRACKR processing loop and activates a session.
- If already running, returns idempotent success without creating another session.
- Must validate and apply config atomically before entering running state.

`config` minimum fields:
- `output_root`: string path (default `%USERPROFILE%\\NowPlayingLite`)
- `delay_seconds`: integer >= 0
- `timestamps_enabled`: boolean
- `api_enabled`: boolean
- `api_access_mode`: `"localhost"` or `"lan"`
- `share_play_count_via_api`: boolean

Effects:
- Ensure `overlay/nowplaying.html` exists.
- Ensure `overlay/nowplaying.txt` exists with 2 lines fallback `—`.
- Create/select active session file for current run.
- Start listeners, scheduler, and API server if enabled.

### 3.2 `stop()`
- Stops listeners, pending delayed publish, scheduler, and API server.
- Leaves current files intact.
- Safe to call when already stopped (idempotent).

### 3.3 `refresh()`
- Performs `stop()` then `start(previous_or_current_config)` as one operation.
- Must always create a new session file with next daily index.
- Must reset timestamp baseline (`00:00` on next successful publish).
- Must clear session dedupe memory.

### 3.4 `get_status()`
Returns a full snapshot for UI rendering.

Required fields:
- `app_state`: `"stopped" | "starting" | "running" | "stopping" | "error"`
- `status_text`: string
- `device_count`: integer
- `last_published_line`: string or null
- `session_file_name`: string or null
- `api_effective_bind_host`: string or null
- `api_port`: integer or null
- `api_enabled`: boolean
- `api_access_mode`: `"localhost" | "lan"`
- `share_play_count_via_api`: boolean

### 3.5 `subscribe_events(callback)`
- Registers callback for push updates from core.
- Returns an unsubscribe function/token.
- Callback receives event objects:
  - `event_type`: string
  - `timestamp_utc`: RFC3339 string
  - `payload`: object

Minimum emitted event types:
- `state_changed`
- `status_message`
- `publish_succeeded`
- `publish_skipped_dedupe`
- `tracklist_appended`
- `api_rebound`
- `error`

### 3.6 `get_running_tracklist()`
Returns list for running tracklist panel.

Each item:
- `time`: `"MM:SS"` or `"H:MM:SS"` or empty when timestamps disabled
- `line`: string (`Artist - Title` or title-only)
- `play_count`: integer (all-time count)

Notes:
- Play count appears in UI list only.
- Ordering is append order for active session.

### 3.7 `get_template()`
- Returns current editable template HTML string for `overlay/nowplaying.html`.

### 3.8 `set_template(template_html)`
- Validates input is non-empty HTML text.
- Persists and applies template to `overlay/nowplaying.html`.
- Does not change running/stopped state.

### 3.9 `reset_template()`
- Restores built-in default template.
- Writes restored template to `overlay/nowplaying.html`.
- Returns restored template string.

## 4. UI Mapping Rules
- Start/Stop toggle button calls:
  - `start(config)` when currently stopped/error
  - `stop()` when currently running
- Refresh button calls `refresh()` only.
- Template editor:
  - initial load: `get_template()`
  - save action: `set_template(...)`
  - restore default action: `reset_template()`
- Status polling on mount/focus: `get_status()`
- Live updates: `subscribe_events(...)` + unsubscribe on unmount.

## 5. Error and Concurrency Semantics
- All methods return structured result: `{ ok: boolean, data?: any, error?: { code, message } }`.
- Long-running transitions emit `state_changed` events.
- Calls during transition must be serialized in core (single control plane).
- `refresh()` has priority over stale pending publishes from previous session.

## 6. Data Visibility Rules (Locked)
- Core output files never include play count.
- API responses include play count only when `share_play_count_via_api == true`.
- UI may always display play count in running tracklist from local core data.

## 7. Backward Safety
- This interface is the canonical boundary for rewrite phases.
- Additional methods are allowed only as additive, non-breaking extensions.
