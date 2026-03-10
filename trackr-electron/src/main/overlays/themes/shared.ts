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

    let currentTrackKey = '';
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
      if (key === currentTrackKey && isVisible) return;
      currentTrackKey = key;
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
    function startPreview() {
      const sampleTracks = [
        { artist: 'Luca Abayan', title: 'Prisma (Tonaco Extended Remix)', label: 'Colorize', year: 2025, artUrl: '' },
        { artist: 'Marsh', title: 'Eu Sei', label: 'Anjunadeep', year: 2024, artUrl: '' },
        { artist: 'Ben Böhmer', title: 'Beyond Beliefs', label: 'Anjunadeep', year: 2023, artUrl: '' },
      ];
      let i = 0;
      function cycle() {
        currentTrackKey = '';  // reset so handleTrackChange doesn't skip
        handleTrackChange(sampleTracks[i % sampleTracks.length]);
        i++;
        setTimeout(() => {
          hideOverlay();
          setTimeout(cycle, 1500);
        }, 3000);
      }
      setTimeout(cycle, 500);
    }

    // ── Init ──
    if (PREVIEW_MODE) {
      // Center overlay in preview viewport (ignore position setting)
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
