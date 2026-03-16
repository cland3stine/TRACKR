/**
 * TRACKR Overlay Theme — Lower Third
 *
 * Horizontal bar with glass material, cyan accent line, no album art.
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'none';
const SUPPORTED_TRANSITIONS = ['slide', 'digital', 'blur', 'edge-wipe'];

export const lowerThird: OverlayTheme = {
  id: 'lower-third',
  name: 'Lower Third',
  description: 'Compact horizontal bar with glass material, no album art',
  canvas: 'landscape',
  transitions: SUPPORTED_TRANSITIONS,
  defaultTransition: 'slide',

  render(opts: ThemeRenderOptions): string {
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
      previewCardWidth: 960,
      previewCardHeight: 140,
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=3840, initial-scale=1">
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
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
    }

    #overlay-root {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    }

    .track-card {
      position: relative;
      width: 960px;
      opacity: 0;
      pointer-events: none;
    }

    .track-card.hidden { opacity: 0; }

    .track-card.visible {
      opacity: 1;
      animation: idleFloat 4s ease-in-out infinite;
    }

    @keyframes idleFloat {
      0%, 100% { transform: translateY(0px); }
      50%      { transform: translateY(-6px); }
    }

    .lt-bar {
      position: relative;
      padding: 32px 44px;
      border-radius: 18px;
      background: rgba(10, 10, 16, 0.78);
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-top: 4px solid #00d4ff;
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.5),
        0 16px 40px rgba(0, 0, 0, 0.5),
        0 40px 100px rgba(0, 0, 0, 0.4),
        0 80px 200px rgba(0, 0, 0, 0.3),
        inset 0 2px 0 rgba(255, 255, 255, 0.06),
        inset 0 -2px 0 rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .lt-bar::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 40%);
      pointer-events: none;
    }

    .lt-main {
      font-size: 28px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    .lt-sep { color: rgba(255,255,255,0.3); margin: 0 14px; }

    .lt-meta {
      font-size: 18px;
      font-weight: 500;
      color: rgba(255,255,255,0.4);
      margin-top: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lt-label { color: #00d4ff; }
    .lt-meta-sep { color: rgba(255,255,255,0.15); margin: 0 8px; }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="lt-bar">
        <div class="lt-main">
          <span id="artist"></span><span class="lt-sep">—</span><span id="title"></span>
        </div>
        <div class="lt-meta" id="meta" style="display:none;">
          <span class="lt-label" id="label"></span>
          <span class="lt-meta-sep" id="metaSep">&middot;</span>
          <span id="year"></span>
        </div>
      </div>
    </div>
  </div>
  <script>
    ${sharedJS}

    function updateContent(data) {
      document.getElementById('artist').textContent = data.artist || '';
      document.getElementById('title').textContent = data.title || '';
      fitText(document.querySelector('.lt-main'), [28, 24, 21, 18]);
      const hasLabel = SHOW_LABEL && data.label;
      const dateStr = data.releaseDate || (data.year ? String(data.year) : '');
      const hasYear = SHOW_YEAR && dateStr;
      const meta = document.getElementById('meta');
      if (hasLabel || hasYear) {
        meta.style.display = '';
        document.getElementById('label').textContent = hasLabel ? data.label : '';
        document.getElementById('label').style.display = hasLabel ? '' : 'none';
        document.getElementById('year').textContent = hasYear ? fmtDate(dateStr) : '';
        document.getElementById('year').style.display = hasYear ? '' : 'none';
        document.getElementById('metaSep').style.display = (hasLabel && hasYear) ? '' : 'none';
      } else {
        meta.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
  },
};
