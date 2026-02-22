# TRACKR Specification v2 — Current State (Pre-Migration Snapshot)

> **Date:** 2026-02-22
> **Version:** 0.9.0
> **Branch:** `trackr-python-rewrite`
> **Purpose:** Complete behavioral specification of TRACKR as it exists today. This is the source of truth for what the Electron migration must replicate.

---

## A) Project Overview

TRACKR is a Windows desktop application that connects to Pioneer CDJ-3000s and a DJM-A9 mixer via the Pro DJ Link protocol, publishes cleaned "now playing" track information to OBS overlays, maintains session tracklists, and exposes an HTTP API for integration with other tools (Roonie-AI chatbot).

### Architecture (Current)

```
┌────────────────────────────────────────────────────────────┐
│  Tauri 2 Shell (Rust)                                      │
│  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │  React 19 + TS       │  │  lib.rs                    │  │
│  │  (renderer process)  │──│  - sidecar spawn/kill      │  │
│  │  trackr-dashboard    │  │  - window lifecycle        │  │
│  │  trackr-http-core    │  │  - plugin init             │  │
│  │  SplashScreen        │  │                            │  │
│  │  updater             │  └────────────────────────────┘  │
│  └──────────┬───────────┘                                  │
│             │ HTTP (127.0.0.1:8755)                        │
│  ┌──────────▼───────────────────────────────────────────┐  │
│  │  Python Backend (trackr-backend.exe via PyInstaller) │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │  │
│  │  │ core.py │  │ api.py   │  │ beatlink_bridge.py  │ │  │
│  │  │ state   │  │ HTTP srv │  │ sidecar launcher    │ │  │
│  │  │ machine │  │ port8755 │  │ file poller         │ │  │
│  │  └────┬────┘  └──────────┘  │ ARP device probe    │ │  │
│  │       │                     └──────────┬──────────┘ │  │
│  │  ┌────▼────┐  ┌──────────┐            │            │  │
│  │  │writer.py│  │session.py│            │            │  │
│  │  │ overlay │  │ tracklist│  ┌─────────▼──────────┐ │  │
│  │  │ files   │  │ dedupe   │  │ device_bridge.py   │ │  │
│  │  └─────────┘  └──────────┘  │ RealDeviceBridge   │ │  │
│  │  ┌─────────┐  ┌──────────┐  │ (UDP Pro DJ Link)  │ │  │
│  │  │  db.py  │  │template  │  └────────────────────┘ │  │
│  │  │ SQLite  │  │ .py      │                         │  │
│  │  └─────────┘  └──────────┘                         │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
         │                              │
         │ File I/O                     │ UDP 50000-50002
         ▼                              ▼
  ~/TRACKR/overlay/          Pioneer CDJ-3000s + DJM-A9
  nowplaying.txt                 (Pro DJ Link network)
  nowplaying.html
  tracklist files
  trackr.db

         ┌──────────────────────────────────────┐
         │  Java Sidecar (trackr-sidecar.exe)   │
         │  beat-link 8.0.0 + jpackage JRE 21   │
         │  Writes: ~/NowPlayingLite/overlay/    │
         │          nowplaying.txt               │
         │  Python reads this file for metadata  │
         └──────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Shell | Tauri | 2.10.2 |
| Frontend | React + TypeScript | 19.1.0 / 5.8.3 |
| Build tool | Vite | 7.0.4 |
| Backend | Python (stdlib only) | 3.12+ |
| CDJ Protocol | beat-link (Java) | 8.0.0 |
| Sidecar runtime | jpackage JRE | 21 |
| Installer | NSIS (via Tauri) | — |
| Database | SQLite 3 | stdlib |
| Signing | minisign | — |

### Repository Layout

```
C:\APPS\TRACKR/
├── python/trackr/           # Python backend (13 modules, stdlib only)
├── ui/trackr-ui/            # Tauri + React frontend
│   ├── src/                 # React components + HTTP bridge
│   └── src-tauri/           # Rust shell + config
├── src/main/java/app/       # Java sidecar source (5 modules)
├── build/jpackage/          # Java sidecar build output
├── tests/                   # Python test suite (11 files)
├── specs/                   # Specification documents
├── build.ps1                # Windows build orchestrator
├── trackr-backend.spec      # PyInstaller config
├── build.gradle             # Java build config
└── pyproject.toml           # Python package metadata
```

---

## B) Canonical Runtime Flow (Step-by-Step)

### Application Startup

1. NSIS installer places files; user launches `TRACKR.exe` (Tauri shell).
2. Tauri `setup()` hook spawns `trackr-backend-x86_64-pc-windows-msvc.exe` (PyInstaller-frozen Python) as a sidecar process.
3. Tauri captures sidecar stdout/stderr on a background Tokio task, prefixed `[trackr-backend]`.
4. Sidecar PID is stored in `Mutex<Option<CommandChild>>` for cleanup.
5. Python `run.py:main()` starts:
   - Checks if another instance is already running (health check on port 8755).
   - Loads persisted config from `~/.trackr_config.json`.
   - Calls `TrackrCore.start_api_supervisor(config)` to start the HTTP server.
   - Enters supervised loop waiting for shutdown.
6. React frontend loads in Tauri WebView2:
   - `main.tsx` mounts `<App />` in React StrictMode.
   - `App.tsx` installs `TrackrHttpBridge` (attaches to `window.trackrCore`).
   - Resolves output root via `GET /output-root/resolve`.
   - Begins 3-second health poll via `GET /health`.
   - `SplashScreen` shows with hardware-aesthetic loading animation.
   - Once backend responds, splash fades out (600ms), dashboard renders.
7. Dashboard (`trackr-dashboard.jsx`) initializes:
   - Fetches initial status, tracklist, and template from backend.
   - Subscribes to events via `subscribe_events(callback)`.
   - Starts 2-second status polling interval.

### User Clicks Start

8. UI calls `POST /control/start` with config body.
9. `TrackrCore.start(config)`:
   - Transitions `app_state` → `"starting"`.
   - Resolves output root (may prompt for legacy migration choice).
   - Creates output directories (`overlay/`).
   - Initializes `TrackrDatabase` (SQLite at `output_root/trackr.db`).
   - Initializes `OutputWriter` and `TemplateStore`.
   - Calls `writer.start_new_session(today)` → creates `YYYY-MM-DD(N)-tracklist.txt`.
   - Writes initial `overlay/nowplaying.txt` (2 lines, both `—`).
   - Writes `overlay/nowplaying.html` from saved or default template.
   - Starts device bridge (see Section G).
   - Starts device listener thread.
   - Starts startup probe loop (6 probes, 0.5s interval).
   - Transitions `app_state` → `"running"`.
   - Emits `state_changed` event.

### Track Publish Flow

10. Device bridge detects CDJ status change (on-air + playing).
11. `TrackrCore._on_device_status(DeckStatus)` fires.
12. **Gate 1:** `is_on_air == True AND is_playing == True` — else return.
13. `_process_status()` requests metadata from bridge.
14. **Gate 2:** Metadata resolved?
    - No → Schedule retry: 350ms delay, up to 6 attempts. Emit "waiting for metadata" status.
    - Yes → Continue.
15. Compose track line: `clean_track_line(f"{artist} - {title}")` (or title-only if no artist).
16. Schedule delayed publish: `Timer(delay_seconds, publish)`.
17. **Pending key** = `f"{device_number}|{normalized_line}"`.
18. If pending key changed from prior pending → cancel old timer, schedule new.
19. Timer fires → `TrackrCore.publish(line, published_at)`.
20. **Gate 3:** Dedupe — if `normalize_for_dedupe(line) == lastPublished` → skip, emit `publish_skipped_dedupe`.
21. **Success sequence:**
    1. Write `overlay/nowplaying.txt` (current line + previous line, 2-line CRLF format).
    2. Increment play count in SQLite (`counters.play_count += 1`).
    3. Append to session tracklist (if not session-duplicate after normalization).
    4. Emit `publish_succeeded` event with track data.
    5. Emit `tracklist_appended` event if session append succeeded.

### Shutdown

22. User closes Tauri window → `CloseRequested` event.
23. Rust `on_window_event` handler kills Python sidecar (`child.kill()` with PID).
24. Python process terminates.

---

## C) State Model

### Application State Machine

```
            start()          device bridge ready
  stopped ────────► starting ──────────────────► running
     ▲                                              │
     │               stop()                         │
     └──────────── stopping ◄───────────────────────┘
                      │
                      ▼
                   stopped

  Special states:
    needs_user_choice  (output root migration prompt pending)
    error              (startup or runtime failure)
