/**
 * TRACKR Overlay Theme — TikTok Card
 *
 * Glass Card optimized for 9:16 portrait.
 * Renders at 4K portrait (2160×3840) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(12deg) rotateX(-2deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const tiktokCard: OverlayTheme = {
  id: 'tiktok-card',
  name: 'TikTok Card',
  description: 'Glass card optimized for 9:16 portrait canvas',
  canvas: 'portrait',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'scale-pop',

  render(opts: ThemeRenderOptions): string {
    const transitionCSS = buildTransitionCSS(RESTING_TRANSFORM, ALL_TRANSITIONS);
    const sharedJS = buildSharedJS({
      apiBaseUrl: opts.apiBaseUrl,
      displayDuration: opts.displayDuration,
      position: opts.position,
      transition: opts.transition,
      showLabel: opts.showLabel,
      showYear: opts.showYear,
      showArt: opts.showArt,
      preview: opts.preview,
      previewCardWidth: 400,
      previewCardHeight: 590,
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=2160, initial-scale=1">
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
      perspective: 1400px;
    }

    .track-card {
      position: relative;
      width: 400px;
      transform: ${RESTING_TRANSFORM};
      transform-style: preserve-3d;
      opacity: 0;
      pointer-events: none;
    }

    .track-card.hidden { opacity: 0; }

    .track-card.visible {
      opacity: 1;
      transform: ${RESTING_TRANSFORM};
      animation: idleFloat 4s ease-in-out infinite;
    }

    @keyframes idleFloat {
      0%, 100% { transform: ${RESTING_TRANSFORM} translateY(0px); }
      50%      { transform: ${RESTING_TRANSFORM} translateY(-10px); }
    }

    .card-inner {
      position: relative;
      border-radius: 24px;
      background: rgba(10, 10, 16, 0.82);
      backdrop-filter: blur(20px) saturate(1.3);
      -webkit-backdrop-filter: blur(20px) saturate(1.3);
      border: 2px solid rgba(255, 255, 255, 0.1);
      overflow: hidden;
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.5),
        0 16px 40px rgba(0, 0, 0, 0.5),
        0 40px 100px rgba(0, 0, 0, 0.4),
        0 80px 200px rgba(0, 0, 0, 0.3),
        inset 0 2px 0 rgba(255, 255, 255, 0.06),
        inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    }

    .card-inner::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 24px;
      border: 2px solid transparent;
      background: linear-gradient(160deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 40%, rgba(0,212,255,0.05)) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }

    .card-art-wrap {
      position: relative;
      width: 400px;
      height: 400px;
      overflow: hidden;
      ${opts.showArt ? '' : 'display: none;'}
    }

    .card-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.4s ease;
    }

    .card-art-placeholder {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(10,10,16,0.9));
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.15);
      font-size: 80px;
    }

    .card-art-wrap::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 60%;
      background: linear-gradient(to top, rgba(10,10,16,0.95), transparent);
      pointer-events: none;
    }

    .card-info {
      padding: 24px 28px 28px;
      position: relative;
      z-index: 2;
    }

    .card-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 14px;
    }

    .card-badge-dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      background: #00d4ff;
      animation: ledPulse 2s ease-in-out infinite;
    }

    @keyframes ledPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 7px #00d4ff; }
      50%      { opacity: 0.4; box-shadow: 0 0 3px #00d4ff; }
    }

    .card-artist {
      font-size: 26px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    .card-title {
      font-size: 20px;
      font-weight: 500;
      color: rgba(255,255,255,0.55);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }

    .card-divider {
      width: 100%;
      height: 2px;
      background: rgba(255,255,255,0.08);
      margin: 14px 0;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
    }

    .card-label { color: #00d4ff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
    .card-year { color: rgba(255,255,255,0.35); font-weight: 500; }
    .card-meta-sep { color: rgba(255,255,255,0.15); }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="card-inner">
        <div class="card-art-wrap" id="artWrap">
          <img class="card-art" id="artImg" src="" alt="" style="display:none;" />
          <div class="card-art-placeholder" id="artPlaceholder">&#9835;</div>
        </div>
        <div class="card-info">
          <div class="card-badge">
            <span class="card-badge-dot"></span>
            NOW PLAYING
          </div>
          <div class="card-artist" id="artist"></div>
          <div class="card-title" id="title"></div>
          <div class="card-divider" id="divider" style="display:none;"></div>
          <div class="card-meta" id="meta" style="display:none;">
            <span class="card-label" id="label"></span>
            <span class="card-meta-sep" id="metaSep">&middot;</span>
            <span class="card-year" id="year"></span>
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
      fitText(artistEl, [26, 22, 19, 16]);
      fitText(titleEl, [20, 17, 15, 13]);

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
      const hasYear = SHOW_YEAR && data.year;
      const divider = document.getElementById('divider');
      const meta = document.getElementById('meta');
      if (hasLabel || hasYear) {
        divider.style.display = '';
        meta.style.display = '';
        document.getElementById('label').textContent = hasLabel ? data.label : '';
        document.getElementById('label').style.display = hasLabel ? '' : 'none';
        document.getElementById('year').textContent = hasYear ? data.year : '';
        document.getElementById('year').style.display = hasYear ? '' : 'none';
        document.getElementById('metaSep').style.display = (hasLabel && hasYear) ? '' : 'none';
      } else {
        divider.style.display = 'none';
        meta.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
  },
};
