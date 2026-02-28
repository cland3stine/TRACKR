/**
 * TRACKR Phase 3D — Settings Store
 *
 * Port of python/trackr/config.py using electron-store@8.
 * Persists user settings in Electron's userData directory.
 * Runs one-time migration from the legacy ~/trackr_config.json on first launch.
 */

import Store from 'electron-store';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── types ───────────────────────────────────────────────────────────────────

export interface OverlayStyle {
  fontFamily:       string;
  textTransform:    'uppercase' | 'none';
  letterSpacing:    number;   // em
  fontSize:         number;   // px
  fontColor:        string;   // hex
  dropShadowOn:     boolean;
  dropShadowX:      number;   // px
  dropShadowY:      number;   // px
  dropShadowBlur:   number;   // px
  dropShadowColor:  string;   // hex
  lineGap:          number;   // px
}

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  fontFamily:       'Good Times',
  textTransform:    'uppercase',
  letterSpacing:    0.15,
  fontSize:         36,
  fontColor:        '#ffffff',
  dropShadowOn:     true,
  dropShadowX:      6,
  dropShadowY:      6,
  dropShadowBlur:   6,
  dropShadowColor:  '#000000',
  lineGap:          14,
};

export interface TrackrConfig {
  outputRoot:            string;  // '' = not set
  migrationPromptSeen:   boolean;
  delaySeconds:          number;
  timestampsEnabled:     boolean;
  stripMixLabels:        boolean;
  apiEnabled:            boolean;
  apiAccessMode:         'localhost' | 'lan';
  sharePlayCountViaApi:  boolean;
  apiPort:               number;
  startWithWindows:      boolean;
  startInTray:           boolean;
  overlayStyle:          OverlayStyle;
}

export interface OutputRootResolution {
  state:                'resolved' | 'needs_user_choice';
  outputRoot:           string | null;
  legacyRoot:           string;
  trackrRoot:           string;
  migrationPromptSeen:  boolean;
}

// ─── store definition ────────────────────────────────────────────────────────

interface StoreType {
  outputRoot:               string;
  migrationPromptSeen:      boolean;
  delaySeconds:             number;
  timestampsEnabled:        boolean;
  stripMixLabels:           boolean;
  apiEnabled:               boolean;
  apiAccessMode:            string;
  sharePlayCountViaApi:     boolean;
  apiPort:                  number;
  startWithWindows:         boolean;
  startInTray:              boolean;
  overlayStyle:             OverlayStyle;
  _migrationFromPythonDone: boolean;
}

const DEFAULTS: StoreType = {
  outputRoot:               '',
  migrationPromptSeen:      false,
  delaySeconds:             3,
  timestampsEnabled:        true,
  stripMixLabels:           true,
  apiEnabled:               true,
  apiAccessMode:            'lan',
  sharePlayCountViaApi:     false,
  apiPort:                  8755,
  startWithWindows:         false,
  startInTray:              false,
  overlayStyle:             { ...DEFAULT_OVERLAY_STYLE },
  _migrationFromPythonDone: false,
};

// Lazily initialized — must not call new Store() before app.whenReady()
let _store: Store<StoreType> | null = null;

function getStore(): Store<StoreType> {
  if (!_store) {
    _store = new Store<StoreType>({ defaults: DEFAULTS });
    _migrateFromPythonConfig(_store);
  }
  return _store;
}