```

Valid `app_state` values: `"stopped"`, `"starting"`, `"running"`, `"stopping"`, `"needs_user_choice"`, `"error"`.

### Transient State

| State | Location | Description |
|-------|----------|-------------|
| Current track line | `core._last_published_line` | Last successfully published track |
| Previous track line | `writer._previous_line` | Line 2 of overlay file |
| Pending publish | `core._pending_timers` | Dict of `key → Timer` |
| Last published (dedupe) | `core._last_published_normalized` | Normalized line for cross-deck dedupe |
| Session dedupe set | `session._seen` | Set of normalized lines seen this session |
| Device cache | `bridge._devices` | Dict of `ip → _DiscoveredDevice` |
| Metadata cache | `beatlink_bridge._cached_metadata` | Latest `TrackMetadata` from sidecar file |
| Subscriber map | `core._subscribers` | Dict of `id → callback` for event push |
| Config snapshot | `core._config` | Frozen `TrackrConfig` for current run |

### Persisted State

| State | Location | Format |
|-------|----------|--------|
| Configuration | `~/.trackr_config.json` | JSON |
| Play count | `output_root/trackr.db` (`counters` table) | SQLite integer |
| HTML template | `output_root/trackr.db` (`prefs` table, key `overlay_template_html`) | SQLite text |
| Session tracklist | `output_root/YYYY-MM-DD(N)-tracklist.txt` | Append-only text |
| Overlay text | `output_root/overlay/nowplaying.txt` | 2-line CRLF text |
| Overlay HTML | `output_root/overlay/nowplaying.html` | HTML file |

---

## D) Track Cleaning Rules

Function: `text_cleaner.clean_track_line(line, *, strip_mix_labels=True)`

### Exact Transform Order

1. **Strip whitespace** — `line.strip()`
2. **Remove Camelot key tokens** — Regex matches:
   - Bare tokens: `8A`, `12B` (1-2 digits + A/B, case-insensitive)
   - Bracketed: `[8A]`, `[12B]`
   - Parenthesized: `(8A)`, `(12B)`
   - With surrounding whitespace
3. **Remove square bracket tags** — `[any content]` replaced with single space
4. **Normalize dash separators** — `\s*[-–—]+\s*` → `" - "` (hyphen, en-dash, em-dash)
5. **Strip mix labels** (if `strip_mix_labels=True`) — Trailing `(Original Mix)` or `(Extended Mix)` removed (case-insensitive)
   - Preserves: `(Remix)`, `(Radio Edit)`, `(Club Mix)`, `(Edit)`, and all other parenthetical labels
6. **Collapse whitespace** — 2+ spaces → single space
7. **Remove trailing dash** — ` - ` at end of string
8. **Remove leading dash** — ` - ` at start of string
9. **Final trim**

Returns empty string if input is None or empty after cleaning.

### Dedupe Normalization

Function: `text_cleaner.normalize_for_dedupe(line)`

1. Apply `clean_track_line(line)`.
2. Remove timestamp prefix (`MM:SS` or `HH:MM:SS` at start).
3. Lowercase.
4. Strip whitespace.

Used for both publish dedupe and session tracklist dedupe.

### Fallback Character

Em dash `—` (U+2014) is used as the fallback for missing/blank track text in all output files.

---

## E) Output Contract

### Output Root

- **Default:** `%USERPROFILE%\TRACKR` (e.g., `C:\Users\Art\TRACKR`)
- **Legacy:** `%USERPROFILE%\NowPlayingLite` (detected if exists, one-time migration prompt)
- **User-configurable** via settings panel or API

### Every Output File

| File | Path | Trigger | Format |
|------|------|---------|--------|
| Overlay text | `output_root/overlay/nowplaying.txt` | Every publish | 2-line CRLF UTF-8 |
| Overlay HTML | `output_root/overlay/nowplaying.html` | Startup, template save/reset | Full HTML5 |
| Session tracklist | `output_root/YYYY-MM-DD(N)-tracklist.txt` | Every publish (if not duplicate) | Append-only UTF-8 |
| Database | `output_root/trackr.db` | Every publish | SQLite3 |
| Config | `~/.trackr_config.json` | Config change | JSON |

### Intentional Removals (MUST NOT Generate)

- `output_root/nowplaying.txt` (root-level, legacy)
- `output_root/nowplaying.html` (root-level, legacy)
- `output_root/nowplaying_2line.txt` (legacy)

### File Format Details

#### `overlay/nowplaying.txt`

- **Encoding:** UTF-8
- **Line endings:** CRLF (`\r\n`)
- **Structure:** Exactly 2 lines + trailing newline
  - Line 1: Current track (cleaned text, or `—` if empty/missing)
  - Line 2: Previous track (cleaned text, or `—` initially)
- **Write strategy:** Direct rewrite (`CREATE, TRUNCATE_EXISTING`), not atomic
- **Written by:** `OutputWriter.write_overlay_nowplaying(line)`

Example:
```
Artbat - Talavera\r\n
Lane 8 - Brightest Lights\r\n
```

#### `overlay/nowplaying.html`

- **Encoding:** UTF-8
- **Structure:** Full HTML5 document with inline CSS and polling JavaScript
- **User-editable** via Template tab in UI
- **Default template features:**
  - Transparent background (for OBS browser source compositing)
  - Polls `nowplaying.txt` every 750ms with cache-busting query parameter
  - Parses CRLF/LF line endings
  - Renders `#current` (white, 36px) and `#previous` (gray, 24px)
  - Font: `Segoe UI, sans-serif`
