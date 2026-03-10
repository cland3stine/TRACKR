/**
 * TRACKR Overlay Theme — Minimal
 *
 * Text only, no background panel. Single line: Artist — Title.
 * Subtle text shadow for readability over video.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'none';
const SUPPORTED_TRANSITIONS = ['digital', 'blur'];

export const minimal: OverlayTheme = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Text only, no background — clean single-line overlay',
  canvas: 'landscape',
  transitions: SUPPORTED_TRANSITIONS,
  defaultTransition: 'blur',

  render(opts: ThemeRenderOptions): string {
    const positionCSS = getPositionCSS(opts.position);
    const transitionCSS = buildTransitionCSS(RESTING_TRANSFORM, SUPPORTED_TRANSITIONS);
    const sharedJS = buildSharedJS({
      apiBaseUrl: opts.apiBaseUrl,
      displayDuration: opts.displayDuration,
      position: opts.position,
      transition: opts.transition,
      showLabel: opts.showLabel,
      showYear: opts.showYear,
      showArt: false,
      preview: opts.preview,
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: transparent;
      overflow: hidden;
      font-family: 'JetBrains Mono', monospace;
    }

    #overlay-root {
      position: absolute;
      ${positionCSS}
      max-width: 600px;
    }

    .track-card {
      position: relative;
      opacity: 0;
      pointer-events: none;
    }

    .track-card.hidden { opacity: 0; }
    .track-card.visible { opacity: 1; }

    .min-text {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }

    .min-sep { color: rgba(255,255,255,0.4); margin: 0 8px; }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="min-text">
        <span id="artist"></span><span class="min-sep">—</span><span id="title"></span>
      </div>
    </div>
  </div>
  <script>
    ${sharedJS}

    function updateContent(data) {
      document.getElementById('artist').textContent = data.artist || '';
      document.getElementById('title').textContent = data.title || '';
    }
  </script>
</body>
</html>`;
  },
};

function getPositionCSS(position: string): string {
  switch (position) {
    case 'bottom-right': return 'bottom: 30px; right: 40px;';
    case 'top-left':     return 'top: 30px; left: 40px;';
    case 'top-right':    return 'top: 30px; right: 40px;';
    case 'bottom-center': return 'bottom: 30px; left: 50%; transform: translateX(-50%);';
    case 'bottom-left':
    default:             return 'bottom: 30px; left: 40px;';
  }
}