/** One-time import of settings from the legacy Python ~/trackr_config.json. */
function _migrateFromPythonConfig(store: Store<StoreType>): void {
  if (store.get('_migrationFromPythonDone')) return;

  const pyConfigPath = join(homedir(), 'trackr_config.json');
  if (!existsSync(pyConfigPath)) {
    store.set('_migrationFromPythonDone', true);
    return;
  }

  try {
    const raw = JSON.parse(readFileSync(pyConfigPath, 'utf8')) as Record<string, unknown>;
    const updates: Partial<StoreType> = {};

    if (typeof raw['output_root']            === 'string' && raw['output_root'])
      updates.outputRoot           = raw['output_root'] as string;
    if (typeof raw['migration_prompt_seen']  === 'boolean')
      updates.migrationPromptSeen  = raw['migration_prompt_seen'] as boolean;
    if (typeof raw['delay_seconds']          === 'number')
      updates.delaySeconds         = raw['delay_seconds'] as number;
    if (typeof raw['timestamps_enabled']     === 'boolean')
      updates.timestampsEnabled    = raw['timestamps_enabled'] as boolean;
    if (typeof raw['strip_mix_labels']       === 'boolean')
      updates.stripMixLabels       = raw['strip_mix_labels'] as boolean;
    if (typeof raw['api_enabled']            === 'boolean')
      updates.apiEnabled           = raw['api_enabled'] as boolean;
    if (typeof raw['api_access_mode']        === 'string')
      updates.apiAccessMode        = raw['api_access_mode'] as string;
    if (typeof raw['share_play_count_via_api'] === 'boolean')
      updates.sharePlayCountViaApi = raw['share_play_count_via_api'] as boolean;
    if (typeof raw['api_port']               === 'number')
      updates.apiPort              = raw['api_port'] as number;

    if (Object.keys(updates).length > 0) store.set(updates);
    console.log('[store] Migrated settings from ~/trackr_config.json');
  } catch (err) {
    console.warn('[store] Could not migrate from Python config:', err);
  }

  store.set('_migrationFromPythonDone', true);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function _rawToConfig(raw: StoreType): TrackrConfig {
  const mode = raw.apiAccessMode === 'localhost' ? 'localhost' : 'lan';
  return {
    outputRoot:           raw.outputRoot,
    migrationPromptSeen:  raw.migrationPromptSeen,
    delaySeconds:         raw.delaySeconds,
    timestampsEnabled:    raw.timestampsEnabled,
    stripMixLabels:       raw.stripMixLabels,
    apiEnabled:           raw.apiEnabled,
    apiAccessMode:        mode,
    sharePlayCountViaApi: raw.sharePlayCountViaApi,
    apiPort:              raw.apiPort,
    startWithWindows:     raw.startWithWindows,
    startInTray:          raw.startInTray,
    overlayStyle:         { ...DEFAULT_OVERLAY_STYLE, ...raw.overlayStyle },
  };
}

// ─── public API ──────────────────────────────────────────────────────────────

export function getConfig(): TrackrConfig {
  return _rawToConfig(getStore().store);
}

export function setConfig(partial: Partial<TrackrConfig>): void {
  // Validate delay_seconds and api_port before writing
  if (partial.delaySeconds != null && partial.delaySeconds < 0) {
    throw new Error('delaySeconds must be >= 0');
  }
  if (partial.apiPort != null && (partial.apiPort <= 0 || partial.apiPort > 65535)) {
    throw new Error('apiPort must be between 1 and 65535');
  }
  if (partial.apiAccessMode != null && !['localhost', 'lan'].includes(partial.apiAccessMode)) {
    throw new Error("apiAccessMode must be 'localhost' or 'lan'");
  }
  if (partial.overlayStyle != null) {
    const s = partial.overlayStyle;
    if (s.fontSize     != null && (s.fontSize < 24 || s.fontSize > 72))       throw new Error('fontSize must be 24–72');
    if (s.letterSpacing != null && (s.letterSpacing < 0 || s.letterSpacing > 0.3)) throw new Error('letterSpacing must be 0–0.3');
    if (s.lineGap      != null && (s.lineGap < 0 || s.lineGap > 30))         throw new Error('lineGap must be 0–30');
    if (s.dropShadowX  != null && (s.dropShadowX < 0 || s.dropShadowX > 20)) throw new Error('dropShadowX must be 0–20');
    if (s.dropShadowY  != null && (s.dropShadowY < 0 || s.dropShadowY > 20)) throw new Error('dropShadowY must be 0–20');
    if (s.dropShadowBlur != null && (s.dropShadowBlur < 0 || s.dropShadowBlur > 20)) throw new Error('dropShadowBlur must be 0–20');
  }
  getStore().set(partial as Partial<StoreType>);
}

export function getEffectiveBindHost(config: TrackrConfig): string {
  return config.apiAccessMode === 'localhost' ? '127.0.0.1' : '0.0.0.0';
}

/**
 * Resolve the output root directory.
 * - If already set in store → resolved
 * - If ~/NowPlayingLite/ exists and migration not seen → needs_user_choice
 * - Otherwise → auto-set to ~/TRACKR/ and return resolved
 */
export function resolveOutputRoot(): OutputRootResolution {
  const cfg        = getConfig();
  const legacyRoot = join(homedir(), 'NowPlayingLite');
  const trackrRoot = join(homedir(), 'TRACKR');

  if (cfg.outputRoot) {
    return {
      state: 'resolved',
      outputRoot: cfg.outputRoot,
      legacyRoot,
      trackrRoot,
      migrationPromptSeen: cfg.migrationPromptSeen,
    };
  }

  if (existsSync(legacyRoot) && !cfg.migrationPromptSeen) {
    return {
      state: 'needs_user_choice',
      outputRoot: null,
      legacyRoot,
      trackrRoot,
      migrationPromptSeen: false,
    };
  }

  // Auto-resolve to ~/TRACKR/
  setConfig({ outputRoot: trackrRoot });
  return {
    state: 'resolved',
    outputRoot: trackrRoot,
    legacyRoot,
    trackrRoot,
    migrationPromptSeen: cfg.migrationPromptSeen,
  };
}

export function persistOutputRootChoice(choice: 'legacy' | 'trackr'): OutputRootResolution {
  const legacyRoot = join(homedir(), 'NowPlayingLite');
  const trackrRoot = join(homedir(), 'TRACKR');
  const outputRoot = choice === 'legacy' ? legacyRoot : trackrRoot;

  setConfig({ outputRoot, migrationPromptSeen: true });

  return {
    state: 'resolved',
    outputRoot,
    legacyRoot,
    trackrRoot,
    migrationPromptSeen: true,
  };
}
