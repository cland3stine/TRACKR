# TRACKR Specification v3 — Electron Migration Target

> **Date:** 2026-02-22
> **Target Version:** 1.0.0
> **Purpose:** Define the target architecture and behavior for TRACKR after migrating from Tauri 2 + Python + Java sidecar to Electron + prolink-connect (TypeScript). Every behavior from v2 spec must be preserved unless explicitly marked as changed.

---

## A) Project Overview

TRACKR is a Windows desktop application that connects to Pioneer CDJs via the Pro DJ Link protocol, publishes cleaned "now playing" track information to OBS overlays, maintains session tracklists, and exposes an HTTP API for integration with Roonie-AI.

### Architecture (Target)

```
┌────────────────────────────────────────────────────────────┐
│  Electron Shell (Node.js main process)                     │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Main Process (TypeScript)                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │    │
│  │  │prolink.ts│  │  api.ts  │  │   output.ts     │  │    │
│  │  │prolink-  │  │Express.js│  │  file writer    │  │    │
│  │  │connect   │  │port 8755 │  │  overlay + sess │  │    │
│  │  └────┬─────┘  └──────────┘  └─────────────────┘  │    │
│  │       │                                            │    │
│  │  ┌────▼─────┐  ┌──────────┐  ┌─────────────────┐  │    │
│  │  │cleaner.ts│  │session.ts│  │   store.ts      │  │    │
│  │  │text clean│  │tracklist │  │ electron-store  │  │    │
│  │  └──────────┘  │  dedupe  │  │  settings       │  │    │
│  │                └──────────┘  └─────────────────┘  │    │
│  │  ┌──────────┐  ┌──────────┐                       │    │
│  │  │ tray.ts  │  │discogs.ts│                       │    │
│  │  │sys tray  │  │ metadata │                       │    │
│  │  └──────────┘  │ enrichmt │                       │    │
│  │                └──────────┘                       │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │ IPC (contextBridge)                │
│  ┌────────────────────▼───────────────────────────────┐    │
│  │  Renderer Process (React 19 + TypeScript)          │    │
│  │  trackr-dashboard  (existing components, ported)   │    │
│  │  SplashScreen, updater (Electron equivalents)      │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
         │                              │
         │ File I/O                     │ UDP (Pro DJ Link)
         ▼                              ▼
  ~/TRACKR/overlay/          Pioneer CDJ-3000s + DJM-A9
  nowplaying.txt                 (Pro DJ Link network)
  nowplaying.html
  tracklist files
  trackr.db
```

### What Changes

| Eliminated | Replaced By |
|-----------|-------------|
| Java sidecar (beat-link, JRE 21, jpackage) | prolink-connect in Electron main process |
| Python backend (13 modules, PyInstaller) | TypeScript modules in Electron main process |
| Tauri shell (Rust, WebView2) | Electron (Chromium) |
| File-based IPC (sidecar → Python) | Direct in-process function calls |
| ARP-based device detection | prolink-connect `deviceManager` events |
| Windows UDP port sharing workaround | Single-process, no conflict |
| `ThreadingHTTPServer` (Python stdlib) | Express.js in main process |
| SQLite via Python `sqlite3` | `better-sqlite3` or `electron-store` |
| `~/.trackr_config.json` file | `electron-store` |

### What Does NOT Change

- React frontend (components, design tokens, layout)
- All output file paths, formats, and contracts
- REST API paths, methods, request/response schemas
- Track cleaning rules and transform order
- Session tracklist naming, dedupe, timestamp rules
- Publish pipeline gates (isOnAir, isPlaying, metadata, delay, dedupe)
- Design language (dark studio-hardware aesthetic)

### Technology Stack (Target)

| Layer | Technology | Version |
|-------|-----------|---------|
| Shell | Electron | Latest stable |
| Frontend | React + TypeScript | 19.x / 5.x |
| Build tool | Vite (renderer) + esbuild/tsc (main) | — |
| CDJ Protocol | prolink-connect | Latest |
| REST API | Express.js | 4.x |
| Settings | electron-store | Latest |
| Database | better-sqlite3 | Latest |
| Installer | electron-builder (NSIS target) | Latest |
| Auto-updater | electron-updater | Latest |

---

## B) Canonical Runtime Flow (Step-by-Step)

### Application Startup

1. User launches `TRACKR.exe` (Electron app).
2. Electron main process (`index.ts`) initializes:
   - Creates `BrowserWindow` (1200×900, min 1200×900).
   - Loads renderer from bundled Vite output.
   - Initializes `electron-store` for settings.
   - Registers all `ipcMain.handle()` handlers.
   - Starts Express.js API server on configured port (8755).
