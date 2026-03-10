/**
 * TRACKR Overlay Theme — Lower Third
 *
 * Horizontal bar (~420px wide, ~80px tall) anchored to bottom.
 * Glass material, cyan accent line, no album art.
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
    }

    .track-card {
      position: relative;
      width: 420px;
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
      50%      { transform: translateY(-3px); }
    }

    .lt-bar {
      position: relative;
      padding: 14px 20px;
      border-radius: 8px;
      background: rgba(10, 10, 16, 0.78);
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-top: 2px solid #00d4ff;
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.4),
        0 12px 28px rgba(0, 0, 0, 0.3);
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
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    .lt-sep { color: rgba(255,255,255,0.3); margin: 0 6px; }

    .lt-meta {
      font-size: 9px;
      font-weight: 500;
      color: rgba(255,255,255,0.4);
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lt-label { color: #00d4ff; }
    .lt-meta-sep { color: rgba(255,255,255,0.15); margin: 0 4px; }

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
      const hasLabel = SHOW_LABEL && data.label;
      const hasYear = SHOW_YEAR && data.year;
      const meta = document.getElementById('meta');
      if (hasLabel || hasYear) {
        meta.style.display = '';
        document.getElementById('label').textContent = hasLabel ? data.label : '';
        document.getElementById('label').style.display = hasLabel ? '' : 'none';
        document.getElementById('year').textContent = hasYear ? data.year : '';
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