- **Persisted in:** SQLite `prefs` table, key `overlay_template_html`

#### Session Tracklist `YYYY-MM-DD(N)-tracklist.txt`

- **Encoding:** UTF-8
- **Line endings:** LF (`\n`) — note: different from overlay text
- **Structure:** Append-only, one line per track
- **With timestamps:** `HH:MM:SS  Artist - Title\n` or `MM:SS  Artist - Title\n`
- **Without timestamps:** `Artist - Title\n`
- **First track timestamp:** Always `00:00`
- **Timestamp calculation:** Elapsed time from session start (first publish), adjusted by `delay_seconds`

Example (timestamps enabled):
```
00:00  Artbat - Talavera
04:32  Lane 8 - Brightest Lights
09:15  Yotto - Wondering
```

### Write Triggers

| Event | Files Written |
|-------|--------------|
| Service start | `overlay/nowplaying.txt` (init with `—`), `overlay/nowplaying.html` (from template) |
| Track publish | `overlay/nowplaying.txt` (rewrite), session tracklist (append), `trackr.db` (increment) |
| Template save | `overlay/nowplaying.html` (rewrite) |
| Template reset | `overlay/nowplaying.html` (rewrite to default) |
| Config change | `~/.trackr_config.json` (rewrite) |

---

## F) Session Tracklist Rules

