/**
 * TRACKR Overlay — Shared HTML boilerplate
 *
 * SSE connection, polling fallback, show/hide logic, and preview mode.
 * Injected into every theme's rendered HTML page.
 */

import { TRANSITION_META } from './transitions';

export interface SharedOptions {
  apiBaseUrl: string;
  displayDuration: number;
  position: string;
  transition: string;
  showLabel: boolean;
  showYear: boolean;
  showArt: boolean;
  preview: boolean;
  /** Approximate card width in CSS px (used for preview zoom calculation). */
  previewCardWidth: number;
  /** Approximate card height in CSS px (used for preview zoom calculation). */
  previewCardHeight: number;
}

/** Generate the shared JS block for overlay pages. */
export function buildSharedJS(opts: SharedOptions): string {
  const enterTime = TRANSITION_META[opts.transition]?.enterDuration ?? 700;
  const exitTime = TRANSITION_META[opts.transition]?.exitDuration ?? 500;

  return `
    const API_BASE = '${opts.apiBaseUrl}';
    const DISPLAY_DURATION = ${opts.displayDuration};
    const POSITION = '${opts.position}';
    const TRANSITION = '${opts.transition}';
    const SHOW_LABEL = ${opts.showLabel};
    const SHOW_YEAR = ${opts.showYear};
    const SHOW_ART = ${opts.showArt};
    const PREVIEW_MODE = ${opts.preview};
    const ENTER_TIME = ${enterTime};
    const EXIT_TIME = ${exitTime};
    const PREVIEW_CARD_W = ${opts.previewCardWidth};
    const PREVIEW_CARD_H = ${opts.previewCardHeight};

    // ── Font-size stepping for long text ──
    function fitText(el, sizes) {
      if (!el || !sizes.length) return;
      for (var i = 0; i < sizes.length; i++) {
        el.style.fontSize = sizes[i] + 'px';
        if (el.scrollWidth <= el.clientWidth || el.clientWidth === 0) return;
      }
    }

    let currentTrackKey = '';
    let currentArtUrl = '';
    let displayTimer = null;
    let isVisible = false;
    let sseConnected = false;

    // ── SSE Connection ──
    function connectSSE() {
      const es = new EventSource(API_BASE + '/overlay/events');

      es.addEventListener('track_change', (e) => {
        const data = JSON.parse(e.data);
        handleTrackChange(data);
      });

      es.addEventListener('show_card', (e) => {
        showOverlay();
      });

      es.addEventListener('hide_card', () => {
        hideOverlay();
      });

      es.addEventListener('config_changed', () => {
        window.location.reload();
      });

      es.onopen = () => { sseConnected = true; };
      es.onerror = () => {
        sseConnected = false;
        es.close();
        setTimeout(connectSSE, 3000);
      };
    }

    // ── Polling Fallback ──
    function startPolling() {
      setInterval(async () => {
        if (sseConnected) return;
        try {
          const res = await fetch(API_BASE + '/trackr');
          const data = await res.json();
          if (data.current && data.current !== '\\u2014') {
            const key = data.current;
            if (key !== currentTrackKey) {
              // Parse "Artist - Title" format from /trackr
              const sep = data.current.indexOf(' - ');
              const parsed = sep > 0
                ? { artist: data.current.substring(0, sep), title: data.current.substring(sep + 3) }
                : { artist: data.current, title: '' };
              if (data.enrichment) {
                parsed.label = data.enrichment.label;
                parsed.year = data.enrichment.year;
                if (data.enrichment.art_url) parsed.artUrl = data.enrichment.art_url;
              }
              handleTrackChange(parsed);
            }
          }
        } catch (e) {}
      }, 2000);
    }

    // ── Track Change Handler ──
    function handleTrackChange(data) {
      const key = (data.artist || '') + '|' + (data.title || '');
      const artUrl = data.artUrl || '';
      const hasNewEnrichment = (artUrl && artUrl !== currentArtUrl) || data.label || data.year;

      // Same track but enrichment arrived — update content silently (no re-entrance)
      if (key === currentTrackKey && isVisible) {
        if (hasNewEnrichment) {
          currentArtUrl = artUrl;
          updateContent(data);
        }
        return;
      }

      currentTrackKey = key;
      currentArtUrl = artUrl;
      updateContent(data);
      showOverlay();
    }

    // ── Show / Hide ──
    function showOverlay() {
      const card = document.getElementById('card');
      if (!card) return;

      // If already visible, just reset the timer
      if (isVisible) {
        clearTimeout(displayTimer);
        if (DISPLAY_DURATION > 0) {
          displayTimer = setTimeout(() => hideOverlay(), DISPLAY_DURATION * 1000);
        }
        return;
      }

      card.className = 'track-card ' + TRANSITION + '-in';
      isVisible = true;

      clearTimeout(displayTimer);

      // After entrance, switch to idle float
      setTimeout(() => {
        if (card.classList.contains(TRANSITION + '-in')) {
          card.className = 'track-card visible';
        }
      }, ENTER_TIME);

      // Schedule hide (if duration > 0)
      if (DISPLAY_DURATION > 0) {
        displayTimer = setTimeout(() => {
          hideOverlay();
        }, DISPLAY_DURATION * 1000);
      }
    }

    function hideOverlay() {
      const card = document.getElementById('card');
      if (!card) return;
      card.className = 'track-card ' + TRANSITION + '-out';

      setTimeout(() => {
        card.className = 'track-card hidden';
        isVisible = false;
      }, EXIT_TIME);
    }

    // ── Preview Mode ──
    let liveTrackData = null;

    function startPreview() {
      const placeholder = { artist: 'Artist Name', title: 'Track Title', label: 'Label', year: 2025, artUrl: '' };

      // Connect SSE to receive real track data for preview
      try {
        const es = new EventSource(API_BASE + '/overlay/events');
        es.addEventListener('track_change', (e) => {
          liveTrackData = JSON.parse(e.data);
        });
        es.onerror = () => { es.close(); };
      } catch (_) {}

      // Also try to fetch current track immediately
      fetch(API_BASE + '/trackr').then(r => r.json()).then(data => {
        if (data.current && data.current !== '\\u2014') {
          const sep = data.current.indexOf(' - ');
          const parsed = sep > 0
            ? { artist: data.current.substring(0, sep), title: data.current.substring(sep + 3) }
            : { artist: data.current, title: '' };
          if (data.enrichment) {
            parsed.label = data.enrichment.label;
            parsed.year = data.enrichment.year;
            if (data.enrichment.art_url) parsed.artUrl = data.enrichment.art_url;
          }
          liveTrackData = parsed;
        }
      }).catch(() => {});

      function cycle() {
        currentTrackKey = '';  // reset so handleTrackChange doesn't skip
        currentArtUrl = '';
        handleTrackChange(liveTrackData || placeholder);
        setTimeout(() => {
          hideOverlay();
          setTimeout(cycle, 1500);
        }, 4000);
      }
      setTimeout(cycle, 500);
    }

    // ── Init ──
    if (PREVIEW_MODE) {
      // Dark background for preview panels (OBS pages stay transparent)
      document.documentElement.style.background = '#050508';

      // Dynamic zoom: scale the entire page so the card fits the iframe viewport
      function fitPreview() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var s = Math.min((vw * 0.85) / PREVIEW_CARD_W, (vh * 0.85) / PREVIEW_CARD_H, 1);
        document.documentElement.style.zoom = String(s);
      }
      fitPreview();
      window.addEventListener('resize', fitPreview);

      // Center overlay in preview viewport
      const root = document.getElementById('overlay-root');
      if (root) {
        root.style.cssText += '; position: absolute !important; left: 50% !important; top: 50% !important; bottom: auto !important; right: auto !important; transform: translate(-50%, -50%) !important;';
      }
      startPreview();
    } else {
      connectSSE();
      startPolling();
    }
  `;
}
