// ─────────────────────────────────────────────────
// fetchProxy.js — MAIN World Network Interceptor & Caption Engine
// Sourced from Language Reactor architecture (pageScript_lly.min.js)
// 1. Intercepts fetch() and XHR for timedtext subtitle requests.
// 2. Proactively extracts official caption tracks from playerResponse
//    and fetches the entire video's JSON3 subtitles at page load.
// 3. Relays full subtitle data via postMessage to the isolated content script.
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

  let potTokens = {};
  let fetchedTracks = new Set();

  function isSubtitleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return SUBTITLE_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  function capturePotToken(url) {
    if (!url || typeof url !== 'string') return;
    if (url.includes('/timedtext?') || url.includes('/api/timedtext')) {
      try {
        const u = new URL(url, window.location.href);
        const pot = u.searchParams.get('pot');
        const v = u.searchParams.get('v');
        if (pot && v) potTokens[v] = pot;
      } catch (_) {}
    }
  }

  function relaySubtitleData(url, body) {
    if (!body || typeof body !== 'string' || body.trim().length === 0) return;
    const format = url.includes('fmt=json3') || body.trim().startsWith('{') ? 'json3' : 'xml';
    window.postMessage(
      {
        source: 'CODIREACTOR_MAIN_PROXY',
        type: 'CR_OFFICIAL_FULL_SUBTITLES',
        payload: {
          url,
          body,
          format,
          timestamp: Date.now(),
        },
      },
      '*'
    );
  }

  // 1. Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';

    capturePotToken(url);

    if (isSubtitleUrl(url)) {
      return originalFetch.apply(this, args).then((response) => {
        try {
          const clone = response.clone();
          clone.text().then((body) => {
            relaySubtitleData(url, body);
          }).catch(() => {});
        } catch (_) {}
        return response;
      });
    }

    return originalFetch.apply(this, args);
  };

  // 2. Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1];
    capturePotToken(typeof url === 'string' ? url : '');
    this._crTimedTextUrl = typeof url === 'string' && isSubtitleUrl(url) ? url : null;
    return originalOpen.apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._crTimedTextUrl) {
      this.addEventListener('load', function () {
        try {
          if (this.responseText) {
            relaySubtitleData(this._crTimedTextUrl, this.responseText);
          }
        } catch (_) {}
      });
    }
    return originalSend.apply(this, args);
  };

  // 3. Proactively retrieve and fetch full video subtitles at startup
  // Matches Language Reactor Je() architecture: downloads full JSON3 at video start
  async function probeAndFetchOfficialSubtitles() {
    try {
      const player = document.querySelector('#movie_player');
      const resp = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      const captionTracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        // Choose best track: English or default
        const track = captionTracks.find((t) => t.languageCode === 'en' || t.vssId?.includes('en')) || captionTracks[0];
        if (track?.baseUrl) {
          let fetchUrl = track.baseUrl.includes('fmt=') ? track.baseUrl : track.baseUrl + '&fmt=json3';
          const cacheKey = track.vssId || fetchUrl;
          if (fetchedTracks.has(cacheKey)) return;

          try {
            const u = new URL(fetchUrl, window.location.href);
            const v = u.searchParams.get('v');
            if (v && potTokens[v] && !fetchUrl.includes('&pot=')) {
              fetchUrl += '&c=WEB&pot=' + encodeURIComponent(potTokens[v]);
            }
          } catch (_) {}

          try {
            const res = await originalFetch(fetchUrl, { credentials: 'include' });
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim().length > 0) {
                fetchedTracks.add(cacheKey);
                relaySubtitleData(fetchUrl, text);
                return;
              }
            }
          } catch (e) {
            console.warn('[CodiReactor Proxy] Proactive subtitle fetch error:', e);
          }
        }
      }

      // Fallback: check player.getOption("captions", "tracklist")
      if (player?.getOption) {
        try {
          const list = player.getOption('captions', 'tracklist', { includeAsr: true });
          if (Array.isArray(list) && list.length > 0) {
            const track = list.find((t) => t.languageCode === 'en' || t.vss_id?.includes('en')) || list[0];
            if (track?.baseUrl) {
              let fetchUrl = track.baseUrl.includes('fmt=') ? track.baseUrl : track.baseUrl + '&fmt=json3';
              const cacheKey = track.vss_id || fetchUrl;
              if (!fetchedTracks.has(cacheKey)) {
                const res = await originalFetch(fetchUrl, { credentials: 'include' });
                if (res.ok) {
                  const text = await res.text();
                  if (text && text.trim().length > 0) {
                    fetchedTracks.add(cacheKey);
                    relaySubtitleData(fetchUrl, text);
                    return;
                  }
                }
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Poll proactively during video initialization (0s, 0.5s, 1s, 2s, 3s)
  probeAndFetchOfficialSubtitles();
  window.addEventListener('yt-navigate-finish', () => {
    fetchedTracks.clear();
    probeAndFetchOfficialSubtitles();
  });
  window.addEventListener('load', probeAndFetchOfficialSubtitles);
  setTimeout(probeAndFetchOfficialSubtitles, 500);
  setTimeout(probeAndFetchOfficialSubtitles, 1200);
  setTimeout(probeAndFetchOfficialSubtitles, 2500);

  console.log('[CodiReactor Proxy] MAIN world caption engine active');
})();
