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

  detect(): boolean {
    return window.location.hostname.includes('youtube.com');
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Auto-hide YouTube's native subtitle overlay so it never overlaps
    this.setAutoHideNativeCaptions(true);

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

  async extractCaptions(language?: string): Promise<CaptionTrack[]> {
    const tracks: CaptionTrack[] = [];

    // Strategy 1: Try to get captions from video.textTracks
    const video = this.getVideoElement();
    if (video) {
      const textTracks = Array.from(video.textTracks || []);
      for (const track of textTracks) {
        if (language && track.language !== language) continue;
        if (track.cues) {
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
          tracks.push({
            language: track.language || 'und',
            languageName: track.label || track.language || 'Unknown',
            isAutoGenerated: track.label?.includes('auto') || false,
            cues,
          });
        }
      }
    }

    return tracks;
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
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.nonce !== this.fetchProxyNonce) return;
      if (event.data?.type !== 'CR_SUBTITLE_DATA') return;

      try {
        const { url, body, format } = event.data.payload;
        let cues: SubtitleCue[] = [];

        if (format === 'json3' && body) {
          cues = parseJSON3(JSON.parse(body));
        } else if (body) {
          cues = autoParseSubtitles(body);
        }

        if (cues.length > 0) {
          this.currentCues = cues;
          this.emitCaptions(cues);
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
   * Inject fetchProxy.js into the MAIN world to intercept YouTube's subtitle fetches.
   */
  private injectFetchProxy(): void {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const NONCE = '${this.fetchProxyNonce}';
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          
          if (url.includes('/api/timedtext') || url.includes('timedtext?')) {
            return originalFetch.apply(this, args).then(response => {
              const cloned = response.clone();
              cloned.text().then(body => {
                const format = url.includes('fmt=json3') ? 'json3' : 'vtt';
                window.postMessage({
                  nonce: NONCE,
                  type: 'CR_SUBTITLE_DATA',
                  payload: { url, body, format }
                }, '*');
              }).catch(() => {});
              return response;
            });
          }
          
          return originalFetch.apply(this, args);
        };
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

              // Only emit if the text actually changed
              const lastCue = this.currentCues[this.currentCues.length - 1];
              if (!lastCue || lastCue.text !== text) {
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
