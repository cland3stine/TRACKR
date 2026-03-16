/**
 * TRACKR Overlay Theme — Hologram Disc
 *
 * Album art as a floating holographic projection with prismatic edges and light cone.
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(18deg) rotateX(-3deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const hologram: OverlayTheme = {
  id: 'hologram',
  name: 'Hologram Disc',
  description: 'Holographic projection with prismatic ring and light cone',
  canvas: 'both',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'materialize',

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
      previewCardWidth: 520,
      previewCardHeight: 900,
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
      text-rendering: geometricPrecision;
    }

    #overlay-root {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      perspective: 1800px;
    }

    .track-card {
      position: relative;
      width: 520px;
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

    /* ── Projector Beam ── */
    .holo-beam {
      width: 2px;
      height: 40px;
      margin: 0 auto 0;
      background: linear-gradient(to bottom, transparent, rgba(0,212,255,0.15));
    }

    /* ── Glass Panel ── */
    .card-inner {
      position: relative;
      border-radius: 24px;
      background: linear-gradient(165deg, rgba(20,20,28,0.72) 0%, rgba(14,14,20,0.80) 40%, rgba(10,10,16,0.85) 100%);
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
      box-shadow:
        0 4px 8px rgba(0,0,0,0.5),
        0 16px 40px rgba(0,0,0,0.5),
        0 40px 100px rgba(0,0,0,0.4),
        0 80px 200px rgba(0,0,0,0.3),
        inset 0 2px 0 rgba(255,255,255,0.06),
        inset 0 -2px 0 rgba(0,0,0,0.3);
    }

    /* ── Album Art with Prismatic Ring ── */
    .card-art-wrap {
      position: relative;
      width: 480px;
      height: 480px;
      margin: 20px auto 0;
      overflow: visible;
      ${opts.showArt ? '' : 'display: none;'}
    }
    .prismatic-ring {
      position: absolute;
      inset: -3px;
      border-radius: 18px;
      border: 3px solid transparent;
      background: linear-gradient(135deg, #ff0080, #00d4ff, #ff0080) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: hueRotate 8s linear infinite;
      box-shadow: 0 0 15px rgba(0,212,255,0.1), inset 0 0 10px rgba(0,212,255,0.05);
      z-index: 2;
    }
    @keyframes hueRotate {
      0%   { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }

    .card-art-container {
      position: relative;
      width: 480px;
      height: 480px;
      border-radius: 16px;
      overflow: hidden;
    }
    .card-art {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
      transition: opacity 0.4s ease;
    }
    .card-art-placeholder {
      width: 100%; height: 100%;
      background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(10,10,16,0.9));
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.15);
      font-size: 128px;
    }

    /* Holographic sheen overlay */
    .holo-sheen {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(0,212,255,0.05) 0%, transparent 40%, transparent 60%, rgba(255,0,128,0.03) 100%);
      pointer-events: none;
      z-index: 3;
    }

    /* Scan line */
    .holo-scanline {
      position: absolute;
      top: 0; bottom: 0;
      width: 30%;
      background: linear-gradient(90deg, transparent, rgba(0,212,255,0.08), transparent);
      pointer-events: none;
      z-index: 4;
      animation: scanSweep 3s ease-in-out infinite;
    }
    @keyframes scanSweep {
      0%   { left: -30%; }
      100% { left: 100%; }
    }

    /* ── Light Cone ── */
    .light-cone {
      width: 520px;
      height: 120px;
      margin: 0 auto;
      clip-path: polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%);
      background: rgba(0,212,255,0.05);
      animation: conePulse 4s ease-in-out infinite;
    }
    @keyframes conePulse {
      0%, 100% { opacity: 0.6; }
      50%      { opacity: 1; }
    }

    /* ── Track Info ── */
    .card-info {
      padding: 24px 38px 36px;
      text-align: center;
    }
    .card-badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 18px;
    }
    .card-badge-dot {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #00d4ff;
      animation: ledPulse 2s ease-in-out infinite;
    }
    @keyframes ledPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 10px #00d4ff; }
      50%      { opacity: 0.4; box-shadow: 0 0 5px #00d4ff; }
    }
    .card-artist {
      font-size: 35px; font-weight: 700; color: #ffffff;
      line-height: 1.2; margin-bottom: 7px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }
    .card-title {
      font-size: 26px; font-weight: 500; color: rgba(255,255,255,0.55);
      line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }
    .card-divider {
      width: 60%; height: 2px;
      background: rgba(255,255,255,0.08);
      margin: 18px auto;
    }
    .card-meta {
      display: flex; align-items: center; justify-content: center;
      gap: 14px; font-size: 20px;
    }
    .card-label { color: #00d4ff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
    .card-year { color: rgba(255,255,255,0.35); font-weight: 500; }
    .card-meta-sep { color: rgba(255,255,255,0.15); }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="holo-beam"></div>
      <div class="card-inner">
        <div class="card-art-wrap" id="artWrap">
          <div class="prismatic-ring"></div>
          <div class="card-art-container">
            <img class="card-art" id="artImg" src="" alt="" style="display:none;" />
            <div class="card-art-placeholder" id="artPlaceholder">&#9835;</div>
            <div class="holo-sheen"></div>
            <div class="holo-scanline"></div>
          </div>
        </div>
        <div class="light-cone" id="lightCone"></div>
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
      fitText(artistEl, [35, 30, 26, 22]);
      fitText(titleEl, [26, 22, 19, 16]);

      var artWrap = document.getElementById('artWrap');
      var artImg = document.getElementById('artImg');
      var artPlaceholder = document.getElementById('artPlaceholder');
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
      document.getElementById('lightCone').style.display = SHOW_ART ? '' : 'none';

      var hasLabel = SHOW_LABEL && data.label;
      var dateStr = data.releaseDate || (data.year ? String(data.year) : '');
      var hasYear = SHOW_YEAR && dateStr;
      var divider = document.getElementById('divider');
      var meta = document.getElementById('meta');

      if (hasLabel || hasYear) {
        divider.style.display = '';
        meta.style.display = '';
        document.getElementById('label').textContent = hasLabel ? data.label : '';
        document.getElementById('label').style.display = hasLabel ? '' : 'none';
        document.getElementById('year').textContent = hasYear ? fmtDate(dateStr) : '';
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