3. Renderer process loads:
   - React mounts `<App />`.
   - `SplashScreen` shows with hardware-aesthetic loading animation (preserved from v2).
   - Renderer calls `ipcRenderer.invoke('get-status')` to check backend readiness.
   - Once main process responds, splash fades, dashboard renders.
4. Dashboard initializes:
   - Fetches initial status, tracklist, and template via IPC.
   - Subscribes to events via `ipcRenderer.on('trackr:event', callback)`.

### User Clicks Start

5. Renderer calls `ipcRenderer.invoke('control:start', config)`.
6. Main process `prolink.ts`:
   - Resolves output root (may prompt for legacy migration).
   - Creates output directories.
   - Initializes database (`better-sqlite3`).
   - Initializes output writer and template store.
   - Creates new session file.
   - Writes initial overlay files.
   - Calls `prolink-connect` `bringOnline()`.
   - Calls `autoconfigFromPeers()`.
   - Calls `network.connect()`.
   - Registers device discovery listeners.
   - Registers CDJ status listeners.
   - Transitions to `"running"`.
   - Sends `trackr:event` with `state_changed` to renderer.

### Track Publish Flow (via prolink-connect)

7. prolink-connect emits CDJ status update.
8. **Gate 1:** `status.isOnAir === true && status.playState === PlayState.Playing` — else return.
9. Request metadata: `network.db.getMetadata({ trackDeviceId, trackSlot, trackType, trackId })`.
10. **Gate 2:** Metadata resolved?
    - No → Schedule retry: 350ms delay, up to 6 attempts.
    - Yes → Continue.
11. Compose track line: `cleanTrackLine(`${metadata.artist} - ${metadata.title}`)`.
12. Schedule delayed publish: `setTimeout(publish, delaySeconds * 1000)`.
13. **Pending key** = `${deviceId}|${normalizedLine}`.
14. If pending key changed → `clearTimeout(old)`, schedule new.
15. Timer fires → `publish(line, publishedAt)`.
16. **Gate 3:** Dedupe — if `normalizeForDedupe(line) === lastPublished` → skip.
17. **Success sequence** (IDENTICAL to v2):
    1. Write `overlay/nowplaying.txt` (2-line CRLF format).
    2. Increment play count in database.
    3. Append to session tracklist (if not session-duplicate).
    4. Send `trackr:event` with `publish_succeeded` to renderer.
    5. Send `trackr:event` with `tracklist_appended` if append succeeded.

### Shutdown

18. User closes window → `close` event on BrowserWindow.
19. Electron calls `prolink-connect` `network.disconnect()`.
20. Express server closes.
21. Database closes.
22. App exits.

---

## C) State Model

**IDENTICAL to v2.** All state variables, transitions, and persistence locations are preserved. The only change is the storage mechanism:

| v2 (Python) | v3 (Electron) |
|-------------|---------------|
| `~/.trackr_config.json` (manual JSON) | `electron-store` (automatic JSON in app data) |
| `sqlite3` (Python stdlib) | `better-sqlite3` (npm) |
| `threading.RLock()` | Single-threaded main process (no locks needed) |
| `threading.Timer` | `setTimeout()` / `clearTimeout()` |

---

## D) Track Cleaning Rules

**IDENTICAL to v2.** Port the exact transform order from `text_cleaner.py` to `cleaner.ts`:

1. Strip whitespace
2. Remove Camelot key tokens (regex)
3. Remove square bracket tags (regex → space)
4. Normalize dash separators (regex → `" - "`)
5. Strip mix labels if enabled (regex, case-insensitive)
6. Collapse whitespace
7. Remove trailing/leading dash remnants
8. Final trim

Port the exact regex patterns. Write tests matching every existing Python test case.

`normalizeForDedupe(line)`: clean → remove timestamp prefix → lowercase → trim.

Fallback character: `—` (U+2014).

---

## E) Output Contract

**IDENTICAL to v2.** All file paths, formats, encodings, line endings, and write triggers are preserved exactly.

| File | Path | Format | Notes |
|------|------|--------|-------|
| Overlay text | `output_root/overlay/nowplaying.txt` | 2-line CRLF UTF-8 | OBS reads this |
| Overlay HTML | `output_root/overlay/nowplaying.html` | HTML5 | OBS browser source |
| Session tracklist | `output_root/YYYY-MM-DD(N)-tracklist.txt` | Append-only UTF-8, LF | Per session |
| Database | `output_root/trackr.db` | SQLite3 | Play count + prefs |

