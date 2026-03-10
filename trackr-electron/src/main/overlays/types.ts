/**
 * TRACKR Overlay — Shared types
 */

export interface OverlayTheme {
  id: string;
  name: string;
  description: string;
  canvas: 'landscape' | 'portrait' | 'both';
  transitions: string[];
  defaultTransition: string;
  render(options: ThemeRenderOptions): string;
}

export interface ThemeRenderOptions {
  position: string;
  transition: string;
  displayDuration: number;
  showLabel: boolean;
  showYear: boolean;
  showArt: boolean;
  apiBaseUrl: string;
  preview: boolean;
}

export interface OverlayCanvasConfig {
  theme: string;
  transition: string;
  position: string;
  displayDuration: number;
  showLabel: boolean;
  showYear: boolean;
  showArt: boolean;
}

export interface OverlayTriggerConfig {
  autoShowOnTrackChange: boolean;
  chatCommand: boolean;
  chatCommandNames: string[];
  chatCommandCooldown: number;
  twitchChannel: string;
}

export interface OverlaysConfig {
  main: OverlayCanvasConfig;
  tiktok: OverlayCanvasConfig;
  triggers: OverlayTriggerConfig;
}
