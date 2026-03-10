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

export interface EnrichmentConfig {
  enabled:               boolean;
  beatportUsername:       string;
  beatportPassword:       string;
  beatportToken:         string;
  beatportRefreshToken:  string;
  beatportTokenExpiresAt: number;  // epoch ms
  beatportClientId:      string;
  artOverlayEnabled:     boolean;
  timeoutMs:             number;
}

export interface TracklistFormatConfig {
  includeYear:  boolean;
  includeLabel: boolean;
}

export interface ApiEnrichmentConfig {
  sendYear:  boolean;
  sendLabel: boolean;
  sendArt:   boolean;
}

export interface OverlayCanvasConfig {
  theme:           string;
  transition:      string;
  position:        string;
  displayDuration: number;  // seconds, 0 = always visible
  showLabel:       boolean;
  showYear:        boolean;
  showArt:         boolean;
}

export interface OverlayTriggerConfig {
  autoShowOnTrackChange: boolean;
  chatCommand:           boolean;
  chatCommandName:       string;
  chatCommandCooldown:   number;  // seconds
  twitchChannel:         string;
}

export interface OverlaysConfig {
  main:     OverlayCanvasConfig;
  tiktok:   OverlayCanvasConfig;
  triggers: OverlayTriggerConfig;
}

export const DEFAULT_ENRICHMENT: EnrichmentConfig = {
  enabled:               false,
  beatportUsername:       '',
  beatportPassword:      '',
  beatportToken:         '',
  beatportRefreshToken:  '',
  beatportTokenExpiresAt: 0,
  beatportClientId:      '',
  artOverlayEnabled:     false,
  timeoutMs:             5000,
};

export const DEFAULT_TRACKLIST_FORMAT: TracklistFormatConfig = {
  includeYear:  false,
  includeLabel: false,
};

export const DEFAULT_API_ENRICHMENT: ApiEnrichmentConfig = {
  sendYear:  true,
  sendLabel: true,
  sendArt:   true,
};

export const DEFAULT_OVERLAYS: OverlaysConfig = {
  main: {
    theme:           'glass-card',
    transition:      'slide',
    position:        'bottom-left',
    displayDuration: 20,
    showLabel:       true,
    showYear:        true,
    showArt:         true,
  },
  tiktok: {
    theme:           'glass-card',
    transition:      'digital',
    position:        'bottom-center',
    displayDuration: 15,
    showLabel:       false,
    showYear:        false,
    showArt:         false,
  },
  triggers: {
    autoShowOnTrackChange: true,
    chatCommand:           false,
    chatCommandName:       '!trackid',
    chatCommandCooldown:   30,
    twitchChannel:         '',
  },
};

export interface TrackrConfig {
  outputRoot:            string;  // '' = not set
  migrationPromptSeen:   boolean;
  delaySeconds:          number;
  timestampsEnabled:     boolean;
  stripMixLabels:        boolean;
  apiEnabled:            boolean;
  sharePlayCountViaApi:  boolean;
  apiPort:               number;
  startWithWindows:      boolean;
  startInTray:           boolean;
  overlayStyle:          OverlayStyle;
  enrichment:            EnrichmentConfig;
  tracklistFormat:       TracklistFormatConfig;
  apiEnrichment:         ApiEnrichmentConfig;
  overlays:              OverlaysConfig;
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
  sharePlayCountViaApi:     boolean;
  apiPort:                  number;
  startWithWindows:         boolean;
  startInTray:              boolean;
  overlayStyle:             OverlayStyle;
  enrichment:               EnrichmentConfig;
  tracklistFormat:          TracklistFormatConfig;
  apiEnrichment:            ApiEnrichmentConfig;
  overlays:                 OverlaysConfig;
  _migrationFromPythonDone: boolean;
}

const DEFAULTS: StoreType = {
  outputRoot:               '',
  migrationPromptSeen:      false,
  delaySeconds:             3,
  timestampsEnabled:        true,
  stripMixLabels:           true,
  apiEnabled:               true,
  sharePlayCountViaApi:     false,
  apiPort:                  8755,
  startWithWindows:         false,
  startInTray:              false,
  overlayStyle:             { ...DEFAULT_OVERLAY_STYLE },
  enrichment:               { ...DEFAULT_ENRICHMENT },
  tracklistFormat:          { ...DEFAULT_TRACKLIST_FORMAT },
  apiEnrichment:            { ...DEFAULT_API_ENRICHMENT },
  overlays:                 JSON.parse(JSON.stringify(DEFAULT_OVERLAYS)),
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
  return {
    outputRoot:           raw.outputRoot,
    migrationPromptSeen:  raw.migrationPromptSeen,
    delaySeconds:         raw.delaySeconds,
    timestampsEnabled:    raw.timestampsEnabled,
    stripMixLabels:       raw.stripMixLabels,
    apiEnabled:           raw.apiEnabled,
    sharePlayCountViaApi: raw.sharePlayCountViaApi,
    apiPort:              raw.apiPort,
    startWithWindows:     raw.startWithWindows,
    startInTray:          raw.startInTray,
    overlayStyle:         { ...DEFAULT_OVERLAY_STYLE, ...raw.overlayStyle },
    enrichment:           { ...DEFAULT_ENRICHMENT, ...raw.enrichment },
    tracklistFormat:      { ...DEFAULT_TRACKLIST_FORMAT, ...raw.tracklistFormat },
    apiEnrichment:        { ...DEFAULT_API_ENRICHMENT, ...raw.apiEnrichment },
    overlays: {
      main:     { ...DEFAULT_OVERLAYS.main,     ...raw.overlays?.main },
      tiktok:   { ...DEFAULT_OVERLAYS.tiktok,   ...raw.overlays?.tiktok },
      triggers: { ...DEFAULT_OVERLAYS.triggers,  ...raw.overlays?.triggers },
    },
  };
}

// ─── public API ──────────────────────────────────────────────────────────────

export function getConfig(): TrackrConfig {
  return _rawToConfig(getStore().store);
}

export function setConfig(partial: Partial<TrackrConfig>): void {
  if (partial.delaySeconds != null && partial.delaySeconds < 0) {
    throw new Error('delaySeconds must be >= 0');
  }
  if (partial.apiPort != null && (partial.apiPort <= 0 || partial.apiPort > 65535)) {
    throw new Error('apiPort must be between 1 and 65535');
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

  // Deep-merge nested config objects so partial updates don't wipe stored values
  // (e.g., updating enrichment.enabled must not erase the stored Beatport token)
  const store = getStore();
  if (partial.enrichment) {
    partial.enrichment = { ...store.get('enrichment'), ...partial.enrichment } as EnrichmentConfig;
  }
  if (partial.apiEnrichment) {
    partial.apiEnrichment = { ...store.get('apiEnrichment'), ...partial.apiEnrichment } as ApiEnrichmentConfig;
  }
  if (partial.tracklistFormat) {
    partial.tracklistFormat = { ...store.get('tracklistFormat'), ...partial.tracklistFormat } as TracklistFormatConfig;
  }
  if (partial.overlays) {
    const current = store.get('overlays') ?? DEFAULT_OVERLAYS;
    partial.overlays = {
      main:     { ...current.main,     ...(partial.overlays as Partial<OverlaysConfig>).main },
      tiktok:   { ...current.tiktok,   ...(partial.overlays as Partial<OverlaysConfig>).tiktok },
      triggers: { ...current.triggers,  ...(partial.overlays as Partial<OverlaysConfig>).triggers },
    } as OverlaysConfig;
  }

  store.set(partial as Partial<StoreType>);
}

export function getEffectiveBindHost(): string {
  return '0.0.0.0';
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
