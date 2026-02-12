# TRACKR Rewrite Phases

## Phase 1: Canonical Contract Lock
- [ ] Finalize `SPEC_TRACKR_CANONICAL.md`.
- [ ] Finalize `UI_WIRING_CONTRACT.md`.
- [ ] Freeze output contract and forbidden outputs.
- Exit criteria: no open ambiguity on files, publish gates, dedupe, refresh semantics, API mode behavior.

## Phase 2: Project Scaffold (Python)
- [ ] Create Python package layout under `python/trackr`.
- [ ] Define config model and defaults (`%USERPROFILE%\\NowPlayingLite` output root).
- [ ] Define state/event model used by UI wiring layer.
- Exit criteria: executable skeleton with start/stop no-op flow and status reporting.

## Phase 3: Output Writer Engine
- [ ] Implement `overlay/nowplaying.txt` writer (UTF-8, CRLF, trailing newline, 2-line fallback `—`).
- [ ] Implement `overlay/nowplaying.html` template load/save/reset flow.
- [ ] Implement session file naming `YYYY-MM-DD(N)-tracklist.txt`.
- [ ] Implement append-only session writes.
- Exit criteria: file outputs match canonical contract; forbidden files are never created.

## Phase 4: Publish Pipeline Parity
- [ ] Implement publish gating: `isOnAir && isPlaying`.
- [ ] Implement metadata retries at ~350 ms cadence with bounded attempts.
- [ ] Implement delayed publish queue keyed by `deck|line`.
- [ ] Implement line-level publish dedupe and session dedupe.
- [ ] Preserve legacy-known issue note in docs/tests as behavior parity marker.
- Exit criteria: controlled replay tests confirm publish timing/dedupe behavior.

## Phase 5: Session Timeline and Refresh Semantics
- [ ] Implement timestamp baseline anchoring (first track `00:00`).
- [ ] Ensure refresh does Stop->Start and always creates new session file index.
- [ ] Reset session dedupe and baseline on refresh.
- Exit criteria: refresh integration test proves new file + `00:00` first line.

## Phase 6: Play Count Database
- [ ] Add SQLite DB at `%USERPROFILE%\\NowPlayingLite\\trackr.db`.
- [ ] Add play count increment after successful overlay txt write only.
- [ ] Expose play count to running tracklist model only.
- Exit criteria: DB survives restarts; counts increment exactly once per successful publish.

## Phase 7: API Service
- [ ] Implement API enable toggle.
- [ ] Implement bind mode toggle: localhost (`127.0.0.1`) vs LAN (`0.0.0.0`).
- [ ] Implement share-play-count toggle gate on API responses.
- [ ] Verify LAN accessibility from another machine when LAN mode is active.
- Exit criteria: API contract tests + manual LAN smoke test pass.

## Phase 8: UI-Core Wiring
- [ ] Implement wiring layer methods from `UI_WIRING_CONTRACT.md`.
- [ ] Connect UI actions to start/stop/refresh/template methods.
- [ ] Implement status snapshot and event subscription bridge.
- Exit criteria: dashboard controls operate core correctly without UI redesign.

## Phase 9: Test Hardening
- [ ] Add unit tests for dedupe, session naming, timestamp baseline, play count gate.
- [ ] Add integration tests for start/stop/refresh and file outputs.
- [ ] Add API tests for bind mode and play-count sharing toggle.
- Exit criteria: stable repeatable test suite under `tests/`.

## Phase 10: Packaging and Release
- [ ] Create distributable packaging plan (runtime, config path, logs).
- [ ] Add startup scripts/service wrappers for Windows target.
- [ ] Document install, upgrade, rollback path.
- Exit criteria: packaged build runs on clean machine and satisfies canonical spec.