**Forbidden outputs:** root `nowplaying.txt`, root `nowplaying.html`, `nowplaying_2line.txt`.

**Write strategy:** Direct write (`fs.writeFileSync` with `{flag: 'w'}` for rewrites, `{flag: 'a'}` for appends). Non-atomic, matching v2 behavior.

**CRITICAL:** OBS overlays read these exact file paths. Any change breaks live streaming setups.

---

## F) Session Tracklist Rules

**IDENTICAL to v2.**

- Naming: `YYYY-MM-DD(N)-tracklist.txt`, N starts at 1.
- Dedupe: `normalizeForDedupe(line)`, case-insensitive, seen-set per session.
- Timestamps: `MM:SS` or `H:MM:SS`, first track always `00:00`.
- Refresh creates new file, resets baseline and dedupe.
- Seed seen-set from existing file on session start.

---

## G) Device Detection and Lifecycle

### prolink-connect Integration

**This is the biggest architectural change.** prolink-connect replaces both the Java sidecar AND ARP-based detection.

```typescript
import { bringOnline, NetworkState } from 'prolink-connect';

// Initialize
const network = await bringOnline();
await network.autoconfigFromPeers();
await network.connect();

// Device discovery
network.deviceManager.on('connected', (device: Device) => {
  // device.name = "CDJ-3000", device.id = 2, etc.
  emitDeviceCount(network.deviceManager.devices.size);
});

network.deviceManager.on('disconnected', (device: Device) => {
  emitDeviceCount(network.deviceManager.devices.size);
});

// CDJ status monitoring
network.statusEmitter.on('status', (status: CDJStatus) => {
  // status.deviceId, status.isOnAir, status.playState, status.trackId, etc.
  if (status.isOnAir && status.playState === PlayState.Playing) {
    processStatusForPublish(status);
  }
});

// Metadata resolution
const metadata = await network.db.getMetadata({
  deviceId: status.trackDeviceId,
  trackSlot: status.trackSlot,
  trackType: status.trackType,
  trackId: status.trackId,
});
// metadata.title, metadata.artist
```

### Key Differences from v2

| v2 Behavior | v3 Behavior | Impact |
|-------------|-------------|--------|
| ARP probe every 2.5s for device count | prolink-connect `deviceManager` events (instant) | Better: real-time device tracking |
| Pioneer MAC OUI filtering | Not needed — prolink-connect only sees Pro DJ Link devices | Better: no false positives |
| File-based metadata (350ms poll) | Direct `getMetadata()` call | Better: faster, no polling |
| `is_on_air` always `False` (RealDeviceBridge) | Real `isOnAir` from CDJ status | Better: proper gate behavior |
| `is_playing` always `False` (RealDeviceBridge) | Real `playState` from CDJ status | Better: proper gate behavior |
| Single virtual deck (sidecar) | Per-deck status with real device IDs | Better: multi-deck awareness |
| Windows UDP port sharing conflict | Single process, no conflict | Eliminated |

### Virtual CDJ Strategy

prolink-connect creates a virtual CDJ on the network. Use **device ID 5** (above the 4 typical physical CDJs) to avoid conflicts:

```typescript
const network = await bringOnline({ virtualCdjId: 5 });
```

### Hardware Compatibility

