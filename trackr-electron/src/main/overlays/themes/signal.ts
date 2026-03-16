/**
 * TRACKR Overlay Theme — Signal Lock
 *
 * Military/radar targeting reticle locks onto album art.
 * Horizontal layout: art left, data readout right.
 * Landscape ONLY (too wide for portrait).
 * Renders at 4K (3840×2160) canvas — OBS downscales for sharpness.
 */

import { OverlayTheme, ThemeRenderOptions } from '../types';
import { buildTransitionCSS } from './transitions';
import { buildSharedJS } from './shared';

const RESTING_TRANSFORM = 'rotateY(18deg) rotateX(-3deg) rotateZ(-1deg)';
const ALL_TRANSITIONS = ['slide', 'digital', 'materialize', 'scale-pop', 'blur', 'edge-wipe'];

export const signal: OverlayTheme = {
  id: 'signal',
  name: 'Signal Lock',
  description: 'Targeting reticle with typewriter data readout',
  canvas: 'landscape',
  transitions: ALL_TRANSITIONS,
  defaultTransition: 'digital',

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
      previewCardWidth: 900,
      previewCardHeight: 520,
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
      width: 900px;
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
      display: flex;
      align-items: center;
      padding: 28px 36px;
      gap: 40px;
    }

    /* ── LEFT: Art + Targeting Reticle ── */
    .signal-art-area {
      position: relative;
      width: 420px;
      height: 420px;
      flex-shrink: 0;
      ${opts.showArt ? '' : 'display: none;'}
    }

    .card-art-wrap {
      position: relative;
      width: 420px;
      height: 420px;
      border-radius: 12px;
      overflow: hidden;
      z-index: 2;
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
      font-size: 100px;
    }

    /* Corner brackets */
    .bracket {
      position: absolute;
      width: 30px; height: 30px;
      z-index: 3;
    }
    .bracket::before, .bracket::after {
      content: '';
      position: absolute;
      background: rgba(0,212,255,0.5);
    }
    .bracket-tl { top: -6px; left: -6px; }
    .bracket-tl::before { top: 0; left: 0; width: 30px; height: 1.5px; }
    .bracket-tl::after  { top: 0; left: 0; width: 1.5px; height: 30px; }
    .bracket-tr { top: -6px; right: -6px; }
    .bracket-tr::before { top: 0; right: 0; width: 30px; height: 1.5px; }
    .bracket-tr::after  { top: 0; right: 0; width: 1.5px; height: 30px; }
    .bracket-bl { bottom: -6px; left: -6px; }
    .bracket-bl::before { bottom: 0; left: 0; width: 30px; height: 1.5px; }
    .bracket-bl::after  { bottom: 0; left: 0; width: 1.5px; height: 30px; }
    .bracket-br { bottom: -6px; right: -6px; }
    .bracket-br::before { bottom: 0; right: 0; width: 30px; height: 1.5px; }
    .bracket-br::after  { bottom: 0; right: 0; width: 1.5px; height: 30px; }

    .bracket-tl { animation: bracketPulse 2s ease-in-out infinite 0s; }
    .bracket-tr { animation: bracketPulse 2s ease-in-out infinite 0.5s; }
    .bracket-bl { animation: bracketPulse 2s ease-in-out infinite 1.0s; }
    .bracket-br { animation: bracketPulse 2s ease-in-out infinite 1.5s; }
    @keyframes bracketPulse {
      0%, 100% { opacity: 0.3; }
      50%      { opacity: 0.8; }
    }

    /* Entrance: brackets snap inward */
    .track-card.signal-entering .bracket-tl { animation: bracketSnapTL 200ms ease-out forwards; }
    .track-card.signal-entering .bracket-tr { animation: bracketSnapTR 200ms ease-out forwards; }
    .track-card.signal-entering .bracket-bl { animation: bracketSnapBL 200ms ease-out forwards; }
    .track-card.signal-entering .bracket-br { animation: bracketSnapBR 200ms ease-out forwards; }
    @keyframes bracketSnapTL { 0% { top: -26px; left: -26px; opacity: 0; } 100% { top: -6px; left: -6px; opacity: 0.5; } }
    @keyframes bracketSnapTR { 0% { top: -26px; right: -26px; opacity: 0; } 100% { top: -6px; right: -6px; opacity: 0.5; } }
    @keyframes bracketSnapBL { 0% { bottom: -26px; left: -26px; opacity: 0; } 100% { bottom: -6px; left: -6px; opacity: 0.5; } }
    @keyframes bracketSnapBR { 0% { bottom: -26px; right: -26px; opacity: 0; } 100% { bottom: -6px; right: -6px; opacity: 0.5; } }

    /* Scan circle */
    .scan-ring {
      position: absolute;
      inset: -16px;
      border-radius: 50%;
      border: 1px solid rgba(0,212,255,0.10);
      z-index: 1;
    }
    .scan-dot {
      position: absolute;
      top: -3px; left: 50%;
      width: 6px; height: 6px;
      margin-left: -3px;
      border-radius: 50%;
      background: rgba(0,212,255,0.6);
      box-shadow: 0 0 8px rgba(0,212,255,0.4);
      animation: scanRotate 4s linear infinite;
      transform-origin: 3px calc(50% + 16px + 210px);
    }
    /* The dot needs to orbit around the center of the ring */
    .scan-ring { animation: none; }
    .scan-dot-orbit {
      position: absolute;
      inset: 0;
      animation: orbitSpin 4s linear infinite;
    }
    @keyframes orbitSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .track-card.signal-entering .scan-dot-orbit { animation: orbitSpinFast 400ms linear, orbitSpin 4s linear 400ms infinite; }
    @keyframes orbitSpinFast { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* Crosshair lines */
    .crosshair-h, .crosshair-v {
      position: absolute;
      z-index: 1;
      background: rgba(0,212,255,0.08);
    }
    .crosshair-h {
      top: 50%; left: 0; right: 0;
      height: 1px;
      transform: translateY(-0.5px);
      mask-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, transparent 20%, transparent 80%, rgba(0,0,0,1) 100%);
      -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,1) 0%, transparent 20%, transparent 80%, rgba(0,0,0,1) 100%);
    }
    .crosshair-v {
      left: 50%; top: 0; bottom: 0;
      width: 1px;
      transform: translateX(-0.5px);
      mask-image: linear-gradient(180deg, rgba(0,0,0,1) 0%, transparent 20%, transparent 80%, rgba(0,0,0,1) 100%);
      -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,1) 0%, transparent 20%, transparent 80%, rgba(0,0,0,1) 100%);
    }

    /* ── RIGHT: Data Readout ── */
    .signal-data {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }

    .data-field {
      opacity: 0;
      transform: translateX(-4px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .data-field.visible {
      opacity: 1;
      transform: translateX(0);
    }

    .data-field-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(0,212,255,0.35);
      margin-bottom: 3px;
    }
    .data-field-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .field-artist .data-field-value {
      font-size: 28px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }
    .field-track .data-field-value {
      font-size: 20px;
      font-weight: 500;
      color: rgba(255,255,255,0.4);
    }
    .field-label .data-field-value {
      font-size: 18px;
      font-weight: 600;
      color: rgba(0,212,255,0.4);
    }
    .field-year .data-field-value {
      font-size: 18px;
      font-weight: 500;
      color: rgba(255,255,255,0.3);
    }

    /* Blinking cursor */
    .signal-cursor {
      display: inline-block;
      font-size: 18px;
      color: rgba(0,212,255,0.5);
      animation: cursorBlink 1s step-end infinite;
      margin-left: 2px;
    }
    @keyframes cursorBlink {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0; }
    }

    ${transitionCSS}
  </style>
