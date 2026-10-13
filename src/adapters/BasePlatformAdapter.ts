// ─────────────────────────────────────────────────
// Base Platform Adapter Interface & Abstract Class
// All platform adapters (YouTube, Netflix, etc.)
// extend this common interface
// ─────────────────────────────────────────────────

import { SubtitleCue, CaptionTrack, LanguageOption } from '../core/types';

/** Adapter error codes */
export interface AdapterError {
  code: 'NO_VIDEO' | 'NO_CAPTIONS' | 'SEEK_FAILED' | 'DOM_CHANGED' | 'DRM_BLOCKED';
  message: string;
  recoverable: boolean;
}

/** Describes what the adapter can do on this platform */
export interface AdapterCapabilities {
  canInterceptSubtitles: boolean;
  canSeek: boolean;
  hasDRM: boolean;
  supportsMultipleTracks: boolean;
  canInjectControls: boolean;
}

/** UI elements to inject into the player */
export interface ControlElements {
  toggleButton?: HTMLElement;
  autoPauseButton?: HTMLElement;
  statusBadge?: HTMLElement;
}

/** Unsubscribe function */
export type Unsubscribe = () => void;

/**
 * Interface for all platform adapters.
 * Each adapter knows how to interact with a specific video platform.
 */
export interface IVideoPlatformAdapter {
  readonly platformId: 'youtube' | 'netflix' | 'udemy' | 'coursera' | 'generic' | 'webreader';

  // Lifecycle
  detect(): boolean;
  initialize(): Promise<void>;
  destroy(): void;

  // Video Control
  getVideoElement(): HTMLVideoElement | null;
  getScrubberContainer(): HTMLElement | null;
  getControlBarContainer(): HTMLElement | null;
  getOverlayMountPoint(): HTMLElement;

  // Caption Extraction
  extractCaptions(language?: string): Promise<CaptionTrack[]>;
  getAvailableLanguages(): Promise<LanguageOption[]>;
  onCaptionUpdate(callback: (cues: SubtitleCue[]) => void): Unsubscribe;

  // Time Control
  onTimeUpdate(callback: (currentTimeMs: number) => void): Unsubscribe;
  seekTo(timeMs: number): void;
  getCurrentTime(): number;

  // UI Injection
  injectControls(uiElements: ControlElements): void;
  injectTimelineMarkers(cues: SubtitleCue[]): void;

  // Error Handling
  onError(callback: (error: AdapterError) => void): Unsubscribe;
  getCapabilities(): AdapterCapabilities;
}

/**
 * Abstract base class providing common adapter functionality.
 * Concrete adapters extend this and implement platform-specific logic.
 */
export abstract class BasePlatformAdapter implements IVideoPlatformAdapter {
  abstract readonly platformId: IVideoPlatformAdapter['platformId'];

  protected errorCallbacks: Set<(error: AdapterError) => void> = new Set();
  protected captionCallbacks: Set<(cues: SubtitleCue[]) => void> = new Set();
  protected timeCallbacks: Set<(timeMs: number) => void> = new Set();
  protected cleanupFns: Array<() => void> = [];
  protected isInitialized = false;

  // ─── Abstract methods each adapter must implement ───

  abstract detect(): boolean;
  abstract getVideoElement(): HTMLVideoElement | null;
  abstract getScrubberContainer(): HTMLElement | null;
  abstract getControlBarContainer(): HTMLElement | null;
  abstract getOverlayMountPoint(): HTMLElement;
  abstract extractCaptions(language?: string): Promise<CaptionTrack[]>;
  abstract getAvailableLanguages(): Promise<LanguageOption[]>;
  abstract getCapabilities(): AdapterCapabilities;

  // ─── Shared implementations ─────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Set up high-precision video time tracking (60fps rAF + HTML5 event fallback)
    let lastDispatchedTime = -1;
    let animId: number | null = null;

    const dispatchTime = (rawTimeMs: number) => {
      // 50ms audio-lead compensation so subtitles appear in perfect sync with spoken audio
      const compensatedTimeMs = Math.round(rawTimeMs) + 50;
      if (Math.abs(compensatedTimeMs - lastDispatchedTime) >= 15) {
        lastDispatchedTime = compensatedTimeMs;
        for (const cb of this.timeCallbacks) {
          try { cb(compensatedTimeMs); } catch (e) { console.error('[Adapter] timeUpdate error:', e); }
        }
      }
    };

