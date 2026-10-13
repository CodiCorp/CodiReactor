// ─────────────────────────────────────────────────
// YouTube Platform Adapter
// Extracts subtitles via fetch interception, DOM
// observation, and native TextTrack API
// ─────────────────────────────────────────────────

import { BasePlatformAdapter, AdapterCapabilities } from './BasePlatformAdapter';
import { SubtitleCue, CaptionTrack, LanguageOption } from '../core/types';
import { parseJSON3, parseVTT, parseYouTubeXML, autoParseSubtitles } from '../core/parser/subtitleParser';
import { cleanSubtitleText } from '../core/parser/sentenceSegmenter';

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
  private attachedSidebarEl: HTMLElement | null = null;
  private attachedCollapsedPillEl: HTMLElement | null = null;

  detect(): boolean {
    return window.location.hostname.includes('youtube.com');
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Do not hide YouTube's native subtitle until we are fully synchronized with authoritative track
    this.setAutoHideNativeCaptions(false);

    // Wait for the video element to be present
    await this.waitForElement(SELECTORS.video, 10000);

    // Set up layout styles for Default Mode (image copy 7.png) and Theater Mode (image copy 8.png)
    this.setupYouTubeLayoutStyles();

    // Set up caption extraction strategies
    this.setupFetchInterception();
    // Only schedule fallback DOM observer after official full-video fetch window (3500ms)
    setTimeout(() => {
      if (!this.hasAuthoritativeCaptions) {
        this.setupDOMCaptionObserver();
      }
    }, 3500);
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
    return (
      document.querySelector<HTMLVideoElement>(SELECTORS.video) ||
      document.querySelector<HTMLVideoElement>('video.html5-main-video') ||
      document.querySelector<HTMLVideoElement>('video')
    );
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
          const candidateUrls = [
            trackMeta.baseUrl.includes('fmt=') ? trackMeta.baseUrl : `${trackMeta.baseUrl}&fmt=json3`,
            trackMeta.baseUrl,
          ];

          for (const fetchUrl of candidateUrls) {
            try {
              const resp = await fetch(fetchUrl);
              if (resp.ok) {
                const text = await resp.text();
                let cues: SubtitleCue[] = [];
                if (text.trim().startsWith('{')) {
                  try { cues = parseJSON3(JSON.parse(text)); } catch { /* ignore */ }
                } else if (text.trim().startsWith('<')) {
                  cues = parseYouTubeXML(text);
                } else {
                  cues = autoParseSubtitles(text);
                }

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
            } catch (err) {
              console.warn('[YouTubeAdapter] Candidate timedtext fetch failed:', fetchUrl, err);
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
    // If we already received authoritative full-video captions from MAIN proxy:
    if (this.hasAuthoritativeCaptions && this.currentCues.length > 0) {
      return [{
        language: language || 'en',
        languageName: 'English',
        isAutoGenerated: false,
        cues: this.currentCues,
      }];
    }

    // Strategy 0: Direct official playerResponse caption track (100% accurate)
    const officialTracks = await this.getOfficialYouTubeCaptionTracks(language);
    if (officialTracks.length > 0) {
      this.hasAuthoritativeCaptions = true;
      this.currentCues = officialTracks[0].cues;
      return officialTracks;
    }

    // Proactive wait: Wait up to 3000ms for fetchProxy.js (MAIN world) to download and relay the full-video track!
    // As Language Reactor operates: it takes ~2-3 seconds at video start to load and structure the whole video's subtitles once.
    if (typeof window !== 'undefined') {
      const pollStart = Date.now();
      while (Date.now() - pollStart < 3000) {
        if (this.hasAuthoritativeCaptions && this.currentCues.length > 0) {
          return [{
            language: language || 'en',
            languageName: 'English',
            isAutoGenerated: false,
            cues: this.currentCues,
          }];
        }
        const retryTracks = await this.getOfficialYouTubeCaptionTracks(language);
        if (retryTracks.length > 0) {
          this.hasAuthoritativeCaptions = true;
          this.currentCues = retryTracks[0].cues;
          return retryTracks;
        }
        await new Promise(r => setTimeout(r, 150));
      }
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
          const rawCues: SubtitleCue[] = [];
          for (let i = 0; i < track.cues.length; i++) {
            const cue = track.cues[i] as VTTCue;
            const text = cleanSubtitleText(cue.text.replace(/<[^>]+>/g, ''));
            if (!text) continue;
            rawCues.push({
              id: `yt-track-${i}`,
              startMs: Math.round(cue.startTime * 1000),
              endMs: Math.round(cue.endTime * 1000),
              text,
            });
          }

          // Sort and clamp overlaps (Language Reactor parity)
          rawCues.sort((a, b) => a.startMs - b.startMs);
          for (let i = 1; i < rawCues.length; i++) {
            const prev = rawCues[i - 1];
            const cur = rawCues[i];
            if (prev.endMs > cur.startMs) {
              prev.endMs = cur.startMs;
            }
          }

          // Merge continuous crawling clauses (gap <= 10ms)
          const cues: SubtitleCue[] = [];
          for (let i = 0; i < rawCues.length; ) {
            const cur = rawCues[i];
            const next = rawCues[i + 1];
            const isCurComplete = /[.!?]$/.test(cur.text.trim());
            const hasNext = !!next;
            const isGapSmall = hasNext && (next.startMs - cur.endMs <= 10);

            if (!isCurComplete && hasNext && isGapSmall) {
              cues.push({
                id: `yt-track-${cues.length}`,
                startMs: cur.startMs,
                endMs: next.endMs,
                text: `${cur.text} ${next.text}`.trim(),
              });
              i += 2;
            } else {
              cues.push({
                ...cur,
                id: `yt-track-${cues.length}`,
              });
              i += 1;
            }
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
      if (event.source && event.source !== window) return;

      const isMainProxyMessage =
        event.data?.source === 'CODIREACTOR_MAIN_PROXY' &&
        event.data?.type === 'CR_OFFICIAL_FULL_SUBTITLES';

      const isInlineProxyMessage =
        event.data?.nonce === this.fetchProxyNonce &&
        (event.data?.type === 'CR_SUBTITLE_DATA' || event.data?.type === 'CR_OFFICIAL_TRACKS_AVAILABLE');

      if (!isMainProxyMessage && !isInlineProxyMessage) return;

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
                } else if (text.trim().startsWith('<')) {
                  cues = parseYouTubeXML(text);
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

      if (isMainProxyMessage || event.data?.type === 'CR_SUBTITLE_DATA') {
        try {
          const { body } = event.data.payload || {};
          let cues: SubtitleCue[] = [];

          if (body) {
            const trimmed = body.trim();
            if (trimmed.startsWith('{')) {
              try {
                cues = parseJSON3(JSON.parse(trimmed));
              } catch {
                cues = autoParseSubtitles(body);
              }
            } else if (trimmed.startsWith('<')) {
              cues = parseYouTubeXML(trimmed);
            } else {
              cues = autoParseSubtitles(body);
            }
          }

          if (cues.length > 0) {
            console.log(`[YouTubeAdapter] Authoritative full-video subtitles loaded (${cues.length} cues)`);
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
      }
    };

    window.addEventListener('message', onMessage);
    this.cleanupFns.push(() => window.removeEventListener('message', onMessage));
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

  /**
   * Repositions the right sidebar inside YouTube's active player container
  /**
   * Helper to detect if YouTube or the browser is currently in fullscreen mode.
   * Checks multiple signals:
   * 1. HTML5 document.fullscreenElement / webkitFullscreenElement
   * 2. ytd-watch-flexy[fullscreen] attribute
   * 3. #movie_player.ytp-fullscreen class
   * 4. document.body.ytp-fullscreen class
   * 5. document.body.cr-fullscreen class
   */
  private isFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const moviePlayer = document.querySelector('#movie_player');
    const fsElement = document.fullscreenElement || (document as any).webkitFullscreenElement;

    return Boolean(
      watchFlexy?.hasAttribute('fullscreen') ||
      moviePlayer?.classList.contains('ytp-fullscreen') ||
      document.body?.classList.contains('ytp-fullscreen') ||
      document.body?.classList.contains('cr-fullscreen') ||
      fsElement != null
    );
  }

  /**
   * Repositions the CodiReactor sidebar depending on YouTube layout state:
   * - In Fullscreen Mode: COMPLETELY HIDES the sidebar (`display: none !important;`) so the
   *   video player takes 100% of the screen without any sidebar overlap or distortion.
   * - In Theater Mode: docks inside `#player-theater-container` alongside `#movie_player` (380px width).
   * - In Default Mode: docks inside `#secondary` above recommendations (100% width).
   * so its height matches the video player exactly (ref/image copy 7.png & image copy 8.png)
   * and never extends outside the player section into comments or recommendations.
   */
  repositionSidebar(sidebarEl: HTMLElement, collapsedPillEl?: HTMLElement): void {
    if (!sidebarEl) return;
    this.attachedSidebarEl = sidebarEl;
    if (collapsedPillEl) {
      this.attachedCollapsedPillEl = collapsedPillEl;
    }
    const pill = this.attachedCollapsedPillEl;

    // Ensure collapsed pill bar is always mounted at the top of #secondary
    const secondary =
      document.querySelector<HTMLElement>('#secondary.ytd-watch-flexy') ||
      document.querySelector<HTMLElement>('#secondary') ||
      document.querySelector<HTMLElement>('#secondary-inner');

    if (secondary && pill && pill.parentElement !== secondary) {
      if (secondary.firstChild) {
        secondary.insertBefore(pill, secondary.firstChild);
      } else {
        secondary.appendChild(pill);
      }
    }

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const isFullscreen = this.isFullscreen();

    // ─── 1. FULLSCREEN MODE: ALWAYS HIDE SIDEBAR & EXPAND VIDEO ───
    if (isFullscreen) {
      document.body.classList.add('cr-fullscreen');
      sidebarEl.style.setProperty('display', 'none', 'important');
      if (pill) pill.style.setProperty('display', 'none', 'important');
      return;
    } else {
      document.body.classList.remove('cr-fullscreen');
    }

    // ─── 2. CLOSED SIDEBAR: HIDE SIDEBAR & SHOW RE-ACTIVATION PILL ───
    const isClosed = document.body.classList.contains('cr-sidebar-closed');
    if (isClosed) {
      sidebarEl.style.setProperty('display', 'none', 'important');
      if (pill) pill.style.setProperty('display', 'flex', 'important');
      return;
    } else {
      sidebarEl.style.removeProperty('display');
      sidebarEl.style.display = 'flex';
      if (pill) pill.style.setProperty('display', 'none', 'important');
    }

    // ─── 3. THEATER MODE vs DEFAULT MODE DOCKING ───
    const isTheater = watchFlexy?.hasAttribute('theater');
    if (isTheater) {
      const theaterContainer =
        document.querySelector<HTMLElement>('#player-theater-container') ||
        document.querySelector<HTMLElement>('#full-bleed-container');
      if (theaterContainer && sidebarEl.parentElement !== theaterContainer) {
        theaterContainer.appendChild(sidebarEl);
        window.dispatchEvent(new Event('resize'));
      }
      if (theaterContainer) {
        sidebarEl.style.width = '380px';
        sidebarEl.style.minWidth = '380px';
        sidebarEl.style.maxWidth = '380px';
        sidebarEl.style.height = '100%';
        sidebarEl.style.marginBottom = '0';
      }
    } else {
      // Language Reactor Parity for Default Mode (ref/image copy 7.png):
      // $("#secondary.ytd-watch-flexy").prepend(sidebar)
      const video = this.getVideoElement();
      const targetHeight = Math.max(video?.offsetHeight || 0, 450);

      if (secondary && sidebarEl.parentElement !== secondary) {
        if (pill && pill.parentElement === secondary) {
          if (pill.nextSibling) {
            secondary.insertBefore(sidebarEl, pill.nextSibling);
          } else {
            secondary.appendChild(sidebarEl);
          }
        } else if (secondary.firstChild) {
          secondary.insertBefore(sidebarEl, secondary.firstChild);
        } else {
          secondary.appendChild(sidebarEl);
        }
        window.dispatchEvent(new Event('resize'));
      }

      sidebarEl.style.width = '100%';
      sidebarEl.style.minWidth = '100%';
      sidebarEl.style.maxWidth = '100%';
      sidebarEl.style.height = `${targetHeight}px`;
      sidebarEl.style.marginBottom = '12px';
    }
  }

  /**
   * Sets up responsive layout coordination for YouTube Default Mode (image copy 7.png)
   * and Theater Mode (image copy 8.png), completely suppressing ambient cinematics blur.
   */
  private setupYouTubeLayoutStyles(): void {
    const styleId = 'cr-youtube-layout-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ─── Suppress Ambient Blur Canvas Completely (Fixes blurred video screen) ─── */
      #cinematics,
      #cinematics-container,
      #cinematics-canvas,
      .ytd-watch-flexy[cinematics] #cinematics {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      #movie_player video.html5-main-video {
        filter: none !important;
      }

      /* ─── Theater Mode (ref/image copy 8.png): side-by-side inside player container ─── */
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #player-theater-container,
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container {
        display: flex !important;
        flex-direction: row !important;
        justify-content: flex-end !important;
        position: relative !important;
        overflow: visible !important;
      }

      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #player-theater-container #movie_player,
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container #movie_player,
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container #player-container {
        width: calc(100% - 380px) !important;
        max-width: calc(100% - 380px) !important;
        height: 100% !important;
        position: relative !important;
        z-index: 10 !important;
        order: 1 !important;
        flex: 1 1 auto !important;
      }

      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #player-theater-container #codireactor-sidebar-root,
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container #codireactor-sidebar-root {
        width: 380px !important;
        min-width: 380px !important;
        max-width: 380px !important;
        height: 100% !important;
        position: relative !important;
        top: 0 !important;
        right: 0 !important;
        z-index: 20 !important;
        order: 2 !important;
        border-left: 1px solid #1f1f1f !important;
        box-sizing: border-box !important;
        flex: 0 0 380px !important;
        display: flex !important;
      }

      /* When closed in theater mode, expand movie player back to 100% full width */
      body.cr-sidebar-closed ytd-watch-flexy[theater] #player-theater-container #movie_player,
      body.cr-sidebar-closed ytd-watch-flexy[theater] #full-bleed-container #movie_player,
      body.cr-sidebar-closed ytd-watch-flexy[theater] #full-bleed-container #player-container {
        width: 100% !important;
        max-width: 100% !important;
      }

      /* ─── Default Mode (ref/image copy 7.png): mounted inside #secondary above recommendations ─── */
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy:not([theater]):not([fullscreen]) #secondary #codireactor-sidebar-root,
      body:not(.cr-sidebar-closed):not(.cr-fullscreen) ytd-watch-flexy:not([theater]):not([fullscreen]) #secondary-inner #codireactor-sidebar-root {
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        margin-bottom: 12px !important;
        border: 1px solid #1f1f1f !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
        flex-shrink: 0 !important;
        display: flex !important;
      }

      /* When closed, hide sidebar completely everywhere */
      body.cr-sidebar-closed #codireactor-sidebar-root {
        display: none !important;
      }

      /* ─── Fullscreen mode: ALWAYS hide sidebar and expand movie player completely ─── */
      body.cr-fullscreen #codireactor-sidebar-root,
      ytd-watch-flexy[fullscreen] #codireactor-sidebar-root,
      #player-theater-container:fullscreen #codireactor-sidebar-root,
      #full-bleed-container:fullscreen #codireactor-sidebar-root,
      :fullscreen #codireactor-sidebar-root,
      :-webkit-full-screen #codireactor-sidebar-root,
      .ytp-fullscreen ~ #codireactor-sidebar-root,
      .ytp-fullscreen #codireactor-sidebar-root,
      #movie_player.ytp-fullscreen ~ #codireactor-sidebar-root,
      body.cr-fullscreen .cr-vv-toggle-in-sidebar,
      ytd-watch-flexy[fullscreen] .cr-vv-toggle-in-sidebar,
      .ytp-fullscreen ~ .cr-vv-toggle-in-sidebar {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }

      /* Movie player in fullscreen MUST take 100% width and height without any 380px deduction */
      body.cr-fullscreen #player-theater-container #movie_player,
      body.cr-fullscreen #full-bleed-container #movie_player,
      body.cr-fullscreen #full-bleed-container #player-container,
      ytd-watch-flexy[fullscreen] #player-theater-container #movie_player,
      ytd-watch-flexy[fullscreen] #full-bleed-container #movie_player,
      ytd-watch-flexy[fullscreen] #full-bleed-container #player-container,
      #movie_player.ytp-fullscreen {
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        left: 0 !important;
        top: 0 !important;
      }

      /* ─── Collapsed Pill Bar (ref/image 2): Subtitles (hidden) ▼ ─── */
      .cr-vv-toggle-in-sidebar {
        display: none;
        background: #181818 !important;
        font-size: 14px !important;
        font-family: 'Roboto', Arial, sans-serif !important;
        font-weight: 500 !important;
        padding: 7px 12px !important;
        margin-bottom: 10px !important;
        cursor: pointer !important;
        color: #f1f1f1 !important;
        border-radius: 4px !important;
        box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.3) !important;
        user-select: none !important;
        box-sizing: border-box !important;
        width: 100% !important;
        align-items: center !important;
        justify-content: space-between !important;
        transition: background 0.15s ease !important;
        direction: ltr !important;
      }

      .cr-vv-toggle-in-sidebar:hover {
        background: #242424 !important;
      }

      /* When sidebar is closed, display the collapsed pill bar */
      body.cr-sidebar-closed:not(.cr-fullscreen) .cr-vv-toggle-in-sidebar {
        display: flex !important;
      }

      /* When sidebar is active/open or in fullscreen, hide the collapsed pill bar */
      body:not(.cr-sidebar-closed) .cr-vv-toggle-in-sidebar,
      body.cr-fullscreen .cr-vv-toggle-in-sidebar {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    // Watch for theater mode / fullscreen toggles to trigger video resize & re-parent sidebar
    const onLayoutOrFullscreenChange = () => {
      const fs = this.isFullscreen();
      if (fs) {
        document.body.classList.add('cr-fullscreen');
      } else {
        document.body.classList.remove('cr-fullscreen');
      }
      if (this.attachedSidebarEl) {
        this.repositionSidebar(this.attachedSidebarEl, this.attachedCollapsedPillEl || undefined);
      }
      window.dispatchEvent(new Event('resize'));
    };

    // 1. Native HTML5 Fullscreen API events
    document.addEventListener('fullscreenchange', onLayoutOrFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onLayoutOrFullscreenChange);
    this.cleanupFns.push(() => {
      document.removeEventListener('fullscreenchange', onLayoutOrFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onLayoutOrFullscreenChange);
    });

    // 2. Watch ytd-watch-flexy for theater and fullscreen attribute mutations
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) {
      const watchObserver = new MutationObserver(() => onLayoutOrFullscreenChange());
      watchObserver.observe(watchFlexy, { attributes: true, attributeFilter: ['theater', 'fullscreen'] });
      this.cleanupFns.push(() => watchObserver.disconnect());
    }

    // 3. Watch #movie_player for class mutations (.ytp-fullscreen)
    const moviePlayer = document.querySelector('#movie_player');
    if (moviePlayer) {
      const playerObserver = new MutationObserver(() => onLayoutOrFullscreenChange());
      playerObserver.observe(moviePlayer, { attributes: true, attributeFilter: ['class'] });
      this.cleanupFns.push(() => playerObserver.disconnect());
    }

    // 4. Watch document.body for class mutations (.ytp-fullscreen)
    if (document.body) {
      const bodyObserver = new MutationObserver(() => onLayoutOrFullscreenChange());
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      this.cleanupFns.push(() => bodyObserver.disconnect());
    }
  }
}

