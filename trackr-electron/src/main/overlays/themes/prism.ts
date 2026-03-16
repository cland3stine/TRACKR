/**
 * TRACKR Overlay Theme — Split Prism
 *
 * Album art split through chromatic prism — three color-channel layers
 * that slowly breathe apart and together.
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(18deg) rotateX(-3deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const prism: OverlayTheme = {
  id: 'prism',
  name: 'Split Prism',
  description: 'Chromatic aberration effect with breathing color layers',
  canvas: 'both',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'blur',

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
      previewCardWidth: 560,
      previewCardHeight: 850,
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
      width: 540px;
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

    /* ── Prism Art Area ── */
    .prism-art-wrap {
      position: relative;
      width: 500px;
      height: 500px;
      margin: 20px auto 0;
      ${opts.showArt ? '' : 'display: none;'}
    }

    /* Color channel layers */
    .prism-layer {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      overflow: hidden;
      mix-blend-mode: screen;
    }
    .prism-layer img {
      width: 100%; height: 100%;
      object-fit: cover; display: block;
    }
    .prism-layer-red {
      animation: breatheRed 4s ease-in-out infinite;
    }
    .prism-layer-red::after {
      content: '';
      position: absolute; inset: 0;
      background: rgba(255,50,50,0.12);
    }
    .prism-layer-cyan {
      animation: breatheCyan 4s ease-in-out infinite;
    }
    .prism-layer-cyan::after {
      content: '';
      position: absolute; inset: 0;
      background: rgba(0,212,200,0.10);
    }
    .prism-layer-blue {
      animation: breatheBlue 4s ease-in-out infinite;
    }
    .prism-layer-blue::after {
      content: '';
      position: absolute; inset: 0;
      background: rgba(80,80,255,0.10);
    }

    @keyframes breatheRed {
      0%, 100% { transform: translate(6px, -4px); }
      50%      { transform: translate(10px, -6px); }
    }
    @keyframes breatheCyan {
      0%, 100% { transform: translate(-4px, 2px); }
      50%      { transform: translate(-8px, 4px); }
    }
    @keyframes breatheBlue {
      0%, 100% { transform: translate(0px, 4px); }
      50%      { transform: translate(2px, 8px); }
    }

    /* Entrance: layers converge from dramatic separation */
    .track-card.entering .prism-layer-red  { animation: convergeRed  0.8s ease-out forwards; }
    .track-card.entering .prism-layer-cyan { animation: convergeCyan 0.8s ease-out forwards; }
    .track-card.entering .prism-layer-blue { animation: convergeBlue 0.8s ease-out forwards; }
    @keyframes convergeRed  { 0% { transform: translate(50px, -30px); opacity: 0.3; } 100% { transform: translate(6px, -4px); opacity: 1; } }
    @keyframes convergeCyan { 0% { transform: translate(-40px, 20px); opacity: 0.3; } 100% { transform: translate(-4px, 2px); opacity: 1; } }
    @keyframes convergeBlue { 0% { transform: translate(10px, 40px); opacity: 0.3; } 100% { transform: translate(0px, 4px); opacity: 1; } }

    /* Exit: layers split apart */
    .track-card.exiting .prism-layer-red  { animation: splitRed  0.5s ease-in forwards; }
    .track-card.exiting .prism-layer-cyan { animation: splitCyan 0.5s ease-in forwards; }
    .track-card.exiting .prism-layer-blue { animation: splitBlue 0.5s ease-in forwards; }
    @keyframes splitRed  { 0% { transform: translate(6px, -4px); } 100% { transform: translate(50px, -30px); opacity: 0.2; } }
    @keyframes splitCyan { 0% { transform: translate(-4px, 2px); } 100% { transform: translate(-40px, 20px); opacity: 0.2; } }
    @keyframes splitBlue { 0% { transform: translate(0px, 4px); } 100% { transform: translate(10px, 40px); opacity: 0.2; } }

    /* Center art (clean, no tint) */
    .prism-center {
      position: absolute;
      inset: 6px;
      border-radius: 12px;
      overflow: hidden;
      z-index: 2;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .prism-center img {
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

    /* ── Track Info ── */
    .card-info {
      padding: 28px 38px 36px;
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
        <div class="prism-art-wrap" id="artWrap">
          <div class="prism-layer prism-layer-red"><img id="artLayerR" src="" alt="" /></div>
          <div class="prism-layer prism-layer-cyan"><img id="artLayerC" src="" alt="" /></div>
          <div class="prism-layer prism-layer-blue"><img id="artLayerB" src="" alt="" /></div>
          <div class="prism-center">
            <img class="card-art" id="artImg" src="" alt="" style="display:none;" />
            <div class="card-art-placeholder" id="artPlaceholder">&#9835;</div>
          </div>
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

    // Override showOverlay/hideOverlay to add prism entrance/exit
    var _origShow = showOverlay;
    var _origHide = hideOverlay;

    showOverlay = function() {
      var card = document.getElementById('card');
      if (card) card.classList.add('entering');
      _origShow();
      setTimeout(function() {
        if (card) card.classList.remove('entering');
      }, 800);
    };

    hideOverlay = function() {
      var card = document.getElementById('card');
      if (card) card.classList.add('exiting');
      setTimeout(function() {
        _origHide();
        if (card) card.classList.remove('exiting');
      }, 100);
    };

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
      var layerR = document.getElementById('artLayerR');
      var layerC = document.getElementById('artLayerC');
      var layerB = document.getElementById('artLayerB');

      if (SHOW_ART && data.artUrl) {
        var url = API_BASE + data.artUrl + '?t=' + Date.now();
        artImg.src = url;
        layerR.src = url;
        layerC.src = url;
        layerB.src = url;
        artImg.style.display = 'block';
        artPlaceholder.style.display = 'none';
        layerR.parentElement.style.display = '';
        layerC.parentElement.style.display = '';
        layerB.parentElement.style.display = '';
        artWrap.style.display = '';
      } else if (SHOW_ART) {
        artImg.style.display = 'none';
        artPlaceholder.style.display = 'flex';
        layerR.parentElement.style.display = 'none';
        layerC.parentElement.style.display = 'none';
        layerB.parentElement.style.display = 'none';
        artWrap.style.display = '';
      } else {
        artWrap.style.display = 'none';
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
