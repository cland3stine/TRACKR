/**
 * TRACKR Overlay Theme — TikTok Clean
 *
 * Pill-shaped bar for 9:16 portrait canvas.
 * Single line: Artist · Title. Maximum compactness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'none';
const SUPPORTED_TRANSITIONS = ['digital', 'blur', 'scale-pop'];

export const tiktokClean: OverlayTheme = {
  id: 'tiktok-clean',
  name: 'TikTok Clean',
  description: 'Compact pill bar for portrait/TikTok canvas',
  canvas: 'portrait',
  transitions: SUPPORTED_TRANSITIONS,
  defaultTransition: 'digital',

  render(opts: ThemeRenderOptions): string {
    const transitionCSS = buildTransitionCSS(RESTING_TRANSFORM, SUPPORTED_TRANSITIONS);
    const sharedJS = buildSharedJS({
      apiBaseUrl: opts.apiBaseUrl,
      displayDuration: opts.displayDuration,
      position: opts.position,
      transition: opts.transition,
      showLabel: false,
      showYear: false,
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
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%);
    }

    .track-card {
      position: relative;
      opacity: 0;
      pointer-events: none;
    }

    .track-card.hidden { opacity: 0; }
    .track-card.visible { opacity: 1; }

    .tt-pill {
      display: inline-block;
      padding: 8px 18px;
      border-radius: 18px;
      background: rgba(10, 10, 16, 0.75);
      backdrop-filter: blur(16px) saturate(1.3);
      -webkit-backdrop-filter: blur(16px) saturate(1.3);
      border: 1px solid rgba(255, 255, 255, 0.06);
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      white-space: nowrap;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tt-text {
      font-size: 10px;
      font-weight: 500;
      color: #ffffff;
    }

    .tt-sep {
      color: rgba(255,255,255,0.3);
      margin: 0 5px;
    }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="tt-pill">
        <span class="tt-text">
          <span id="artist"></span><span class="tt-sep">&middot;</span><span id="title"></span>
        </span>
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
