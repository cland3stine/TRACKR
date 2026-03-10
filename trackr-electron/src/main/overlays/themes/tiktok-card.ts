/**
 * TRACKR Overlay Theme — TikTok Card
 *
 * Smaller Glass Card optimized for 9:16 portrait.
 * 170px wide, art 170x170, info below.
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
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      perspective: 600px;
    }

    .track-card {
      position: relative;
      width: 170px;
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
      50%      { transform: ${RESTING_TRANSFORM} translateY(-4px); }
    }

    .card-inner {
      position: relative;
      border-radius: 10px;
      background: rgba(10, 10, 16, 0.82);
      backdrop-filter: blur(20px) saturate(1.3);
      -webkit-backdrop-filter: blur(20px) saturate(1.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      overflow: hidden;
      box-shadow:
        0 4px 10px rgba(0, 0, 0, 0.4),
        0 10px 24px rgba(0, 0, 0, 0.3),
        0 24px 50px rgba(0, 0, 0, 0.2);
    }

    .card-inner::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 10px;
      border: 1px solid transparent;
      background: linear-gradient(160deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 40%, rgba(0,212,255,0.05)) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }

    .card-art-wrap {
      position: relative;
      width: 170px;
      height: 170px;
      overflow: hidden;
      ${opts.showArt ? '' : 'display: none;'}
    }

    .card-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .card-art-placeholder {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(10,10,16,0.9));
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.15);
      font-size: 36px;
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
      padding: 10px 12px 12px;
      position: relative;
      z-index: 2;
    }

    .card-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 6px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 6px;
    }

    .card-badge-dot {
      width: 4px; height: 4px;
      border-radius: 50%;
      background: #00d4ff;
      animation: ledPulse 2s ease-in-out infinite;
    }

    @keyframes ledPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 3px #00d4ff; }
      50%      { opacity: 0.4; box-shadow: 0 0 1px #00d4ff; }
    }

    .card-artist {
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-title {
      font-size: 9px;
      font-weight: 500;
      color: rgba(255,255,255,0.55);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-divider {
      width: 100%;
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 6px 0;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 7px;
    }

    .card-label { color: #00d4ff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
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
      document.getElementById('artist').textContent = data.artist || '';
      document.getElementById('title').textContent = data.title || '';

      const artWrap = document.getElementById('artWrap');
      const artImg = document.getElementById('artImg');
      const artPlaceholder = document.getElementById('artPlaceholder');
      if (SHOW_ART && data.artUrl) {
        artImg.src = API_BASE + data.artUrl;
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