### Filename Selection

1. Base pattern: `YYYY-MM-DD(N)-tracklist.txt`
2. `N` starts at 1, increments if file exists for that date.
3. Example sequence: `2026-02-22(1)-tracklist.txt`, `2026-02-22(2)-tracklist.txt`, ...
4. Output directory is `output_root` (not `overlay/`).

### Dedupe Rules

1. Normalize candidate: `normalize_for_dedupe(line)` → lowercase, no timestamps, cleaned.
2. If normalized line is in session `_seen` set → reject (do not append).
3. If cleaned line is blank → reject.
4. `_seen` set is seeded from existing file content on session start (crash recovery).

### Timestamp Rules

- **Enabled by config:** `timestamps_enabled: bool` (default `True`).
- **Format:** `MM:SS` when hours=0, `H:MM:SS` when hours>0.
- **Baseline:** First track always `00:00`, regardless of wall clock.
- **Calculation:** `published_at - session_start_time`, adjusted by subtracting `delay_seconds`.
- **Refresh resets baseline** to `00:00` for next track.

---

## G) Device Detection and Lifecycle

### Bridge Architecture

TRACKR uses a pluggable `DeviceBridge` protocol with three implementations:

#### 1. `RealDeviceBridge` (Python-only UDP listener)

- Listens on UDP ports 50000, 50001, 50002 using `select()`.
- Validates Pro DJ Link magic header: `Qspt1WmJOL` (first 10 bytes).
- Extracts device name from bytes 0x0B–0x1E (null-terminated ASCII).
- Infers device number from packet offsets 0x21, 0x24, 0x25; falls back to IP last octet.
- Caches devices by IP; expires after 5 seconds of silence.
- Reports device summaries: `[{"name": "CDJ-3000", "count": 2}, ...]` grouped by model.
- **Limitation:** Only detects presence. `is_on_air` and `is_playing` always return `False`. No metadata resolution.

#### 2. `JavaNowPlayingSidecarBridge` (file-based, via beat-link sidecar)

- Spawns `trackr-sidecar.exe` with `--tray` flag (headless).
- Polls `~/NowPlayingLite/overlay/nowplaying.txt` every 350ms for metadata changes.
- Parses first line as `"Artist - Title"` format.
- Caches as `TrackMetadata(title, artist)`.
- Reports as single virtual deck (device_number=1, is_on_air=True, is_playing=True).
- Device count via ARP probe every 2.5s:
  - Runs `arp -a`, parses output.
  - Filters by Pioneer MAC OUI prefixes: `2c-f0-a2`, `8c-f5-a3`, `c8-3d-fc`.
  - Excluded OUI: `00-17-88` (shared with Philips Hue).

#### 3. `HybridDeviceBridge` (composition)

- Combines `RealDeviceBridge` (discovery) + `JavaNowPlayingSidecarBridge` (metadata).
- Python binds UDP ports FIRST, then spawns sidecar (avoids SO_REUSEADDR race).
- Discovery bridge provides device counts; metadata bridge provides artist/title.

#### Bridge Selection (factory function: `build_runtime_device_bridge()`)

1. If sidecar executable found → `JavaNowPlayingSidecarBridge` (with `restart_existing_sidecar=True`).
2. Otherwise → `RealDeviceBridge` (UDP-only discovery).
3. In production: wrapped in `HybridDeviceBridge`.

### Windows UDP Port Sharing Limitation (CRITICAL)

Only one process can receive broadcast UDP packets per port on Windows. This means Python's `RealDeviceBridge` and the Java sidecar cannot simultaneously listen on ports 50000-50002. This was tested and confirmed both directions. Not fixable with `SO_REUSEADDR`.

### Pioneer CDJ Hardware Tested