prolink-connect supports:
- CDJ-3000 (Art's hardware)
- CDJ-2000NXS2
- XDJ-XZ, XDJ-700, XDJ-1000MK2
- DJM-900NXS2, DJM-A9, DJM-V10

**Phase 0 validation is REQUIRED** before proceeding with migration. Test with Art's specific CDJ-3000s + DJM-A9 setup.

### Device Summary Format

Preserve the same UI contract:
```typescript
function getDeviceSummaries(): { name: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const device of network.deviceManager.devices.values()) {
    const name = device.name; // e.g., "CDJ-3000"
    counter.set(name, (counter.get(name) ?? 0) + 1);
  }
  return Array.from(counter.entries()).map(([name, count]) => ({ name, count }));
}
```

---

## H) Control Actions

**IDENTICAL to v2** from the user's perspective. Implementation changes:

| Action | v2 (Python HTTP) | v3 (Electron IPC) |
|--------|------------------|-------------------|
| Start | `POST /control/start` | `ipcRenderer.invoke('control:start', config)` |
| Stop | `POST /control/stop` | `ipcRenderer.invoke('control:stop')` |
| Refresh | `POST /control/refresh` | `ipcRenderer.invoke('control:refresh')` |

The React frontend replaces HTTP `fetch()` calls with `ipcRenderer.invoke()` calls. The behavior (idempotency, state transitions, confirmation dialogs) is unchanged.

**IMPORTANT:** The REST API (`api.ts` via Express) ALSO exposes these same controls for Roonie-AI. Both IPC and HTTP paths call the same underlying functions.

---

## I) Logging and Diagnostics

- Electron main process logs to stdout and `electron-log` (file-based, app data directory).
- Status messages: Same `status_text` strings as v2.
- Events: Same event types, delivered via `mainWindow.webContents.send('trackr:event', event)`.
- No Java sidecar logs to capture.

---

## J) REST API Specification

**IDENTICAL contract to v2.** Same paths, methods, request/response schemas.

### Implementation Change

| v2 | v3 |
|----|-----|
| `http.server.ThreadingHTTPServer` (Python) | Express.js (Node.js) |

### All Endpoints (Preserved)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/nowplaying` | Current track (Roonie-AI uses this) |
| GET | `/status` | Full status snapshot |
| POST | `/control/start` | Start processing |
| POST | `/control/stop` | Stop processing |
| POST | `/control/refresh` | New session |
| GET | `/config` | Current config |
| POST | `/config` | Update config |
| GET | `/template` | Current HTML template |
| POST | `/template` | Save template |
| POST | `/template/reset` | Restore default |
| GET | `/output-root/resolve` | Migration status |
| POST | `/output-root/choose` | Migration choice |

### CORS

Same configuration:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Response Format

Same JSON envelope. Same error codes and HTTP status mapping.

**CRITICAL:** Roonie-AI calls `GET /nowplaying` from the Stream PC. The response schema MUST NOT change.

---

## K) Discogs Metadata Enrichment

**NEW FEATURE** (not in v2). Now feasible because prolink-connect provides structured metadata.

### Proposed Implementation

```typescript
// discogs.ts
import Disconnect from 'disconnect'; // npm package for Discogs API

async function enrichTrack(artist: string, title: string): Promise<DiscogsMetadata | null> {
  const results = await discogs.database().search({ artist, track: title, type: 'release' });
  if (results.results.length === 0) return null;
  const release = results.results[0];
  return {
    label: release.label?.[0] ?? '',
    genre: release.genre?.[0] ?? '',
    year: release.year?.toString() ?? '',
    imageUrl: release.cover_image ?? '',
  };
}
```

### Behavior

- **Trigger:** After successful publish (non-blocking, in background).
- **Caching:** Cache by `normalizeForDedupe(line)` to avoid repeated lookups.
- **Rate limiting:** Discogs allows 60 requests/minute for authenticated, 25 for unauthenticated. Use authenticated with personal token.
- **Fallback:** If lookup fails, track publishes without enrichment (no blocking).
- **Storage:** Cache in SQLite `discogs_cache` table or in-memory LRU.
- **API exposure:** Add optional `discogs` field to `GET /nowplaying` response.

### Priority

This is a **nice-to-have** feature. It should NOT block the migration. Implement after Phase 5 if time allows.

---

## L) Architecture Diagram

See Section A for the full architecture diagram.

### Simplified Data Flow (v3)

```
Pioneer CDJs (Pro DJ Link, UDP)
    │
    ▼
prolink-connect (in Electron main process)
    ├── deviceManager → device discovery events → UI
    ├── statusEmitter → CDJ status (isOnAir, isPlaying) → publish gate
    └── db.getMetadata() → artist/title → track line
                │
                ▼
        Core Logic (TypeScript)
        Gate: isOnAir && isPlaying
        Metadata retry (350ms × 6)
        Delayed publish (configurable)
        Dedupe check
                │
                ▼
        Output Writer
        ├── overlay/nowplaying.txt (OBS reads)
        ├── overlay/nowplaying.html (OBS reads)
        ├── session tracklist (appended)
        └── trackr.db (play count)
                │
                ├──► IPC → Renderer (React UI)
                └──► Express.js → Roonie-AI
```

**Key improvement:** Single process. No IPC boundaries between backend components. No file polling. No sidecar management. No ARP probing.

---

## M) Frontend Component Inventory

**IDENTICAL to v2.** The React components carry over with minimal changes.

### Changes Required

1. **Replace Tauri imports:**

```typescript
// BEFORE (Tauri)
import { open } from '@tauri-apps/plugin-dialog';
const selected = await open({ directory: true, title: 'Choose output directory' });

// AFTER (Electron)
const selected = await window.electronAPI.openDirectoryDialog('Choose output directory');
```

2. **Replace HTTP bridge with IPC bridge:**

```typescript
// BEFORE (trackr-http-core.ts)
const response = await fetch(`${apiBaseUrl}/status`);

// AFTER (trackr-ipc-core.ts or modified trackr-http-core.ts)
const response = await window.electronAPI.invoke('get-status');
```

**Option:** Keep the HTTP bridge as-is (the Express API runs locally anyway). This minimizes frontend changes — the React code just talks to `http://127.0.0.1:8755` like it does today.

**Recommended approach:** Keep the HTTP bridge for now. Replace only the Tauri-specific APIs (dialog, updater, relaunch) with Electron IPC equivalents. This minimizes risk and frontend changes.

3. **Replace updater:**

```typescript
// BEFORE (Tauri)
import { check } from '@tauri-apps/plugin-updater';
const update = await check();

// AFTER (Electron)
const updateAvailable = await window.electronAPI.invoke('check-for-update');
window.electronAPI.on('update-progress', (event, progress) => { ... });
```

4. **Preload script** (`preload/index.ts`):

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  openDirectoryDialog: (title: string) => ipcRenderer.invoke('dialog:open-directory', title),
});
```

### Design Tokens

**IDENTICAL.** Same color palette, typography, animations. The dark studio-hardware aesthetic is framework-agnostic.

### Unwired Features (Now Wireable)

| Feature | v2 Status | v3 Status |
|---------|-----------|-----------|
| Start in system tray | Unwired (no Tauri tray) | Wire via `Tray` class |
| Start with Windows | Unwired (no registry) | Wire via `app.setLoginItemSettings()` |

---

## N) Configuration Reference

**IDENTICAL settings to v2.** Same names, types, and defaults.

### Storage Change

| v2 | v3 |
|----|-----|
| `~/.trackr_config.json` (manual) | `electron-store` (automatic, in `%APPDATA%/trackr/config.json`) |

`electron-store` handles atomic writes, schema validation, and migration.

---

## O) Behavioral Differences: prolink-connect vs beat-link

### Known Differences to Watch

| Behavior | beat-link (Java) | prolink-connect (TS) | Action |
|----------|-----------------|---------------------|--------|
| Device ID range | 1-6 | 1-6 | Same |
| Virtual CDJ ID | Auto-assigned | Configurable (use 5) | Set explicitly |
| Metadata timing | Immediate from cache | May need async `getMetadata()` | Retry with same 350ms cadence |
| On-air detection | Via DJM mixer status | Via DJM mixer status | Same |
| rekordbox conflict | Warns "close rekordbox" | May conflict similarly | Document in UI |
| Firmware compat | beat-link 8.0.0 known-good | prolink-connect actively maintained | Test in Phase 0 |
| Mixer standby | DJM detected while on | Verify DJM-A9 detection | Test in Phase 0 |

### Phase 0 Validation Checklist

Before proceeding with migration, confirm prolink-connect:

- [ ] Detects all 4 CDJ-3000s by name and device number
- [ ] Detects DJM-A9 mixer
- [ ] Resolves track metadata (artist, title) when a track is loaded
- [ ] Reports `isOnAir` correctly when fader is up on DJM-A9
- [ ] Reports `playState === Playing` when CDJ is playing
- [ ] Reports `playState !== Playing` when CDJ is paused/stopped
- [ ] Tracks device connect/disconnect (power cycle CDJs)
- [ ] Works with USB-loaded tracks (not just rekordbox link)
- [ ] Does not interfere with CDJ performance or functionality

**If any of these fail, DO NOT proceed. The current architecture works.**

---

## P) System Tray and Window Management (NEW)

### Tray Implementation

```typescript
// tray.ts
import { Tray, Menu, nativeImage } from 'electron';

