/**
 * TRACKR Overlay Theme — Liquid Pool
 *
 * Album art with rippling liquid reflection beneath it.
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(18deg) rotateX(-3deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const liquid: OverlayTheme = {
  id: 'liquid',
  name: 'Liquid Pool',
  description: 'Rippling liquid reflection beneath album art',
  canvas: 'both',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'slide',

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
      previewCardHeight: 980,
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

    /* ── Album Art (no bottom vignette) ── */
    .card-art-wrap {
      position: relative;
      width: 480px;
      height: 480px;
      margin: 20px auto 0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.4);
      ${opts.showArt ? '' : 'display: none;'}
    }
    .card-art {
      width: 100%; height: 100%;
      object-fit: cover; display: block;
      transition: opacity 0.4s ease;
    }
    .card-art-placeholder {
      width: 100%; height: 100%;
      background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(10,10,16,0.9));
      display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.15);
      font-size: 128px;
    }

    /* ── Reflection ── */
    .reflection-wrap {
      width: 480px;
      height: 190px;
      margin: 2px auto 0;
      overflow: hidden;
      position: relative;
      border-radius: 0 0 12px 12px;
      ${opts.showArt ? '' : 'display: none;'}
    }
    .reflection-img {
      width: 480px;
      height: 480px;
      object-fit: cover;
      display: block;
      transform: scaleY(-1);
      opacity: 0.06;
      animation: liquidWave 6s ease-in-out infinite;
    }
    .reflection-mask {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, transparent 0%, rgba(10,10,16,0.85) 60%, rgba(10,10,16,1) 100%);
      pointer-events: none;
    }
    @keyframes liquidWave {
      0%, 100% { transform: scaleY(-1) scaleX(0.98); }
      33%      { transform: scaleY(-1.03) scaleX(1.02); }
      66%      { transform: scaleY(-0.97) scaleX(0.99); }
    }

    /* ── Ripple Lines ── */
    .ripple-area {
      width: 480px;
      margin: 0 auto;
      padding: 6px 0;
      ${opts.showArt ? '' : 'display: none;'}
    }
    .ripple-line {
      height: 1px;
      margin: 7px 40px;
      background: linear-gradient(90deg, transparent, rgba(0,212,255,0.06), transparent);
      border-radius: 1px;
    }
    .ripple-line:nth-child(1) { animation: ripple1 4.2s ease-in-out infinite; }
    .ripple-line:nth-child(2) { animation: ripple2 3.6s ease-in-out infinite 0.8s; }
    .ripple-line:nth-child(3) { animation: ripple3 5.0s ease-in-out infinite 0.3s; }
    .ripple-line:nth-child(4) { animation: ripple4 3.8s ease-in-out infinite 1.2s; }
    @keyframes ripple1 { 0%, 100% { opacity: 0.4; transform: scaleX(1); } 50% { opacity: 0.8; transform: scaleX(1.01); } }
    @keyframes ripple2 { 0%, 100% { opacity: 0.5; transform: scaleX(1); } 50% { opacity: 1; transform: scaleX(1.008); } }
    @keyframes ripple3 { 0%, 100% { opacity: 0.3; transform: scaleX(1.005); } 50% { opacity: 0.7; transform: scaleX(1); } }
    @keyframes ripple4 { 0%, 100% { opacity: 0.6; transform: scaleX(1); } 50% { opacity: 0.35; transform: scaleX(1.01); } }

    /* ── Track Info ── */
    .card-info {
      padding: 24px 38px 36px;
      position: relative; z-index: 2;
    }
    .card-badge {
      display: inline-flex; align-items: center; gap: 12px;
      font-size: 17px; font-weight: 700; letter-spacing: 0.2em;
      text-transform: uppercase; color: rgba(255,255,255,0.5);
      margin-bottom: 18px;
    }
    .card-badge-dot {
      width: 12px; height: 12px; border-radius: 50%;
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
    .card-divider { width: 100%; height: 2px; background: rgba(255,255,255,0.08); margin: 21px 0; }
    .card-meta { display: flex; align-items: center; gap: 14px; font-size: 20px; }
    .card-label { color: #00d4ff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }
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
        <div class="reflection-wrap" id="reflectionWrap">
          <img class="reflection-img" id="reflectionImg" src="" alt="" />
          <div class="reflection-mask"></div>
        </div>
        <div class="ripple-area" id="rippleArea">
          <div class="ripple-line"></div>
          <div class="ripple-line"></div>
          <div class="ripple-line"></div>
          <div class="ripple-line"></div>
        </div>
        <div class="card-info">
          <div class="card-badge"><span class="card-badge-dot"></span> NOW PLAYING</div>
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
      var reflectionWrap = document.getElementById('reflectionWrap');
      var reflectionImg = document.getElementById('reflectionImg');
      var rippleArea = document.getElementById('rippleArea');

      if (SHOW_ART && data.artUrl) {
        var url = API_BASE + data.artUrl + '?t=' + Date.now();
        artImg.src = url;
        reflectionImg.src = url;
        artImg.style.display = 'block';
        artPlaceholder.style.display = 'none';
        artWrap.style.display = '';
        reflectionWrap.style.display = '';
        rippleArea.style.display = '';
      } else if (SHOW_ART) {
        artImg.style.display = 'none';
        artPlaceholder.style.display = 'flex';
        artWrap.style.display = '';
        reflectionWrap.style.display = 'none';
        rippleArea.style.display = '';
      } else {
        artWrap.style.display = 'none';
        reflectionWrap.style.display = 'none';
        rippleArea.style.display = 'none';
      }

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
