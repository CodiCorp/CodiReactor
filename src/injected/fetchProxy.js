// ─────────────────────────────────────────────────
// fetchProxy.js — MAIN World Network Interceptor
// Safely detects subtitle requests (YouTube timedtext,
// Netflix cadmium XML/vtt) and notifies content script
// ─────────────────────────────────────────────────

(function () {
  const SUBTITLE_URL_PATTERNS = [
    /timedtext/i,
    /api\/timedtext/i,
    /subtitle/i,
    /caption/i,
    /\.vtt(\?|$)/i,
    /\.srt(\?|$)/i,
    /\.ttml(\?|$)/i,
  ];

  function isSubtitleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return SUBTITLE_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  function notifySubtitleUrl(url) {
    window.postMessage(
      {
        source: 'CODIREACTOR_MAIN_PROXY',
        type: 'CODIREACTOR_CAPTIONS_INTERCEPTED',
        url: url,
        timestamp: Date.now(),
      },
      '*'
    );
  }

  // Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url;

    if (isSubtitleUrl(url)) {
      try {
        notifySubtitleUrl(url);
      } catch (err) {
        console.warn('[CodiReactor Proxy] Failed to notify subtitle fetch:', err);
      }
    }

    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1];
    if (isSubtitleUrl(url)) {
      try {
        notifySubtitleUrl(url);
      } catch (err) {
        console.warn('[CodiReactor Proxy] Failed to notify subtitle XHR:', err);
      }
    }
    return originalOpen.apply(this, args);
  };

  console.log('[CodiReactor Proxy] MAIN world fetch/XHR interceptor active');
})();
