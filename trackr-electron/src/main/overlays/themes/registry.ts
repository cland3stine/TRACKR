/**
 * TRACKR Overlay — Theme Registry
 */

import { OverlayTheme } from '../types';
import { glassCard } from './glass-card';
import { lowerThird } from './lower-third';
import { minimal } from './minimal';
import { vinyl } from './vinyl';
import { tiktokClean } from './tiktok-clean';
import { tiktokCard } from './tiktok-card';
import { hologram } from './hologram';
import { prism } from './prism';
import { liquid } from './liquid';
import { signal } from './signal';

export const themes: Record<string, OverlayTheme> = {
  'glass-card': glassCard,
  'lower-third': lowerThird,
  'minimal': minimal,
  'vinyl': vinyl,
  'tiktok-clean': tiktokClean,
  'tiktok-card': tiktokCard,
  'hologram': hologram,
  'prism': prism,
  'liquid': liquid,
  'signal': signal,
};

export function getTheme(id: string): OverlayTheme | undefined {
  return themes[id];
}

export function getThemesForCanvas(canvas: 'landscape' | 'portrait'): OverlayTheme[] {
  return Object.values(themes).filter(t => t.canvas === canvas || t.canvas === 'both');
}

export function getThemeList(): Array<{ id: string; name: string; description: string; canvas: string; transitions: string[]; defaultTransition: string }> {
  return Object.values(themes).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    canvas: t.canvas,
    transitions: t.transitions,
    defaultTransition: t.defaultTransition,
  }));
}