</head>
<body>
  <div id="overlay-root">
    <div id="card" class="track-card hidden">
      <div class="card-inner">
        <!-- LEFT: Art + reticle -->
        <div class="signal-art-area" id="artArea">
          <div class="card-art-wrap" id="artWrap">
            <img class="card-art" id="artImg" src="" alt="" style="display:none;" />
            <div class="card-art-placeholder" id="artPlaceholder">&#9835;</div>
          </div>
          <div class="bracket bracket-tl"></div>
          <div class="bracket bracket-tr"></div>
          <div class="bracket bracket-bl"></div>
          <div class="bracket bracket-br"></div>
          <div class="scan-ring">
            <div class="scan-dot-orbit">
              <div style="position:absolute;top:-3px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:rgba(0,212,255,0.6);box-shadow:0 0 8px rgba(0,212,255,0.4);"></div>
            </div>
          </div>
          <div class="crosshair-h"></div>
          <div class="crosshair-v"></div>
        </div>

        <!-- RIGHT: Data readout -->
        <div class="signal-data">
          <div class="data-field field-artist" id="fieldArtist">
            <div class="data-field-label">ARTIST</div>
            <div class="data-field-value" id="artist"></div>
          </div>
          <div class="data-field field-track" id="fieldTrack">
            <div class="data-field-label">TRACK</div>
            <div class="data-field-value" id="title"></div>
          </div>
          <div class="data-field field-label" id="fieldLabel" style="display:none;">
            <div class="data-field-label">LABEL</div>
            <div class="data-field-value" id="label"></div>
          </div>
          <div class="data-field field-year" id="fieldYear" style="display:none;">
            <div class="data-field-label">RELEASED</div>
            <div class="data-field-value" id="year"></div>
          </div>
          <span class="signal-cursor" id="cursor">|</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    ${sharedJS}

    var fieldStaggerTimers = [];

    // Override showOverlay for signal-lock entrance sequence
    var _origShow = showOverlay;
    showOverlay = function() {
      var card = document.getElementById('card');
      // Hide all data fields initially
      ['fieldArtist','fieldTrack','fieldLabel','fieldYear'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('visible');
      });
      document.getElementById('cursor').style.display = 'none';

      if (card) card.classList.add('signal-entering');
      _origShow();

      // Clear previous timers
      fieldStaggerTimers.forEach(clearTimeout);
      fieldStaggerTimers = [];

      // Stagger data fields based on entrance time
      var fields = ['fieldArtist','fieldTrack','fieldLabel','fieldYear'];
      var delays = [ENTER_TIME * 0.25, ENTER_TIME * 0.40, ENTER_TIME * 0.55, ENTER_TIME * 0.70];
      fields.forEach(function(id, i) {
        var t = setTimeout(function() {
          var el = document.getElementById(id);
          if (el && el.style.display !== 'none') el.classList.add('visible');
        }, delays[i]);
        fieldStaggerTimers.push(t);
      });

      // Show cursor after all fields
      var ct = setTimeout(function() {
        document.getElementById('cursor').style.display = '';
        if (card) card.classList.remove('signal-entering');
      }, ENTER_TIME * 0.85);
      fieldStaggerTimers.push(ct);
    };

    // Override hideOverlay for reverse stagger
    var _origHide = hideOverlay;
    hideOverlay = function() {
      fieldStaggerTimers.forEach(clearTimeout);
      fieldStaggerTimers = [];

      var fields = ['fieldYear','fieldLabel','fieldTrack','fieldArtist'];
      var delay = 0;
      fields.forEach(function(id, i) {
        var t = setTimeout(function() {
          var el = document.getElementById(id);
          if (el) el.classList.remove('visible');
        }, i * 80);
        fieldStaggerTimers.push(t);
        delay = (i + 1) * 80;
      });
      document.getElementById('cursor').style.display = 'none';

      setTimeout(function() { _origHide(); }, delay);
    };

    function updateContent(data) {
      var artistEl = document.getElementById('artist');
      var titleEl = document.getElementById('title');
      artistEl.textContent = data.artist || '';
      titleEl.textContent = data.title || '';
      fitText(artistEl, [28, 24, 20, 17]);
      fitText(titleEl, [20, 17, 15, 13]);

      var artArea = document.getElementById('artArea');
      var artImg = document.getElementById('artImg');
      var artPlaceholder = document.getElementById('artPlaceholder');
      if (SHOW_ART && data.artUrl) {
        artImg.src = API_BASE + data.artUrl + '?t=' + Date.now();
        artImg.style.display = 'block';
        artPlaceholder.style.display = 'none';
        artArea.style.display = '';
      } else if (SHOW_ART) {
        artImg.style.display = 'none';
        artPlaceholder.style.display = 'flex';
        artArea.style.display = '';
      } else {
        artArea.style.display = 'none';
      }

      var hasLabel = SHOW_LABEL && data.label;
      var dateStr = data.releaseDate || (data.year ? String(data.year) : '');
      var hasYear = SHOW_YEAR && dateStr;
      var fieldLabel = document.getElementById('fieldLabel');
      var fieldYear = document.getElementById('fieldYear');

      if (hasLabel) {
        document.getElementById('label').textContent = data.label;
        fieldLabel.style.display = '';
      } else {
        fieldLabel.style.display = 'none';
      }
      if (hasYear) {
        document.getElementById('year').textContent = fmtDate(dateStr);
        fieldYear.style.display = '';
      } else {
        fieldYear.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
  },
};
