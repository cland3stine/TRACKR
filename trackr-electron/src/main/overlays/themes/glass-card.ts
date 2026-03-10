/**
 * TRACKR Overlay Theme — Glass Card
 *
 * 3D angled vertical card with liquid glass material.
 * 210px wide, album art on top, track info below.
 * Supports all 6 transitions.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(18deg) rotateX(-3deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const glassCard: OverlayTheme = {
  id: 'glass-card',
  name: 'Glass Card',
  description: '3D angled card with liquid glass material and album art',
  canvas: 'landscape',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'slide',

  render(opts: ThemeRenderOptions): string {
    const positionCSS = getPositionCSS(opts.position);
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
      ${positionCSS}
      perspective: 800px;
    }

    .track-card {
      position: relative;
      width: 210px;
      transform: ${RESTING_TRANSFORM};
      transform-style: preserve-3d;
      opacity: 0;
      pointer-events: none;
    }

    .track-card.hidden {
      opacity: 0;
    }

    .track-card.visible {
      opacity: 1;
      transform: ${RESTING_TRANSFORM};
      animation: idleFloat 4s ease-in-out infinite;
    }

    @keyframes idleFloat {
      0%, 100% { transform: ${RESTING_TRANSFORM} translateY(0px); }
      50%      { transform: ${RESTING_TRANSFORM} translateY(-5px); }
    }

    /* ── Glass Panel ── */
    .card-inner {
      position: relative;
      border-radius: 12px;
      background: rgba(10, 10, 16, 0.78);
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.4),
        0 12px 28px rgba(0, 0, 0, 0.35),
        0 28px 60px rgba(0, 0, 0, 0.25),
        0 60px 100px rgba(0, 0, 0, 0.15);
    }

    /* Specular highlight */
    .card-inner::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: linear-gradient(
        135deg,
        rgba(255,255,255,0.06) 0%,
        transparent 40%,
        transparent 60%,
        rgba(255,255,255,0.03) 100%
      );
      pointer-events: none;
      z-index: 5;
      animation: specularShift 6s ease-in-out infinite alternate;
    }

    @keyframes specularShift {
      0%   { transform: translate(0, 0); }
      100% { transform: translate(5%, 3%); }
    }

    /* Glass border gradient */
    .card-inner::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 12px;
      border: 1px solid transparent;
      background: linear-gradient(
        160deg,
        rgba(255,255,255,0.12),
        rgba(255,255,255,0.02) 40%,
        rgba(0,212,255,0.06)
      ) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
      z-index: 6;
    }

    /* ── Album Art ── */
    .card-art-wrap {
      position: relative;
      width: 210px;
      height: 210px;
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
      font-size: 48px;
    }

    /* Art-to-info gradient blend */
    .card-art-wrap::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 60%;
      background: linear-gradient(to top, rgba(10,10,16,0.95), transparent);
      pointer-events: none;
    }

    /* ── Track Info ── */
    .card-info {
      padding: 12px 14px 14px;
      position: relative;
      z-index: 2;
    }

    .card-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 8px;
    }

    .card-badge-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #00d4ff;
      animation: ledPulse 2s ease-in-out infinite;
    }

    @keyframes ledPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 4px #00d4ff; }
      50%      { opacity: 0.4; box-shadow: 0 0 2px #00d4ff; }
    }

    .card-artist {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-title {
      font-size: 10px;
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
      margin: 8px 0;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 8px;
    }

    .card-label {
      color: #00d4ff;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
    }

    .card-year {
      color: rgba(255,255,255,0.35);
      font-weight: 500;
    }

    .card-meta-sep {
      color: rgba(255,255,255,0.15);
    }

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

      // Art
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

      // Meta (label + year)
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

function getPositionCSS(position: string): string {
  switch (position) {
    case 'bottom-right': return 'bottom: 40px; right: 40px;';
    case 'top-left':     return 'top: 40px; left: 40px;';
    case 'top-right':    return 'top: 40px; right: 40px;';
    case 'bottom-center': return 'bottom: 40px; left: 50%; transform: translateX(-50%);';
    case 'bottom-left':
    default:             return 'bottom: 40px; left: 40px;';
  }
}
