// ─────────────────────────────────────────────────
// YouTube Content Script Bootstrap
// Resilient SPA lifecycle, auto-retry, and navigation
// ─────────────────────────────────────────────────

import { ContentOrchestrator } from '../ui/ContentOrchestrator';

console.log(
  '%c[CodiReactor]%c Content script injected on YouTube: ' + window.location.href,
  'background: #a855f7; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
  'color: inherit;'
);

let currentOrchestrator: ContentOrchestrator | null = null;
let isBooting = false;

function isVideoContext(): boolean {
  return (
    window.location.pathname.includes('/watch') ||
    window.location.pathname.includes('/shorts/') ||
    window.location.pathname.includes('/live/') ||
    window.location.pathname.includes('/embed/') ||
    !!document.querySelector('#movie_player') ||
    !!document.querySelector('video')
  );
}

async function startOrchestrator() {
  if (isBooting) return;
  if (!isVideoContext()) return;
  isBooting = true;

  try {
    if (currentOrchestrator) {
      currentOrchestrator.destroy();
      currentOrchestrator = null;
    }

    console.log('[CodiReactor] Booting orchestrator on YouTube player...');
    currentOrchestrator = new ContentOrchestrator();
    await currentOrchestrator.boot();
  } catch (err) {
    console.error('[CodiReactor] YouTube boot error:', err);
  } finally {
    isBooting = false;
  }
}

// 1. Initial boot on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isVideoContext()) startOrchestrator();
  });
} else {
  if (isVideoContext()) startOrchestrator();
}

// 2. Handle YouTube SPA page transitions & Polymer events
const spaEvents = ['yt-navigate-finish', 'yt-page-data-updated', 'spfdone'];
for (const evt of spaEvents) {
  document.addEventListener(evt, () => {
    if (isVideoContext()) {
      setTimeout(() => startOrchestrator(), 350);
    }
  });
  window.addEventListener(evt, () => {
    if (isVideoContext()) {
      setTimeout(() => startOrchestrator(), 350);
    }
  });
}

window.addEventListener('popstate', () => {
  if (isVideoContext()) {
    setTimeout(() => startOrchestrator(), 350);
  }
});

// 3. Fallback watchdog: whenever on video page and pill is missing, mount it
setInterval(() => {
  if (isVideoContext()) {
    const pill = document.querySelector('.codireactor-control-pill');
    if (!pill && !isBooting) {
      const timeDisplay = document.querySelector('.ytp-time-display');
      const leftControls = document.querySelector('.ytp-left-controls');
      if (timeDisplay || leftControls) {
        console.log('[CodiReactor] Player ready but controls pill missing, mounting...');
        startOrchestrator();
      }
    }
  }
}, 1200);
