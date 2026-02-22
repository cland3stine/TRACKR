# TRACKR Electron Migration Checklist

> **Date:** 2026-02-22
> **From:** Tauri 2 + Python 3.12 + Java sidecar (beat-link)
> **To:** Electron + prolink-connect (TypeScript)
> **Reference:** TRACKR-SPEC-v2-CURRENT-STATE.md (what we have), TRACKR-SPEC-v3-ELECTRON-TARGET.md (what we're building)

---

## PHASE 0: Pre-Migration Validation (DO THIS FIRST)

**Purpose:** Confirm prolink-connect works with Art's exact hardware before writing a single line of migration code.

- [ ] Create minimal test project
  - [ ] `mkdir trackr-prolink-test && cd trackr-prolink-test`
  - [ ] `npm init -y && npm install prolink-connect typescript ts-node @types/node`
  - [ ] Create `test.ts` with minimal prolink-connect script

- [ ] Test device discovery
  - [ ] Run `bringOnline()` → `autoconfigFromPeers()`
  - [ ] Confirm all 4 CDJ-3000s detected with correct model names (`"CDJ-3000"`)
  - [ ] Confirm DJM-A9 mixer detected
  - [ ] Confirm device numbers match physical deck positions
  - [ ] Log device connect/disconnect events

- [ ] Test metadata resolution
  - [ ] Load a track on CDJ (USB, not rekordbox link)
  - [ ] Call `network.db.getMetadata()` with track info from status
  - [ ] Confirm artist and title resolve correctly
  - [ ] Test with rekordbox-linked tracks if available

- [ ] Test transport status
  - [ ] Confirm `isOnAir` reflects DJM-A9 fader position (up = true, down = false)
  - [ ] Confirm `playState === PlayState.Playing` when CDJ is playing
  - [ ] Confirm `playState !== PlayState.Playing` when CDJ is paused/cued/stopped
  - [ ] Test fader-based track change detection

- [ ] Test stability
  - [ ] Run for 10+ minutes while mixing
  - [ ] Power cycle one CDJ → confirm device lost/found events
  - [ ] Verify no impact on CDJ performance or display
  - [ ] Verify no interference with DJM-A9 functionality

- [ ] **DECISION GATE**
  - [ ] All tests pass → proceed to Phase 1
  - [ ] Any test fails → STOP. Document failure. Keep current architecture.
  - [ ] Edge cases found → document in KNOWN-ISSUES.md, assess if blocking

---

## PHASE 1: Electron Scaffolding

**Purpose:** Empty Electron app that launches, shows a window, and builds an NSIS installer.

- [ ] Initialize project
  - [ ] Create `trackr-electron/` directory (or repurpose existing repo)
  - [ ] `npm init -y`
  - [ ] Install Electron: `npm install electron --save-dev`
  - [ ] Install electron-builder: `npm install electron-builder --save-dev`
  - [ ] Install TypeScript tooling: `npm install typescript ts-loader @types/node --save-dev`

- [ ] Configure project structure
  ```
  trackr-electron/
  ├── src/
  │   ├── main/           # Electron main process
  │   │   └── index.ts    # App entry, window management
  │   ├── renderer/       # React frontend (copy from current)
  │   │   ├── src/        # React components
  │   │   ├── index.html
  │   │   └── vite.config.ts
  │   └── preload/
  │       └── index.ts    # contextBridge IPC
  ├── package.json
  ├── tsconfig.main.json  # Main process TS config
  ├── tsconfig.renderer.json  # Renderer TS config
  └── electron-builder.yml
  ```

- [ ] Configure TypeScript
  - [ ] `tsconfig.main.json` — target ES2022, module commonjs, strict
  - [ ] `tsconfig.renderer.json` — target ES2020, module ESNext, JSX react-jsx

- [ ] Create minimal `src/main/index.ts`
  - [ ] `app.whenReady()` → create BrowserWindow (1200×900, min 1200×900)
  - [ ] Load renderer HTML
  - [ ] `app.requestSingleInstanceLock()` for single instance
  - [ ] Handle `window-all-closed` → `app.quit()` on Windows

- [ ] Create minimal `src/preload/index.ts`
  - [ ] `contextBridge.exposeInMainWorld('electronAPI', { ... })`
  - [ ] Stub IPC methods

- [ ] Configure electron-builder
  - [ ] App ID: `com.clandestine.trackr`
  - [ ] Product name: `TRACKR`
  - [ ] NSIS target for Windows
  - [ ] Per-user install (no admin)
  - [ ] Icon: `assets/icon.ico`

- [ ] Verify
  - [ ] `npm start` → blank Electron window opens
  - [ ] `npx electron-builder` → NSIS installer produced
  - [ ] Install from NSIS → app launches

---

## PHASE 2: Pro DJ Link Integration (prolink-connect)

**Purpose:** Electron app discovers CDJs and logs status/metadata. No publishing yet.

- [ ] Install prolink-connect: `npm install prolink-connect`

- [ ] Create `src/main/prolink.ts`
  - [ ] `startProlink()` function
    - [ ] Call `bringOnline({ virtualCdjId: 5 })`
    - [ ] Call `autoconfigFromPeers()`
    - [ ] Call `network.connect()`
    - [ ] Return network instance
  - [ ] `stopProlink()` function
    - [ ] Call `network.disconnect()`
    - [ ] Clean up listeners
  - [ ] Device discovery events
    - [ ] `network.deviceManager.on('connected', ...)` → forward to renderer via IPC
    - [ ] `network.deviceManager.on('disconnected', ...)` → forward to renderer
    - [ ] Track device count, build summaries `[{name, count}]`
  - [ ] CDJ status monitoring
    - [ ] `network.statusEmitter.on('status', ...)` → filter for `isOnAir && isPlaying`
    - [ ] Log status changes for debugging
  - [ ] Metadata resolution
    - [ ] `network.db.getMetadata()` with track info from status
    - [ ] Handle async resolution, null returns

- [ ] Implement publish trigger logic (from v2 spec Section B, steps 10-17)
  - [ ] Gate 1: `isOnAir && isPlaying`
  - [ ] Gate 2: Metadata resolved (retry 350ms × 6 attempts)
  - [ ] Schedule delayed publish (`setTimeout`, configurable delay)
  - [ ] Pending key: `${deviceId}|${normalizedLine}`
  - [ ] Cancel old timer on new pending key
  - [ ] Gate 3: Dedupe against `lastPublished`

- [ ] Wire IPC handlers for renderer
  - [ ] `ipcMain.handle('prolink:get-device-count', ...)`
  - [ ] `ipcMain.handle('prolink:get-device-summaries', ...)`
  - [ ] Forward events via `mainWindow.webContents.send('trackr:event', ...)`

- [ ] Test live with CDJ-3000s
  - [ ] Verify device discovery (device names, count tracking)
  - [ ] Verify status events fire on play/pause/fader
  - [ ] Verify metadata resolves (artist, title)
  - [ ] Verify publish trigger logic gates correctly

---

## PHASE 3: Core Business Logic (Port from Python)

**Purpose:** Port all Python business logic to TypeScript modules.

### 3A: Track Text Cleaner

- [ ] Create `src/main/cleaner.ts`
  - [ ] Port exact regex patterns from `python/trackr/text_cleaner.py`:
    - [ ] `_CAMELOT` → Camelot key removal
    - [ ] `_BRACKET_TAGS` → Square bracket removal
    - [ ] `_DASHES` → Dash normalization (hyphen, en-dash, em-dash → `" - "`)
    - [ ] `_MIX_LABELS` → Mix label removal (Original Mix, Extended Mix)
    - [ ] `_WHITESPACE` → Whitespace collapse
    - [ ] `_TRAILING_DASH`, `_LEADING_DASH` → Trailing/leading dash removal
    - [ ] `_TIMESTAMP_PREFIX` → Timestamp prefix removal (for dedupe)
  - [ ] `cleanTrackLine(line, stripMixLabels = true)` — exact transform order from spec Section D
  - [ ] `normalizeForDedupe(line)` — clean + remove timestamp + lowercase + trim
  - [ ] `EM_DASH = '\u2014'` constant
- [ ] Write tests matching ALL existing Python test cases from `tests/test_text_cleaner.py`

### 3B: Output Writer

- [ ] Create `src/main/output.ts`
  - [ ] `writeOverlayNowplaying(outputRoot, current, previous)` — 2-line CRLF UTF-8
    - [ ] Line 1: current track (or `—`)
    - [ ] Line 2: previous track (or `—`)
    - [ ] Trailing CRLF newline
    - [ ] Direct write (`fs.writeFileSync` with `{encoding: 'utf8'}`)
  - [ ] `ensureOverlayExists(outputRoot)` — create `overlay/` dir, init file with `—\r\n—\r\n`
  - [ ] `writeTemplateFile(outputRoot, html)` — write `overlay/nowplaying.html`
  - [ ] Track `previousLine` state for 2-line rotation
- [ ] Write tests matching `tests/test_writer.py`

### 3C: Session Tracklist

- [ ] Create `src/main/session.ts`
  - [ ] `chooseNextSessionPath(outputRoot, date)` → `YYYY-MM-DD(N)-tracklist.txt`
    - [ ] N starts at 1, increment if file exists
    - [ ] Create output dir if needed
  - [ ] `SessionTracker` class
    - [ ] `startNewSession(date)` → choose file, seed seen-set, return path
    - [ ] `append(line, publishedAt)` → dedupe, format, append to file
      - [ ] Dedupe: `normalizeForDedupe(line)`, case-insensitive seen-set
      - [ ] Skip if blank
      - [ ] Timestamp format: `MM:SS` or `H:MM:SS`
      - [ ] First track always `00:00`
      - [ ] Elapsed = `publishedAt - sessionStart - delaySeconds`
      - [ ] Append with LF line endings (not CRLF)
    - [ ] `getRunningEntries()` → list of `{time, line}` for UI
    - [ ] `primeSeen()` — seed from existing file (crash recovery)
  - [ ] `formatElapsed(seconds)` → `"MM:SS"` or `"H:MM:SS"`
- [ ] Write tests matching `tests/test_session.py`

### 3D: Settings Persistence

- [ ] Install electron-store: `npm install electron-store`
- [ ] Create `src/main/store.ts`
  - [ ] Schema with all settings from v2 spec Section N:
    ```typescript
    const schema = {
      output_root: { type: 'string', default: '' },
      migration_prompt_seen: { type: 'boolean', default: false },
      delay_seconds: { type: 'number', default: 3 },
      timestamps_enabled: { type: 'boolean', default: true },
      strip_mix_labels: { type: 'boolean', default: true },
      api_enabled: { type: 'boolean', default: true },
      api_access_mode: { type: 'string', default: 'lan' },
      share_play_count_via_api: { type: 'boolean', default: false },
      api_port: { type: 'number', default: 8755 },
    };
    ```
  - [ ] Migration logic: detect `~/.trackr_config.json` and import settings
  - [ ] `getConfig()` / `setConfig(partial)` / `getDefault(key)`

### 3E: Database (Play Count + Template)

- [ ] Install better-sqlite3: `npm install better-sqlite3`
- [ ] Create `src/main/database.ts`
  - [ ] Same schema as Python `db.py`:
    ```sql
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO counters (name, value) VALUES ('play_count', 0);
    ```
  - [ ] `getPlayCount()` → integer
  - [ ] `incrementPlayCount()` → new integer
  - [ ] `getPref(key)` → string | null
  - [ ] `setPref(key, value)` → void
  - [ ] `close()` → void

### 3F: Template Store

- [ ] Create `src/main/template.ts`
  - [ ] `TemplateStore` class
    - [ ] `getTemplate()` → saved HTML or default
    - [ ] `setTemplate(html)` → validate non-empty, persist to DB, write file
    - [ ] `resetTemplate()` → restore default, persist, write file
    - [ ] `ensureTemplateFile()` → write to disk on startup
  - [ ] Default template: port exact HTML from Python `template.py`
    - [ ] Transparent background
    - [ ] Polls `nowplaying.txt` every 750ms
    - [ ] `#current` (white, 36px) + `#previous` (gray, 24px)

---

## PHASE 4: REST API (for Roonie-AI)

**Purpose:** Identical REST API on same port, same paths, same response shapes.

- [ ] Install Express: `npm install express @types/express`

- [ ] Create `src/main/api.ts`
  - [ ] Initialize Express app
  - [ ] CORS middleware: `Access-Control-Allow-Origin: *`
  - [ ] JSON body parser middleware
  - [ ] Port every endpoint from v2 spec Section J:

| Method | Path | Handler |
|--------|------|---------|
| GET | `/health` | `{ ok: true, is_running: boolean }` |
| GET | `/nowplaying` | Current/previous track, device count, optional play count |
| GET | `/status` | Full status snapshot |
| POST | `/control/start` | Start processing |
| POST | `/control/stop` | Stop processing |
| POST | `/control/refresh` | New session |
| GET | `/config` | Current config |
| POST | `/config` | Update config |
| GET | `/template` | Current template |
| POST | `/template` | Save template |
| POST | `/template/reset` | Reset template |
| GET | `/output-root/resolve` | Migration status |
| POST | `/output-root/choose` | Migration choice |

  - [ ] Same error response format: `{ ok: false, error: { code, message } }`
  - [ ] Same HTTP status codes (400, 404, 409, 500)
  - [ ] Configurable bind host: `127.0.0.1` (localhost) or `0.0.0.0` (LAN)
  - [ ] Configurable port (default 8755)
  - [ ] Enable/disable toggle

- [ ] Test Roonie-AI integration
  - [ ] Start TRACKR, verify `GET /nowplaying` returns expected JSON
  - [ ] Verify from Stream PC (LAN mode) — same IP/port reachable

---

## PHASE 5: Discogs Metadata Enrichment (OPTIONAL)

**Purpose:** Add Discogs lookup for label/genre/year. Non-blocking, nice-to-have.

- [ ] Create `src/main/discogs.ts`
  - [ ] Install Discogs client: `npm install disconnect` (or direct REST)
  - [ ] `enrichTrack(artist, title)` → `{ label, genre, year, imageUrl } | null`
  - [ ] Rate limiting: max 25 req/min unauthenticated, 60 authenticated
  - [ ] In-memory LRU cache keyed by `normalizeForDedupe(line)`
  - [ ] Non-blocking: enrich after publish, update cache, notify UI
  - [ ] Fallback: publish proceeds without enrichment if lookup fails

- [ ] Wire into publish pipeline
  - [ ] After successful publish → fire async enrichment
  - [ ] On enrichment complete → emit event to renderer
  - [ ] Optionally include in `GET /nowplaying` response

**Skip this phase if it delays the migration. Can be added post-v1.0.**

---

## PHASE 6: Port React Frontend

**Purpose:** Move existing React code into Electron renderer with minimal changes.

- [ ] Copy React source
  - [ ] Copy `ui/trackr-ui/src/` → `src/renderer/src/`
  - [ ] Copy `ui/trackr-ui/index.html` → `src/renderer/index.html`
  - [ ] Copy `ui/trackr-ui/vite.config.ts` (adjust for Electron)
  - [ ] Copy `ui/trackr-ui/tsconfig.json`

- [ ] Install frontend deps
  - [ ] `npm install react react-dom` (already in main package.json)
  - [ ] `npm install -D @vitejs/plugin-react vite`
  - [ ] Remove all `@tauri-apps/*` packages

- [ ] Replace Tauri API calls
  - [ ] `@tauri-apps/plugin-dialog` → Electron IPC:
    ```typescript
    // Before:
    import { open } from '@tauri-apps/plugin-dialog';
    const selected = await open({ directory: true });
    // After:
    const selected = await window.electronAPI.openDirectoryDialog('Choose output directory');
    ```
  - [ ] `@tauri-apps/plugin-updater` → Electron IPC:
    ```typescript
    // Before:
    import { check } from '@tauri-apps/plugin-updater';
    // After:
    await window.electronAPI.invoke('check-for-update');
    window.electronAPI.on('update-status', callback);
    ```
  - [ ] `@tauri-apps/plugin-process` → Electron IPC:
    ```typescript
    // Before:
    import { relaunch } from '@tauri-apps/plugin-process';
    // After:
    await window.electronAPI.invoke('app:relaunch');
    ```

- [ ] **Decision: Keep HTTP bridge or switch to IPC?**
  - [ ] **Recommended:** Keep `trackr-http-core.ts` pointing at `http://127.0.0.1:8755`
    - Minimizes frontend changes
    - Express API runs anyway (Roonie needs it)
    - Only replace Tauri-specific calls (dialog, updater, relaunch)
  - [ ] Alternative: Replace all HTTP calls with IPC (more changes, tighter coupling)

- [ ] Update `App.tsx`
  - [ ] Remove Tauri-specific initialization
  - [ ] Keep health poll logic (HTTP to 127.0.0.1:8755)
  - [ ] Update backend status indicator

- [ ] Update `index.html`
  - [ ] Title: `"TRACKR"`
  - [ ] Add preload script reference

- [ ] Verify
  - [ ] All components render correctly
  - [ ] Start/Stop/Refresh work
  - [ ] Settings panel functional
  - [ ] Template editor works
  - [ ] Tracklist display updates
  - [ ] Splash screen shows and fades
  - [ ] Design tokens preserved (dark studio-hardware aesthetic)
  - [ ] JetBrains Mono font loads

---

## PHASE 7: System Integration

**Purpose:** Tray, startup, window management — the features that were unwired in v2.

### 7A: System Tray

- [ ] Create `src/main/tray.ts`
  - [ ] Create `Tray` with app icon
  - [ ] Context menu:
    - [ ] Show/Hide window
    - [ ] Separator
    - [ ] New Session
    - [ ] Start/Stop toggle
    - [ ] Separator
    - [ ] Quit
  - [ ] Click tray icon → toggle window visibility
  - [ ] Tray icon state:
    - [ ] Green = running
    - [ ] Red = stopped
    - [ ] Amber = starting/stopping
  - [ ] Create icon variants (or tint dynamically)

### 7B: Window Management

- [ ] Remember window position/size
  - [ ] Save to electron-store on `resize` and `move` events (debounced)
  - [ ] Restore on app launch
- [ ] Minimize to tray (configurable)
  - [ ] On minimize: hide window, show tray notification first time
- [ ] Close behavior (configurable)
  - [ ] Close to tray vs quit application
  - [ ] Quit confirmation if tracks are publishing

### 7C: Auto-Start with Windows

- [ ] Wire `app.setLoginItemSettings()`
  ```typescript
  app.setLoginItemSettings({
    openAtLogin: store.get('startWithWindows', false),
    args: store.get('startInTray', false) ? ['--hidden'] : [],
  });
  ```
- [ ] Handle `--hidden` CLI arg → start with window hidden, tray only
- [ ] Wire Settings UI toggles to these functions

### 7D: Auto-Start Pro DJ Link on Launch

- [ ] Add `auto_start` setting (default: false)
- [ ] If enabled: call `startProlink()` automatically after app ready
- [ ] Show splash screen during connection

---

## PHASE 8: Testing & Validation

**Purpose:** Comprehensive testing before release.

### 8A: Unit Tests

- [ ] Install test framework: `npm install -D vitest @vitest/coverage-v8`

- [ ] Port text cleaner tests from `tests/test_text_cleaner.py`
  - [ ] All 30+ test cases with identical inputs and expected outputs
  - [ ] Camelot removal (bare, bracketed, parenthesized)
  - [ ] Bracket tag removal
  - [ ] Dash normalization (en-dash, em-dash, double dash)
  - [ ] Mix label stripping (Original Mix, Extended Mix preserved; Remix not stripped)
  - [ ] Whitespace collapse
  - [ ] Dedupe normalization

- [ ] Port session tests from `tests/test_session.py`
  - [ ] Session filename selection (date-based, increment)
  - [ ] Timestamp formatting (MM:SS, H:MM:SS)
  - [ ] Session dedupe behavior
  - [ ] Seen-set seeding from existing file

- [ ] Port output writer tests from `tests/test_writer.py`
  - [ ] 2-line CRLF format verification
  - [ ] Em-dash fallback
  - [ ] Previous line rotation

- [ ] Port config tests from `tests/test_config.py`
  - [ ] Config load/save
  - [ ] Output root resolution
  - [ ] Migration logic

- [ ] Port API tests from `tests/test_api.py`
  - [ ] All endpoint responses
  - [ ] CORS headers
  - [ ] Error responses (400, 404, 409, 500)

- [ ] Port core tests from `tests/test_core.py`
  - [ ] State machine transitions
  - [ ] Publish pipeline (gate, delay, dedupe)

- [ ] New tests for Electron-specific functionality
  - [ ] IPC handlers
  - [ ] electron-store schema
  - [ ] better-sqlite3 operations

### 8B: Live Hardware Testing

- [ ] **Device Detection**
  - [ ] Start app → verify CDJ-3000s detected with correct names
  - [ ] Verify device count updates in real-time
  - [ ] Verify DJM-A9 detected
  - [ ] Power cycle CDJs one by one → count tracks correctly (3→2→1→0→1→2→3)

- [ ] **Track Publishing**
  - [ ] Load track on CDJ, push fader up → verify publish after delay
  - [ ] Verify `overlay/nowplaying.txt` written correctly (2 lines, CRLF)
  - [ ] Verify `overlay/nowplaying.html` exists and is readable
  - [ ] Open OBS browser source → verify overlay displays correctly
  - [ ] Pull fader down, push different fader up → verify new track publishes
  - [ ] Play same track on different CDJ → verify dedupe (no duplicate publish)

- [ ] **Session Tracklist**
  - [ ] Verify tracklist file created with correct name
  - [ ] Verify timestamps (if enabled): first track = `00:00`
  - [ ] Verify dedupe: same track not appended twice
  - [ ] Click Refresh → new session file created
  - [ ] Verify new file has `00:00` for first track (baseline reset)

- [ ] **API Integration**
  - [ ] From Stream PC: `curl http://<LAN_IP>:8755/nowplaying` → correct JSON
  - [ ] Verify Roonie-AI can read `/nowplaying` endpoint
  - [ ] Test localhost vs LAN mode toggle

- [ ] **System Integration**
  - [ ] Tray icon shows, context menu works
  - [ ] Start in tray: app launches hidden, tray icon visible
  - [ ] Start with Windows: verify shortcut created, works after reboot
  - [ ] Minimize to tray: window hides, tray click restores

- [ ] **Extended Mix Test**
  - [ ] Run 30+ minute simulated set
  - [ ] Verify no memory leaks (Task Manager)
  - [ ] Verify no publish drops or duplicate publishes
  - [ ] Verify tracklist file grows correctly
  - [ ] Verify play count increments correctly

---

## PHASE 9: Build & Package

**Purpose:** Production-ready installer.

- [ ] Configure electron-builder for production
  - [ ] NSIS installer (Windows)
  - [ ] App icon, metadata, version `1.0.0`
  - [ ] Per-user install (no admin required)
  - [ ] Desktop shortcut option
  - [ ] Start menu entry

- [ ] Configure auto-updater
  - [ ] GitHub Releases as update source
  - [ ] `electron-updater` integration
  - [ ] Verify update check → download → install → relaunch flow

- [ ] Build installer
  - [ ] `npm run build && npx electron-builder`
  - [ ] Verify NSIS installer produced
  - [ ] Note installer size (expect ~120-150MB with Chromium)

- [ ] Smoke test from installed version
  - [ ] Install on clean-ish environment (not dev machine if possible)
  - [ ] Launch app → verify splash → dashboard
  - [ ] Start → verify CDJ detection → track publish → overlay output
  - [ ] Verify all settings persist across restart
  - [ ] Verify tray, startup options
  - [ ] Uninstall → verify clean removal

---

## PHASE 10: Cleanup & Documentation

**Purpose:** Close out the migration.

- [ ] Tag pre-migration codebase
  - [ ] `git tag pre-electron-migration`
  - [ ] Push tag to remote

- [ ] Clean up old code
  - [ ] Remove `python/` directory (or archive)
  - [ ] Remove `src/main/java/` directory (or archive)
  - [ ] Remove `build.gradle`, `settings.gradle`, `gradlew*`
  - [ ] Remove `trackr-backend.spec`
  - [ ] Remove `build.ps1` (replaced by npm scripts)
  - [ ] Remove `build/jpackage/` directory
  - [ ] Remove `ui/trackr-ui/src-tauri/` directory
  - [ ] Update `.gitignore` for Electron project structure

- [ ] Update documentation
  - [ ] Update repo `README.md`
  - [ ] Update `CLAUDE.md` with new architecture
  - [ ] Update Obsidian vault files with migration completion

- [ ] Update specs
  - [ ] Mark v2 spec as "Historical — Pre-Electron"
  - [ ] Update v3 spec with any behavioral differences discovered during testing
  - [ ] Create `KNOWN-ISSUES.md` for any hardware-specific quirks

- [ ] Update auto-memory
  - [ ] Update `MEMORY.md` with new paths, commands, architecture

- [ ] Final commit
  - [ ] Conventional commit: `feat: migrate TRACKR to Electron + prolink-connect (v1.0.0)`

---

## Rollback Plan

If prolink-connect fails to work reliably with CDJ-3000s + DJM-A9 during **any** phase:

1. **Phase 0 failure:** Do not proceed. Zero migration code written. No impact.
2. **Phase 1-5 failure:** Discard `trackr-electron/` directory. Current app unaffected.
3. **Phase 6-9 failure:** Git revert to `pre-electron-migration` tag. Rebuild current app.

The current Tauri + Python + Java sidecar architecture is proven and works. It remains the fallback at all times until Phase 10 cleanup removes old code.

---

## Dependency Inventory (Target)

### Runtime Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `electron` | App shell | Dev dependency for electron-builder |
| `prolink-connect` | Pro DJ Link protocol | Core CDJ integration |
| `express` | REST API server | For Roonie-AI |
| `better-sqlite3` | Database | Play count + prefs |
| `electron-store` | Settings persistence | Config storage |
| `electron-updater` | Auto-updates | GitHub Releases |
| `react` | UI framework | Existing |
| `react-dom` | React DOM | Existing |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `electron-builder` | Packaging (NSIS) |
| `typescript` | Type checking |
| `vite` | Renderer bundling |
| `@vitejs/plugin-react` | React support |
| `vitest` | Testing |
| `eslint` | Linting |

### Optional Dependencies

| Package | Purpose | Phase |
|---------|---------|-------|
| `disconnect` | Discogs API client | Phase 5 |
| `electron-log` | File-based logging | Phase 7 |

---

## Effort Estimates (Rough)

| Phase | Effort | Blocker? |
|-------|--------|----------|
| Phase 0 | 1-2 hours | **YES** — must pass before anything else |
| Phase 1 | 2-3 hours | No |
| Phase 2 | 4-6 hours | Depends on prolink-connect API ergonomics |
| Phase 3 | 6-8 hours | Straightforward port |
| Phase 4 | 2-3 hours | Straightforward port |
| Phase 5 | 2-4 hours | Optional, skip if behind |
| Phase 6 | 3-4 hours | Mostly copy-paste + minor edits |
| Phase 7 | 3-4 hours | New feature work (tray, startup) |
| Phase 8 | 4-6 hours | Live testing with hardware |
| Phase 9 | 2-3 hours | Build config + smoke test |
| Phase 10 | 1-2 hours | Cleanup |

**Total: ~30-45 hours** (excluding Phase 5 Discogs)

---

## Success Criteria

The migration is complete when:

1. [ ] All 4 CDJ-3000s detected by name and count in real-time
2. [ ] Track metadata resolves correctly (artist, title)
3. [ ] Publish pipeline works identically (gates, delay, dedupe)
4. [ ] `overlay/nowplaying.txt` output matches v2 format exactly
5. [ ] `overlay/nowplaying.html` works in OBS browser source
6. [ ] Session tracklist files match v2 format exactly
7. [ ] Play count persists in SQLite
8. [ ] REST API responds identically (Roonie-AI verified)
9. [ ] System tray works (show/hide, context menu, icon states)
10. [ ] Start with Windows works
11. [ ] NSIS installer produces working app
12. [ ] All ported tests pass
13. [ ] 30-minute live mix test passes without issues
