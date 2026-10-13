// ─────────────────────────────────────────────────
// YouTube Platform Adapter
// Extracts subtitles via fetch interception, DOM
// observation, and native TextTrack API
// ─────────────────────────────────────────────────

import { BasePlatformAdapter, AdapterCapabilities } from './BasePlatformAdapter';
import { SubtitleCue, CaptionTrack, LanguageOption } from '../core/types';
import { parseJSON3, parseVTT, autoParseSubtitles } from '../core/parser/subtitleParser';

// YouTube DOM selectors (stable across YouTube updates)
const SELECTORS = {
  video: '#movie_player video.html5-main-video, #movie_player video',
  player: '#movie_player',
  captionSegment: '.ytp-caption-segment',
  captionContainer: '.caption-window',
  rightControls: '.ytp-right-controls',
  progressBar: '.ytp-progress-bar',
  searchForm: '#search-form',
} as const;

export class YouTubeAdapter extends BasePlatformAdapter {
  readonly platformId = 'youtube' as const;

  private captionObserver: MutationObserver | null = null;
  private controlsObserver: MutationObserver | null = null;
  private controlsInterval: any = null;
  private savedControls: ControlElements | null = null;
  private fetchProxyNonce: string = '';
  private currentCues: SubtitleCue[] = [];
  private hasAuthoritativeCaptions: boolean = false;

  detect(): boolean {
    return window.location.hostname.includes('youtube.com');
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Do not hide YouTube's native subtitle until we are fully synchronized with authoritative track
    this.setAutoHideNativeCaptions(false);

    // Wait for the video element to be present
    await this.waitForElement(SELECTORS.video, 10000);

    // Set up caption extraction strategies
    this.setupFetchInterception();
    this.setupDOMCaptionObserver();
  }