- CDJ-3000 (3 units) — confirmed working
- DJM-A9 mixer — confirmed detected
- TCP port 50002 probe was dropped (CDJ-3000s don't listen on it)

---

## H) Control Actions

### Start

1. UI sets state → `"starting"`, disables Start button.
2. Calls `POST /control/start` with config body.
3. Core validates config, resolves output root.
4. If output root needs user choice → returns 409, UI shows migration modal.
5. Otherwise: initializes all subsystems, transitions to `"running"`.
6. UI re-enables controls, starts tracklist polling.

### Stop

1. UI sets state → `"stopping"`.
2. Calls `POST /control/stop`.
3. Core cancels pending publishes, stops device bridge, stops API rebind if needed.
4. Leaves all files intact on disk.
5. Transitions to `"stopped"`.

### Refresh (New Session)

1. UI shows confirmation dialog ("This will start a new session").
2. On confirm: calls `POST /control/refresh`.
3. Core performs `stop()` then `start(current_config)`.
4. Creates new session file with next daily index.
5. Resets timestamp baseline (next track = `00:00`).
6. Clears session dedupe memory.
7. Resets "published ago" counter in UI.

---

## I) Logging and Diagnostics

- Python backend logs to stdout/stderr.
- Tauri captures sidecar output, prefixes with `[trackr-backend]`.
- No app-managed log file on disk.
- Status messages exposed via `get_status()` → `status_text` field:
  - `"starting..."`, `"listening"`, `"waiting for metadata (deck N)"`, `"published"`, `"stopped"`, `"error: ..."`
- Events provide push-based diagnostics via `subscribe_events()`.
- Java sidecar uses `slf4j-simple` → stdout.

---

## J) REST API Specification

### Server Configuration

- **Framework:** `http.server.ThreadingHTTPServer` (Python stdlib)
- **Default port:** 8755
- **Bind modes:**
  - Localhost: `127.0.0.1:8755`
  - LAN: `0.0.0.0:8755`
- **Threading:** One thread per request (ThreadingHTTPServer)
- **Socket reuse:** `allow_reuse_address = True`

### CORS Configuration

All responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

All endpoints respond to `OPTIONS` with 200 and CORS headers (preflight support).

### Response Envelope

Success: `HTTP 200` with JSON body (specific to endpoint).

Error:
```json
{
  "ok": false,
  "error": {
    "code": "error_code_string",
    "message": "Human-readable error description"
  }
}
```

Error status codes:
- `400` — Invalid request, invalid config, invalid template, invalid choice
- `404` — Route not found
- `409` — State conflict (needs_user_choice, not_started, not_running)
- `500` — Internal error, startup failure, write failure

### Endpoints

#### `GET /health`

Health check for backend connectivity.

**Response (200):**
```json
{
  "ok": true,
  "is_running": true
}
```

#### `GET /nowplaying`

Current track information (used by Roonie-AI).

**Response (200):**
```json
{
  "current": "Artist - Title",
  "previous": "Previous Artist - Title",
  "session_file": "2026-02-22(1)-tracklist.txt",
  "is_running": true,
  "device_count": 3,
  "play_count": 42
}
```

- `current` / `previous`: Cleaned track text, or `"—"` if none.
- `play_count`: Only included when `share_play_count_via_api == true`.
- `device_count`: Number of detected Pioneer devices on network.

#### `GET /status`

Full application state snapshot.

**Response (200):**
```json
{
  "app_state": "running",
  "status_text": "listening",
  "device_count": 3,
  "devices": [{"name": "CDJ-3000", "count": 3}],
  "last_published_line": "Artist - Title",
  "session_file_name": "2026-02-22(1)-tracklist.txt",
  "api_effective_bind_host": "0.0.0.0",
  "lan_ip": "192.168.1.100",
  "api_port": 8755,
  "api_enabled": true,
  "api_access_mode": "lan",
  "share_play_count_via_api": false,
  "output_root": "C:\\Users\\Art\\TRACKR",
  "migration_prompt_seen": true,
  "runtime_bridge": "HybridDeviceBridge"
}
```

#### `POST /control/start`

Start TRACKR processing.

**Request body (optional):** Config overrides as JSON object.

**Response (200):** Status snapshot.
**Response (409):** `needs_user_choice` — output root migration prompt required.
**Response (500):** Startup error.

#### `POST /control/stop`

Stop TRACKR processing.

**Request body:** `{}` (empty object).

**Response (200):** Status snapshot.

#### `POST /control/refresh`

Stop + Start as one operation (new session).

**Request body:** `{}` (empty object).

**Response (200):** Status snapshot.
**Response (409):** Output root needs choice.

#### `GET /config`

Current configuration.

**Response (200):**
```json
{
  "output_root": "C:\\Users\\Art\\TRACKR",
  "migration_prompt_seen": true,
  "delay_seconds": 3.0,
  "timestamps_enabled": true,
  "strip_mix_labels": true,
  "api_enabled": true,
  "api_access_mode": "lan",
  "share_play_count_via_api": false,
  "api_port": 8755
}
```

#### `POST /config`

Update configuration. Validates and persists.

**Request body:** Config fields to update (partial update supported).
**Response (200):** Updated config.
**Response (400):** Validation error.

#### `GET /template`

Current overlay HTML template.

**Response (200):**
```json
{
  "template": "<!DOCTYPE html>..."
}
```

**Response (409):** Output root not resolved.

#### `POST /template`

Save new overlay template.

**Request body:**
```json
{
  "template": "<!DOCTYPE html>..."
}
```

**Response (200):** Saved template echoed.
**Response (400):** Empty/invalid template.
**Response (409):** Output root not resolved.

#### `POST /template/reset`

Restore default template.

**Request body:** `{}`
**Response (200):** Default template.
**Response (409):** Output root not resolved.

#### `GET /output-root/resolve`

Check output root migration status.

**Response (200):**
```json
{
  "state": "resolved",
  "output_root": "C:\\Users\\Art\\TRACKR",
  "legacy_output_root": "C:\\Users\\Art\\NowPlayingLite",
  "trackr_output_root": "C:\\Users\\Art\\TRACKR",
  "migration_prompt_seen": true
}
```

- `state`: `"resolved"` or `"needs_user_choice"`.

#### `POST /output-root/choose`

Persist user's output root choice.

**Request body:**
```json
{
  "choice": "legacy"
}
```

- `choice`: `"legacy"` (use `~/NowPlayingLite`) or `"trackr"` (use `~/TRACKR`).

**Response (200):** Updated resolution.
**Response (400):** Invalid choice value.

### Authentication

None. The API is unauthenticated. Access is controlled by bind mode (localhost vs LAN).

### Rate Limiting

None. Relies on HTTP server's connection handling.

---

## K) Discogs Metadata Enrichment

**NOT IMPLEMENTED** in the current codebase.

The metadata pipeline is:
1. Java sidecar reads CDJ metadata via beat-link.
2. Writes `"Artist - Title"` to `~/NowPlayingLite/overlay/nowplaying.txt`.
3. Python polls this file, parses the line, caches as `TrackMetadata(title, artist)`.
4. No external API enrichment occurs.

The SQLite `prefs` table exists and could store enrichment data in the future, but no Discogs or other metadata API integration is present.

---

## L) Architecture Diagram

See Section A for the full architecture diagram.

### Data Flow Summary

```
Pioneer CDJs (Pro DJ Link broadcast, UDP 50000-50002)
    │
    ├──► Java sidecar (beat-link) → ~/NowPlayingLite/overlay/nowplaying.txt
    │                                          │
    │                                          ▼
    │                              Python polls file (350ms)
    │                              Parses "Artist - Title"
    │                                          │
    ├──► Python RealDeviceBridge (UDP listener) │
    │    Device name + count only               │
    │                                           ▼
    │                              TrackrCore._on_device_status()
    │                              Gate: isOnAir && isPlaying
    │                              Metadata retry (350ms × 6)
    │                              Delayed publish (configurable)
    │                              Dedupe check
    │                                           │
    │                                           ▼
    │                              OutputWriter.write_overlay_nowplaying()
    │                              SessionTracker.append()
    │                              TrackrDatabase.increment_play_count()
    │                              Core emits events
    │                                           │
    │                                           ▼
    │                              overlay/nowplaying.txt (OBS reads)
    │                              overlay/nowplaying.html (OBS reads)
    │                              session tracklist (appended)
    │                                           │
    │                                           ▼
    │                              HTTP API (port 8755)
    │                              React UI polls status + events
    │                              Roonie-AI calls /nowplaying
    │
    └──► ARP probe (every 2.5s) → device count for UI display
```

### IPC Boundaries

| Boundary | Mechanism | Direction |
|----------|-----------|-----------|
| Tauri → Python | Process spawn + stdout capture | Tauri spawns, Python runs |
| React → Python | HTTP (127.0.0.1:8755) | React polls/posts, Python responds |
| Python → Java sidecar | Process spawn (`Popen`) | Python spawns, reads file |
| Java sidecar → Python | File I/O (`~/NowPlayingLite/overlay/nowplaying.txt`) | Java writes, Python reads |
| Python → OBS | File I/O (`output_root/overlay/`) | Python writes, OBS browser source reads |
| Python → Roonie-AI | HTTP API (`GET /nowplaying`) | Roonie polls, Python responds |

---

## M) Frontend Component Inventory

### Component Hierarchy

```
App (root)
├── SplashScreen
│   └── [Hardware-aesthetic loading animation]
├── TrackrDashboard (main UI, JSX)
│   ├── Header (44px)
│   │   ├── Logo "TRACKR v1.0"
│   │   ├── Connection LED + status
│   │   ├── Device count / label
│   │   ├── StateBadge
│   │   └── Window controls (decorative)
│   ├── Now Playing Strip (36px)
│   │   ├── "NOW" + current track
│   │   └── "PREV" + previous track
│   ├── Left Sidebar (280px)
│   │   ├── Status Panel (RackPanel)
│   │   │   ├── State LED
│   │   │   ├── Device indicator
│   │   │   └── Output dir + session label
│   │   └── Controls Panel (RackPanel)
│   │       ├── Start/Stop button (Btn)
│   │       ├── Refresh button (Btn)
│   │       ├── Delay slider (± buttons)
│   │       ├── Toggle: Timestamps
│   │       └── Toggle: Strip Mix Labels
│   ├── Right Content (flex)
│   │   ├── Tab Bar: LIVE | TEMPLATE | SETTINGS
│   │   ├── Live Tab
│   │   │   └── Session tracklist (scrollable)
│   │   ├── Template Tab
│   │   │   ├── HTML textarea editor
│   │   │   ├── Save button
│   │   │   └── Restore Default button
│   │   └── Settings Tab
│   │       ├── Output directory (Browse button)
│   │       ├── Startup toggles (unwired)
│   │       ├── API settings (enable, mode, share play count)
│   │       └── About + Update checker
│   ├── Output Root Choice Modal
│   ├── Confirmation Dialog
│   └── Toast Notifications
└── Backend Status Indicator (fixed top-right)
```

### Reusable Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `Led` | `color`, `size=8`, `pulse=false` | Glowing colored circle indicator |
| `RackPanel` | `label`, `labelRight`, `children` | Dark panel with header, rack-inspired border |
| `Toggle` | `on`, `onChange`, `disabled`, `label` | Clickable toggle switch |
| `Btn` | `children`, `color`, `onClick`, `disabled`, `fullWidth` | Styled button with hover effects |
| `StateBadge` | `state` | LED + text badge for app state |

### Design Token Reference

```javascript
const C = {
  bgDeep:       "#0a0a0a",   // Deep black background
  bgPanel:      "#131315",   // Panel backgrounds
  bgInset:      "#18181b",   // Inset fields
  bgInsetHover: "#1e1e22",   // Hover state
  borderRack:   "#252528",   // Default border
  borderFocus:  "#333338",   // Focus border
  textPrimary:  "#d0d0d4",   // Main text
  textDim:      "#606068",   // Dimmed text
  textMuted:    "#3a3a40",   // Muted labels
  green:        "#2ecc40",   // Running / success
  greenDim:     "#1a5c25",   // Dim green
  amber:        "#f0c020",   // Warning / refresh
  amberDim:     "#5c4a10",   // Dim amber
  red:          "#e8413a",   // Error / stop
  redDim:       "#5c1a18",   // Dim red
  blue:         "#4a9eff",   // Info / primary action
  cyan:         "#7fdbca",   // Accent / highlight
  cyanDim:      "#2a4a42",   // Dim cyan
};
```

**Typography:** JetBrains Mono (primary), Fira Code / SF Mono (fallback), monospace.

**Design Language:** Dark studio-hardware aesthetic — rack panels, screw corners, LED indicators, meter segments, scanline textures.

### Tauri API Dependencies (Need Electron Equivalents)

| Tauri API | Used In | Purpose | Electron Equivalent |
|-----------|---------|---------|-------------------|
| `@tauri-apps/plugin-dialog` `open()` | `handleBrowseOutputDir()` | Directory picker | `dialog.showOpenDialog()` via IPC |
| `@tauri-apps/plugin-updater` `check()` | `updater.ts` | Check for updates | `electron-updater` `autoUpdater` |
| `@tauri-apps/plugin-updater` `downloadAndInstall()` | `updater.ts` | Download + install update | `electron-updater` auto-download |
| `@tauri-apps/plugin-process` `relaunch()` | `updater.ts` | Restart after update | `app.relaunch()` + `app.exit()` |

**Not used but imported:** `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-opener`.

### Unwired Features (UI exists, no backend)

- **Start in system tray** toggle — No Tauri tray plugin integration
- **Start with Windows** toggle — No Windows registry / auto-start integration

---

## N) Configuration Reference

### All User-Configurable Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `output_root` | Path | `~/TRACKR` | Output directory for overlays, sessions, DB |
| `migration_prompt_seen` | bool | `false` | Whether legacy migration prompt was shown |
| `delay_seconds` | float | `3.0` | Seconds to wait before publishing (debounce) |
| `timestamps_enabled` | bool | `true` | Include elapsed timestamps in session tracklist |
| `strip_mix_labels` | bool | `true` | Remove "(Original Mix)" / "(Extended Mix)" suffixes |
| `api_enabled` | bool | `true` | Enable HTTP API server |
| `api_access_mode` | string | `"lan"` | `"localhost"` (127.0.0.1) or `"lan"` (0.0.0.0) |
| `share_play_count_via_api` | bool | `false` | Include play count in `/nowplaying` response |
| `api_port` | int | `8755` | HTTP server port (1–65535) |

### Persistence

- Config file: `~/.trackr_config.json`
- Template: SQLite `prefs` table, key `overlay_template_html`
- Play count: SQLite `counters` table, key `play_count`

---

## O) Test Coverage Summary

### Test Files (11 files, ~67+ test cases)

| File | Tests | Coverage |
|------|-------|---------|
| `test_text_cleaner.py` | 30+ | Camelot, brackets, dashes, mix labels, whitespace, dedupe normalization |
| `test_device_bridge.py` | 8 | Device listener gating, metadata retry, delayed publish, cancellation |
| `test_config.py` | 5 | Config load/save, output root resolution, migration logic |
| `test_api.py` | 5 | HTTP endpoints, CORS, JSON parsing, error responses |
| `test_core.py` | 4 | Start/stop/refresh state machine, subscriptions, tracklist |
| `test_beatlink_bridge.py` | 5 | Sidecar detection, ARP parsing, OUI filtering |
| `test_session.py` | 4 | Session naming, dedupe, timestamp formatting |
| `test_real_device_bridge.py` | 3 | UDP packet parsing, device name extraction |
| `test_simulated_source.py` | 2 | Replay harness, event feeding |
| `test_writer.py` | 1 | Output file format verification |
| `test_utils.py` | — | Shared test utilities |

### Test Fixtures

- `fixtures/sim_deck_changes_and_repeats.json` — Simulated multi-deck status stream
- `fixtures/sim_same_key_no_reschedule.json` — Dedupe key behavior

### Gaps

- HTML template persistence (untested)
- SQLite DB file creation / recovery (untested)
- Event subscription push (untested directly)
- Refresh integration (no full cycle test)
- Cross-deck dedupe scenarios (untested)

---

## P) Known Issues and Workarounds

### Architecture Constraints

1. **Windows UDP port sharing** — Only one process can receive broadcast packets per port. Python and Java sidecar cannot both listen on 50000-50002. Managed by bind-order priority (Python first).

2. **Java sidecar hardcoded output path** — Writes to `~/NowPlayingLite/overlay/nowplaying.txt` regardless of configured output root. Python reads from this path.

3. **Single metadata deck** — Sidecar reports all metadata as virtual deck 1. No per-deck metadata resolution when using file-based bridge.

### Build Issues

4. **jpackage "Access is denied"** on incremental builds — Only fix is full clean rebuild (`rm -rf target/release`).

5. **PyInstaller rebuild required** for any Python code change before Tauri build.

6. **Must kill `trackr-backend.exe`** before reinstalling (NSIS can't overwrite locked file).

7. **Never use `--ci` or `-p ""`** for signing key generation — creates structurally broken key.

### Feature Gaps

8. **Tray/startup toggles unwired** — UI toggles exist but have no backend implementation.

9. **No Discogs enrichment** — Metadata limited to what beat-link provides from CDJ.

10. **No hot-reload** of device bridge — Requires app restart to switch bridge type.

### Known Edge Case

11. **App shows online but doesn't publish** — Documented from Java legacy. Device announcements update count, but publish only triggers from status update callbacks. Mitigated by startup probes.

---

## Q) Build Pipeline

### Full Build (Windows)

```powershell
$env:TRACKR_SIGN_PASSWORD = '<password>'
.\build.ps1
```

**Steps:**
1. Clean artifacts (`dist/`, `__pycache__`)
2. PyInstaller freeze → `src-tauri/trackr-backend-x86_64-pc-windows-msvc.exe`
3. Verify Java sidecar at `build/jpackage/trackr-sidecar/trackr-sidecar.exe`
4. `npm install` in `ui/trackr-ui/`
5. Load signing key from `~/.tauri/trackr.key`
6. `npx tauri build` → NSIS installer + `.sig` signature

**Output:** `ui/trackr-ui/src-tauri/target/release/bundle/nsis/TRACKR_0.9.0_x64-setup.exe`

### Prerequisites

- Python 3.12+, PyInstaller
- Node.js 18+, npm
- Rust toolchain (via rustup)
- Java JDK 21+ (for jpackage)
- Signing key at `~/.tauri/trackr.key` with `TRACKR_SIGN_PASSWORD` env var

### Auto-Updater

- Endpoint: `https://github.com/cland3stine/TRACKR/releases/latest/download/latest.json`
- Public key: Base64-encoded minisign key in `tauri.conf.json`
- Produces `.exe.sig` alongside installer for signature verification
