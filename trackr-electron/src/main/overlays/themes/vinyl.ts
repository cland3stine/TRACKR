/**
 * TRACKR Overlay Theme — Vinyl
 *
 * Horizontal layout: circular album art (spinning) on left, track info on right.
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'none';
const SUPPORTED_TRANSITIONS = ['slide', 'scale-pop', 'blur'];

export const vinyl: OverlayTheme = {
  id: 'vinyl',
  name: 'Vinyl',
  description: 'Spinning circular art with horizontal track info',
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
      showArt: opts.showArt,
      preview: opts.preview,
      previewCardWidth: 1000,
      previewCardHeight: 344,
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
      display: flex;
      align-items: center;
      gap: 36px;
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

    /* ── Spinning Art ── */
    .vinyl-art-wrap {
      width: 280px;
      height: 280px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow:
        0 8px 40px rgba(0,0,0,0.5),
        0 24px 80px rgba(0,0,0,0.3);
      ${opts.showArt ? '' : 'display: none;'}
    }

    .vinyl-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.4s ease;
    }

    .vinyl-art-placeholder {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(255,180,60,0.15), rgba(10,10,16,0.9));
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.15);
      font-size: 80px;
    }

    .track-card.visible .vinyl-art-wrap {
      animation: vinylSpin 8s linear infinite;
    }

    @keyframes vinylSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* ── Info Panel ── */
    .vinyl-info {
      padding: 22px 40px 22px 0;
      min-width: 0;
    }

    .vinyl-info-bg {
      display: flex;
      align-items: center;
      gap: 36px;
      padding: 32px 44px;
      border-radius: 22px;
      background: rgba(10, 10, 16, 0.75);
      backdrop-filter: blur(20px) saturate(1.3);
      -webkit-backdrop-filter: blur(20px) saturate(1.3);
      border: 2px solid rgba(255, 255, 255, 0.06);
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.5),
        0 16px 40px rgba(0, 0, 0, 0.5),
        0 40px 100px rgba(0, 0, 0, 0.4),
        0 80px 200px rgba(0, 0, 0, 0.3),
        inset 0 2px 0 rgba(255, 255, 255, 0.06),
        inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    }

    .vinyl-artist {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 600px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    .vinyl-title {
      font-size: 22px;
      font-weight: 500;
      color: rgba(255,255,255,0.55);
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 600px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }

    .vinyl-meta {
      font-size: 18px;
      color: rgba(255,255,255,0.4);
      margin-top: 10px;
      white-space: nowrap;
    }

    .vinyl-label { color: #ffb43c; font-weight: 600; }
    .vinyl-meta-sep { color: rgba(255,255,255,0.15); margin: 0 8px; }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="vinyl-info-bg">
        <div class="vinyl-art-wrap" id="artWrap">
          <img class="vinyl-art" id="artImg" src="" alt="" style="display:none;" />
          <div class="vinyl-art-placeholder" id="artPlaceholder">&#9835;</div>
        </div>
        <div class="vinyl-info">
          <div class="vinyl-artist" id="artist"></div>
          <div class="vinyl-title" id="title"></div>
          <div class="vinyl-meta" id="meta" style="display:none;">
            <span class="vinyl-label" id="label"></span>
            <span class="vinyl-meta-sep" id="metaSep">&middot;</span>
            <span id="year"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    ${sharedJS}

    function updateContent(data) {
      var artistEl = document.getElementById('artist');
      var titleEl = document.getElementById('title');
      artistEl.textContent = data.artist || '';
      titleEl.textContent = data.title || '';
      fitText(artistEl, [28, 24, 21, 18]);
      fitText(titleEl, [22, 19, 16, 14]);

      const artWrap = document.getElementById('artWrap');
      const artImg = document.getElementById('artImg');
      const artPlaceholder = document.getElementById('artPlaceholder');
      if (SHOW_ART && data.artUrl) {
        artImg.src = API_BASE + data.artUrl + '?t=' + Date.now();
        artImg.style.display = 'block';
        artPlaceholder.style.display = 'none';
        artWrap.style.display = '';
      } else if (SHOW_ART) {
        artImg.style.display = 'none';
        artPlaceholder.style.display = 'flex';
        artWrap.style.display = '';
      } else {
        artWrap.style.display = 'none';
      }

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