const tray = new Tray(nativeImage.createFromPath('icon.ico'));
tray.setContextMenu(Menu.buildFromTemplate([
  { label: 'Show/Hide', click: () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() },
  { type: 'separator' },
  { label: 'New Session', click: () => refresh() },
  { label: 'Start/Stop', click: () => isRunning ? stop() : start() },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() },
]));
```

### Tray Icon States

| State | Icon | Color |
|-------|------|-------|
| Running | Filled circle | Green |
| Stopped | Hollow circle | Red |
| Starting | Pulsing circle | Amber |

### Window Management

- Remember position/size via `electron-store`.
- Minimize to tray (configurable).
- Close to tray vs quit (configurable).
- Single instance lock (`app.requestSingleInstanceLock()`).

### Auto-Start

```typescript
app.setLoginItemSettings({
  openAtLogin: store.get('startWithWindows', false),
  args: store.get('startInTray', false) ? ['--tray'] : [],
});
```

---

## Q) Build Pipeline (Target)

### electron-builder Configuration

```javascript
// electron-builder config in package.json
{
  "build": {
    "appId": "com.clandestine.trackr",
    "productName": "TRACKR",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true
    },
    "publish": {
      "provider": "github",
      "owner": "cland3stine",
      "repo": "TRACKR"
    }
  }
}
```

### Build Command

```bash
npm run build        # Build renderer (Vite) + main (tsc/esbuild)
npx electron-builder # Package NSIS installer
```

### What's Eliminated

- PyInstaller (no Python)
- jpackage (no Java)
- `build.ps1` (replaced by npm scripts + electron-builder)
- Signing key management (electron-builder handles code signing)
- Sidecar binary management

### Auto-Updater

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'cland3stine',
  repo: 'TRACKR',
});

autoUpdater.checkForUpdatesAndNotify();
```