  /**
   * Hide or show YouTube native subtitle DOM elements
   */
  setAutoHideNativeCaptions(enable: boolean): void {
    const styleId = 'cr-suppress-native-captions';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (enable) {
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .caption-window,
          .ytp-caption-window-bottom,
          .ytp-caption-segment,
          .ytp-caption-window-rollup {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }
    } else {
      style?.remove();
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>(SELECTORS.video);
  }

  getScrubberContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SELECTORS.progressBar);
  }

  getControlBarContainer(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('.ytp-time-display') ||
      document.querySelector<HTMLElement>('.ytp-left-controls') ||
      document.querySelector<HTMLElement>(SELECTORS.rightControls)
    );
  }

  override injectControls(uiElements: ControlElements): void {
    this.savedControls = uiElements;
    this.mountControls();
    this.setupControlsWatcher();
  }

  private mountControls(): boolean {
    if (!this.savedControls) return false;

    // Check if already mounted and still connected in DOM
    const existing = document.querySelector('.codireactor-yt-controls-wrapper');
    if (existing && document.body.contains(existing)) {
      return true;
    }
    if (existing) existing.remove();

    const timeDisplay = document.querySelector<HTMLElement>('.ytp-time-display');
    const leftControls = document.querySelector<HTMLElement>('.ytp-left-controls');
    const rightControls = document.querySelector<HTMLElement>(SELECTORS.rightControls);

    if (!timeDisplay && !leftControls && !rightControls) {
      return false;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'codireactor-yt-controls-wrapper';
    wrapper.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      vertical-align: middle !important;
      height: 100% !important;
      margin: 0 6px !important;
      gap: 4px !important;
      z-index: 1000 !important;
      user-select: none !important;
      flex-shrink: 0 !important;
    `;

    if (this.savedControls.toggleButton) wrapper.appendChild(this.savedControls.toggleButton);
    if (this.savedControls.autoPauseButton) wrapper.appendChild(this.savedControls.autoPauseButton);
    if (this.savedControls.statusBadge) wrapper.appendChild(this.savedControls.statusBadge);

    if (timeDisplay && timeDisplay.parentNode) {
      if (timeDisplay.nextSibling) {
        timeDisplay.parentNode.insertBefore(wrapper, timeDisplay.nextSibling);
      } else {
        timeDisplay.parentNode.appendChild(wrapper);
      }
      return true;
    } else if (leftControls) {
      leftControls.appendChild(wrapper);
      return true;
    } else if (rightControls) {
      rightControls.insertBefore(wrapper, rightControls.firstChild);
      return true;
    }

    return false;
  }

  private setupControlsWatcher(): void {
    if (this.controlsObserver) return;

    const target = document.querySelector(SELECTORS.player) || document.body;
    this.controlsObserver = new MutationObserver(() => {
      const existing = document.querySelector('.codireactor-yt-controls-wrapper');
      if (!existing || !document.body.contains(existing)) {
        this.mountControls();
      }
    });
    this.controlsObserver.observe(target, { childList: true, subtree: true });

    this.controlsInterval = setInterval(() => {
      const existing = document.querySelector('.codireactor-yt-controls-wrapper');
      if (!existing || !document.body.contains(existing)) {
        this.mountControls();
      }
    }, 1000);
  }

  getOverlayMountPoint(): HTMLElement {
    const player = document.querySelector<HTMLElement>(SELECTORS.player);
    if (player) return player;

    // Fallback: create mount point above video
    const video = this.getVideoElement();
    if (video?.parentElement) return video.parentElement;

    return document.body;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      canInterceptSubtitles: true,
      canSeek: true,
      hasDRM: false,
      supportsMultipleTracks: true,
      canInjectControls: true,
    };
  }

  /**
   * Strategy 0 (Primary): Extract official YouTube timedtext track from playerResponse
   */
  async getOfficialYouTubeCaptionTracks(language?: string): Promise<CaptionTrack[]> {
    try {
      const player = document.querySelector<any>('#movie_player');
      let playerResponse = player?.getPlayerResponse?.() || (window as any).ytInitialPlayerResponse;

      // Fallback: inspect script tags in page DOM if not on window
      if (!playerResponse) {
        const scripts = document.querySelectorAll('script');
        for (const s of Array.from(scripts)) {
          if (s.textContent && s.textContent.includes('ytInitialPlayerResponse')) {
            const match = s.textContent.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
            if (match) {
              try {
                playerResponse = JSON.parse(match[1]);
                break;
              } catch { /* continue */ }
            }
          }
        }
      }

      const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        // Find requested language, or English, or default track
        const trackMeta = (language
          ? captionTracks.find((t: any) => t.languageCode === language || t.vssId?.includes(language))
          : null) ||
          captionTracks.find((t: any) => t.languageCode === 'en' || t.vssId?.includes('en')) ||
          captionTracks[0];

        if (trackMeta?.baseUrl) {
          const fetchUrl = trackMeta.baseUrl.includes('fmt=') ? trackMeta.baseUrl : `${trackMeta.baseUrl}&fmt=json3`;
          const resp = await fetch(fetchUrl);
          if (resp.ok) {
            const json = await resp.json();
            const cues = parseJSON3(json);
            if (cues.length > 0) {
              this.hasAuthoritativeCaptions = true;
              // Kill DOM observer — official track is authoritative
              if (this.captionObserver) {
                this.captionObserver.disconnect();
                this.captionObserver = null;
              }
              return [{
                language: trackMeta.languageCode || 'en',
                languageName: trackMeta.name?.simpleText || trackMeta.languageCode || 'English',
                isAutoGenerated: trackMeta.kind === 'asr',
                cues,
              }];
            }
          }
        }
      }
    } catch (err) {
      console.warn('[YouTubeAdapter] Note: could not fetch playerResponse captions, falling back to TextTrack:', err);
    }
    return [];
  }

  async extractCaptions(language?: string): Promise<CaptionTrack[]> {
    // Strategy 0: Direct official playerResponse caption track (100% accurate)
    const officialTracks = await this.getOfficialYouTubeCaptionTracks(language);
    if (officialTracks.length > 0) {
      this.hasAuthoritativeCaptions = true;
      return officialTracks;
    }

    // Auto-trigger native CC button if available to load official timedtext/TextTrack
    try {
      const ccBtn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
      if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
        ccBtn.click();
      }
    } catch { /* ignore */ }

    // Strategy 1: Video TextTracks
    const video = this.getVideoElement();
    if (video) {
      const textTracks = Array.from(video.textTracks || []);
      for (const track of textTracks) {
        if (language && track.language !== language) continue;
        if (track.mode === 'disabled') {
          track.mode = 'hidden';
        }
        if (track.cues && track.cues.length > 0) {
          const cues: SubtitleCue[] = [];
          for (let i = 0; i < track.cues.length; i++) {
            const cue = track.cues[i] as VTTCue;
            cues.push({
              id: `yt-track-${i}`,
              startMs: cue.startTime * 1000,
              endMs: cue.endTime * 1000,
              text: cue.text.replace(/<[^>]+>/g, ''),
            });
          }
          if (cues.length > 0) {
            this.hasAuthoritativeCaptions = true;
            // Kill DOM observer — TextTrack is authoritative
            if (this.captionObserver) {
              this.captionObserver.disconnect();
              this.captionObserver = null;
            }
            return [{
              language: track.language || 'und',
              languageName: track.label || track.language || 'Unknown',
              isAutoGenerated: track.label?.includes('auto') || false,
              cues,
            }];
          }
        }
      }
    }

    return [];
  }

  async getAvailableLanguages(): Promise<LanguageOption[]> {
    const video = this.getVideoElement();
    if (!video) return [];

    const languages: LanguageOption[] = [];
    const textTracks = Array.from(video.textTracks || []);

    for (const track of textTracks) {
      languages.push({
        code: track.language || 'und',
        name: track.label || track.language || 'Unknown',
        isAutoGenerated: track.label?.toLowerCase().includes('auto') || false,
      });
    }

    return languages;
  }

  override destroy(): void {
    if (this.controlsObserver) {
      this.controlsObserver.disconnect();
      this.controlsObserver = null;
    }
    if (this.controlsInterval) {
      clearInterval(this.controlsInterval);
      this.controlsInterval = null;
    }
    const existing = document.querySelector('.codireactor-yt-controls-wrapper');
    if (existing) existing.remove();
    this.savedControls = null;

    if (this.captionObserver) {
      this.captionObserver.disconnect();
      this.captionObserver = null;
    }
    this.setAutoHideNativeCaptions(false);
    super.destroy();
  }

  // ─── Private: Fetch Interception ─────────────────

  /**
   * Inject a MAIN-world script that intercepts YouTube's fetch() calls
   * for timedtext API and relays subtitle data back via postMessage.
   */
  private setupFetchInterception(): void {
    this.fetchProxyNonce = crypto.randomUUID();

    // Listen for relayed subtitle data from the MAIN world script
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.nonce !== this.fetchProxyNonce) return;

      if (event.data?.type === 'CR_OFFICIAL_TRACKS_AVAILABLE') {
        const { captionTracks } = event.data.payload || {};
        if (Array.isArray(captionTracks) && captionTracks.length > 0 && !this.hasAuthoritativeCaptions) {
          try {
            const track = captionTracks.find((t: any) => t.languageCode === 'en' || t.vssId?.includes('en')) || captionTracks[0];
            if (track?.baseUrl) {
              const fetchUrl = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
              const resp = await fetch(fetchUrl);
              if (resp.ok) {
                const text = await resp.text();
                let cues: SubtitleCue[] = [];
                if (text.trim().startsWith('{')) {
                  cues = parseJSON3(JSON.parse(text));
                } else {
                  cues = autoParseSubtitles(text);
                }
                if (cues.length > 0) {
                  this.hasAuthoritativeCaptions = true;
                  this.currentCues = cues;
                  this.emitCaptions(cues);
                  if (this.captionObserver) {
                    this.captionObserver.disconnect();
                    this.captionObserver = null;
                  }
                  this.setAutoHideNativeCaptions(true);
                  return;
                }
              }
            }
          } catch (e) {
            console.warn('[YouTubeAdapter] Error fetching official track from playerResponse:', e);
          }
        }
      }

      if (event.data?.type !== 'CR_SUBTITLE_DATA') return;

      try {
        const { url, body, format } = event.data.payload;
        let cues: SubtitleCue[] = [];

        if (body) {
          const trimmed = body.trim();
          if (trimmed.startsWith('{')) {
            try {
              cues = parseJSON3(JSON.parse(trimmed));
            } catch {
              cues = autoParseSubtitles(body);
            }
          } else {
            cues = autoParseSubtitles(body);
          }
        }

        if (cues.length > 0) {
          this.hasAuthoritativeCaptions = true;
          this.currentCues = cues;
          this.emitCaptions(cues);
          // Official track captured — kill DOM observer to prevent any synthetic pollution
          if (this.captionObserver) {
            this.captionObserver.disconnect();
            this.captionObserver = null;
          }
          this.setAutoHideNativeCaptions(true);
        }
      } catch (err) {
        console.error('[YouTubeAdapter] Error parsing intercepted subtitles:', err);
      }
    };

    window.addEventListener('message', onMessage);
    this.cleanupFns.push(() => window.removeEventListener('message', onMessage));

    // Inject the MAIN world fetch proxy script
    this.injectFetchProxy();
  }

  /**
   * Inject fetchProxy into the MAIN world to intercept YouTube's subtitle fetches and playerResponse.
   */
  private injectFetchProxy(): void {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const NONCE = '${this.fetchProxyNonce}';
        const originalFetch = window.fetch;

        function relaySubtitle(url, body) {
          if (!body) return;
          const format = url.includes('fmt=json3') || body.trim().startsWith('{') ? 'json3' : 'xml';
          window.postMessage({
            nonce: NONCE,
            type: 'CR_SUBTITLE_DATA',
            payload: { url, body, format }
          }, '*');
        }

        // Intercept window.fetch
        window.fetch = function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          
          if (url.includes('/api/timedtext') || url.includes('timedtext?')) {
            return originalFetch.apply(this, args).then(response => {
              const cloned = response.clone();
              cloned.text().then(body => {
                relaySubtitle(url, body);
              }).catch(() => {});
              return response;
            });
          }
          
          return originalFetch.apply(this, args);
        };

        // Intercept XMLHttpRequest
        const origXhrOpen = XMLHttpRequest.prototype.open;
        const origXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this._crTimedTextUrl = typeof url === 'string' && (url.includes('/api/timedtext') || url.includes('timedtext?')) ? url : null;
          return origXhrOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          if (this._crTimedTextUrl) {
            this.addEventListener('load', function() {
              try {
                relaySubtitle(this._crTimedTextUrl, this.responseText);
              } catch (_) {}
            });
          }
          return origXhrSend.apply(this, args);
        };

        // Probe official playerResponse caption tracks
        function probeOfficialTracks() {
          try {
            const player = document.querySelector('#movie_player');
            const resp = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
            const captionTracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(captionTracks) && captionTracks.length > 0) {
              window.postMessage({
                nonce: NONCE,
                type: 'CR_OFFICIAL_TRACKS_AVAILABLE',
                payload: { captionTracks }
              }, '*');
            }
          } catch (_) {}
        }

        probeOfficialTracks();
        window.addEventListener('yt-navigate-finish', probeOfficialTracks);
        window.addEventListener('load', probeOfficialTracks);
        setTimeout(probeOfficialTracks, 1000);
        setTimeout(probeOfficialTracks, 3000);
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Clean up script tag after execution
  }

  // ─── Private: DOM Caption Observer ───────────────

  /**
   * Fallback: Watch YouTube's rendered caption DOM for changes.
   * Used when fetch interception misses subtitles.
   */
  private setupDOMCaptionObserver(): void {
    const observeTarget = document.querySelector(SELECTORS.player) || document.body;

    this.captionObserver = new MutationObserver((mutations) => {
      // If we already have authoritative official YouTube subtitles, never let DOM scrapers pollute them!
      if (this.hasAuthoritativeCaptions) return;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const segments = document.querySelectorAll(SELECTORS.captionSegment);
          if (segments.length > 0) {
            const text = Array.from(segments).map(s => s.textContent || '').join(' ').trim();
            if (text.length > 0) {
              const video = this.getVideoElement();
              const currentMs = video ? video.currentTime * 1000 : 0;

              // Create a synthetic cue from the rendered DOM text
              const syntheticCue: SubtitleCue = {
                id: `yt-dom-${Date.now()}`,
                startMs: currentMs,
                endMs: currentMs + 5000,
                text,
              };

              // Only emit if not already present in recent cues (eliminates alternating ASR loop bug)
              const exists = this.currentCues.some(c =>
                c.text.toLowerCase().trim() === text.toLowerCase().trim() &&
                Math.abs(c.startMs - currentMs) < 90000
              );
              if (!exists) {
                this.currentCues.push(syntheticCue);
                this.emitCaptions([syntheticCue]);
              }
            }
          }
        }
      }
    });

    this.captionObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
    });
  }

  // ─── Private: Utility ────────────────────────────

  private waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const existing = document.querySelector<HTMLElement>(selector);
      if (existing) { resolve(existing); return; }

      const observer = new MutationObserver(() => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector<HTMLElement>(selector));
      }, timeoutMs);
    });
  }
}