    const tick = () => {
      const v = this.getVideoElement();
      if (v && !v.paused) {
        dispatchTime(v.currentTime * 1000);
      }
      animId = requestAnimationFrame(tick);
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      animId = requestAnimationFrame(tick);
      this.cleanupFns.push(() => {
        if (animId !== null) cancelAnimationFrame(animId);
      });
    }

    const video = this.getVideoElement();
    if (video) {
      const onTimeUpdate = () => {
        dispatchTime(video.currentTime * 1000);
      };
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('seeked', onTimeUpdate);
      this.cleanupFns.push(() => {
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('seeked', onTimeUpdate);
      });
    }
  }

  destroy(): void {
    for (const fn of this.cleanupFns) {
      try { fn(); } catch { /* ignore */ }
    }
    this.cleanupFns = [];
    this.errorCallbacks.clear();
    this.captionCallbacks.clear();
    this.timeCallbacks.clear();
    this.isInitialized = false;
  }

  onCaptionUpdate(callback: (cues: SubtitleCue[]) => void): Unsubscribe {
    this.captionCallbacks.add(callback);
    return () => { this.captionCallbacks.delete(callback); };
  }

  onTimeUpdate(callback: (currentTimeMs: number) => void): Unsubscribe {
    this.timeCallbacks.add(callback);
    return () => { this.timeCallbacks.delete(callback); };
  }

  onError(callback: (error: AdapterError) => void): Unsubscribe {
    this.errorCallbacks.add(callback);
    return () => { this.errorCallbacks.delete(callback); };
  }

  seekTo(timeMs: number): void {
    const video = this.getVideoElement();
    if (video) {
      video.currentTime = timeMs / 1000;
    } else {
      this.emitError({ code: 'SEEK_FAILED', message: 'No video element found', recoverable: true });
    }
  }

  getCurrentTime(): number {
    const video = this.getVideoElement();
    return video ? video.currentTime * 1000 : 0;
  }

  injectControls(uiElements: ControlElements): void {
    const container = this.getControlBarContainer();
    if (!container) return;

    if (uiElements.toggleButton) {
      container.appendChild(uiElements.toggleButton);
      this.cleanupFns.push(() => uiElements.toggleButton?.remove());
    }
    if (uiElements.autoPauseButton) {
      container.appendChild(uiElements.autoPauseButton);
      this.cleanupFns.push(() => uiElements.autoPauseButton?.remove());
    }
    if (uiElements.statusBadge) {
      container.appendChild(uiElements.statusBadge);
      this.cleanupFns.push(() => uiElements.statusBadge?.remove());
    }
  }

  injectTimelineMarkers(cues: SubtitleCue[]): void {
    const scrubber = this.getScrubberContainer();
    if (!scrubber) return;

    const video = this.getVideoElement();
    if (!video || !video.duration) return;

    const durationMs = video.duration * 1000;
    const markerContainer = document.createElement('div');
    markerContainer.className = 'cr-timeline-markers';
    markerContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';

    for (const cue of cues) {
      const marker = document.createElement('div');
      const leftPercent = (cue.startMs / durationMs) * 100;
      marker.style.cssText = `position:absolute;left:${leftPercent}%;top:0;width:2px;height:100%;background:#2dd4bf;opacity:0.6;`;
      markerContainer.appendChild(marker);
    }

    scrubber.style.position = 'relative';
    scrubber.appendChild(markerContainer);
    this.cleanupFns.push(() => markerContainer.remove());
  }

  /** Emit an error to all registered callbacks */
  protected emitError(error: AdapterError): void {
    for (const cb of this.errorCallbacks) {
      try { cb(error); } catch { /* ignore */ }
    }
  }

  /** Emit extracted captions to all registered callbacks */
  protected emitCaptions(cues: SubtitleCue[]): void {
    for (const cb of this.captionCallbacks) {
      try { cb(cues); } catch { /* ignore */ }
    }
  }
}