---

## R) Migration Mapping Summary

| Current (v2) | Target (v3) | Notes |
|-------------|-------------|-------|
| Tauri 2 shell | Electron | Window management, IPC |
| Rust `lib.rs` (87 lines) | Electron main `index.ts` | Simpler, no Rust |
| Python `core.py` (1000+ lines) | TypeScript `prolink.ts` + `core.ts` | Rewrite in TS |
| Python `api.py` (147 lines) | TypeScript `api.ts` (Express) | Same routes |
| Python `config.py` | `electron-store` + `store.ts` | Simpler persistence |
| Python `writer.py` | TypeScript `output.ts` | Same file I/O |
| Python `session.py` | TypeScript `session.ts` | Same rules |
| Python `text_cleaner.py` | TypeScript `cleaner.ts` | Same regexes |
| Python `template.py` | TypeScript `template.ts` | Same behavior |
| Python `db.py` (SQLite) | `better-sqlite3` | Same schema |
| Python `device_bridge.py` | prolink-connect | Major simplification |
| Python `beatlink_bridge.py` | Eliminated | prolink-connect replaces |
| Python `simulated_source.py` | TypeScript test harness | Port for testing |
| Java `NowPlayingService.java` | prolink-connect | Eliminated |
| Java `FileWriterUtil.java` | TypeScript `output.ts` | Eliminated |
| Java `TextCleaner.java` | TypeScript `cleaner.ts` | Eliminated |
| Java `App.java` (Swing) | Eliminated | Electron handles UI |
| Java `StartupUtil.java` | `app.setLoginItemSettings()` | Simpler |
| `build.ps1` (128 lines) | `npm run build` | Simpler |
| `trackr-backend.spec` (PyInstaller) | Eliminated | No Python to freeze |
| `build.gradle` (Java) | Eliminated | No Java to build |
| `tauri.conf.json` | `electron-builder` config | Different format |
| Tauri capabilities JSON | Electron no sandbox config | Different model |
| minisign signing | electron-builder code signing | Different tooling |
| WebView2 runtime dependency | Chromium bundled | Larger binary, no runtime dep |

---

## S) Risk Assessment

### Low Risk

- React frontend port (99% unchanged, only Tauri API calls replaced)
- Track cleaning (pure regex, direct port)
- Session tracklist (pure logic, direct port)
- Output file writing (simple `fs` operations)
- REST API (Express is well-understood)
- Settings persistence (electron-store is mature)

### Medium Risk

- prolink-connect hardware compatibility (mitigated by Phase 0)
- Metadata resolution timing differences (mitigated by same retry strategy)
- Database migration (SQLite schema is trivial, but test recovery)
- Auto-updater change (different signing/distribution model)

### High Risk

- **prolink-connect doesn't work with CDJ-3000s + DJM-A9** — This is the make-or-break. Phase 0 exists specifically to validate this before any code is written.
- **Installer size increase** — Electron bundles Chromium (~120MB vs ~30MB Tauri). Acceptable tradeoff for architecture simplification.

### Rollback Plan

If prolink-connect fails Phase 0 validation:
- Do NOT proceed with migration.
- Current Tauri + Python + Java architecture works and is proven.
- Tag current state as `pre-electron-investigation`.
- Document what failed for future reference.
