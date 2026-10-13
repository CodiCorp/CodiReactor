// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: Platform Adapters
// Tests adapter detection, interfaces, and registry
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasePlatformAdapter, AdapterCapabilities, AdapterError } from '../src/adapters/BasePlatformAdapter';
import type { SubtitleCue, CaptionTrack, LanguageOption } from '../src/core/types';

// ─── Mock Adapter for Testing ────────────────────

class MockAdapter extends BasePlatformAdapter {
  readonly platformId = 'generic' as const;
  private mockVideo: any = null;

  setMockVideo(video: any) { this.mockVideo = video; }

  detect(): boolean { return true; }

  getVideoElement(): HTMLVideoElement | null {
    return this.mockVideo;
  }

  getScrubberContainer(): HTMLElement | null { return null; }
  getControlBarContainer(): HTMLElement | null { return null; }

  getOverlayMountPoint(): HTMLElement {
    return { appendChild: vi.fn() } as any;
  }

  async extractCaptions(): Promise<CaptionTrack[]> { return []; }
  async getAvailableLanguages(): Promise<LanguageOption[]> { return []; }

  getCapabilities(): AdapterCapabilities {
    return {
      canInterceptSubtitles: true,
      canSeek: true,
      hasDRM: false,
      supportsMultipleTracks: true,
      canInjectControls: false,
    };
  }

  // Expose protected methods for testing
  testEmitCaptions(cues: SubtitleCue[]) { this.emitCaptions(cues); }
  testEmitError(error: AdapterError) { this.emitError(error); }
}

// ─── Tests ───────────────────────────────────────

describe('BasePlatformAdapter', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('detects platform correctly', () => {
    expect(adapter.detect()).toBe(true);
  });

  it('returns capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.canSeek).toBe(true);
    expect(caps.hasDRM).toBe(false);
    expect(caps.canInterceptSubtitles).toBe(true);
  });

  it('subscribes and emits caption updates', () => {
    const callback = vi.fn();
    adapter.onCaptionUpdate(callback);

    const cues: SubtitleCue[] = [
      { id: 'test-1', startMs: 0, endMs: 3000, text: 'Hello world' },
    ];

    adapter.testEmitCaptions(cues);
    expect(callback).toHaveBeenCalledWith(cues);
  });

  it('unsubscribes from caption updates', () => {
    const callback = vi.fn();
    const unsub = adapter.onCaptionUpdate(callback);

    unsub();
    adapter.testEmitCaptions([{ id: '1', startMs: 0, endMs: 1000, text: 'test' }]);

    expect(callback).not.toHaveBeenCalled();
  });

  it('subscribes and emits error events', () => {
    const callback = vi.fn();
    adapter.onError(callback);

    const error: AdapterError = {
      code: 'NO_VIDEO',
      message: 'Video not found',
      recoverable: true,
    };

    adapter.testEmitError(error);
    expect(callback).toHaveBeenCalledWith(error);
  });

  it('getCurrentTime returns 0 when no video', () => {
    expect(adapter.getCurrentTime()).toBe(0);
  });

  it('getCurrentTime returns video time in ms', () => {
    adapter.setMockVideo({ currentTime: 5.5 });
    expect(adapter.getCurrentTime()).toBe(5500);
  });

  it('seekTo sets video currentTime', () => {
    const mockVideo = { currentTime: 0 };
    adapter.setMockVideo(mockVideo);
    adapter.seekTo(3500);
    expect(mockVideo.currentTime).toBe(3.5);
  });

  it('seekTo emits error when no video', () => {
    const errorCallback = vi.fn();
    adapter.onError(errorCallback);
    adapter.seekTo(1000);
    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SEEK_FAILED' }),
    );
  });

  it('supports time update subscriptions', () => {
    const callback = vi.fn();
    adapter.onTimeUpdate(callback);

    // Simulate — in real adapter, this fires from video.timeupdate
    // For unit test, we verify subscription/unsubscription
    const unsub = adapter.onTimeUpdate(vi.fn());
    unsub();
  });

  it('destroys cleanly', () => {
    const captionCb = vi.fn();
    const timeCb = vi.fn();
    const errorCb = vi.fn();

    adapter.onCaptionUpdate(captionCb);
    adapter.onTimeUpdate(timeCb);
    adapter.onError(errorCb);

    adapter.destroy();

    // After destroy, callbacks should not fire
    adapter.testEmitCaptions([{ id: '1', startMs: 0, endMs: 1000, text: 'test' }]);
    expect(captionCb).not.toHaveBeenCalled();
  });

  it('exposes platformId', () => {
    expect(adapter.platformId).toBe('generic');
  });
});

// ─── Adapter Detection Registry ──────────────────

describe('Adapter Detection', () => {
  it('MockAdapter always detects', () => {
    const adapter = new MockAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it('adapter capabilities have all required fields', () => {
    const adapter = new MockAdapter();
    const caps = adapter.getCapabilities();

    expect(typeof caps.canInterceptSubtitles).toBe('boolean');
    expect(typeof caps.canSeek).toBe('boolean');
    expect(typeof caps.hasDRM).toBe('boolean');
    expect(typeof caps.supportsMultipleTracks).toBe('boolean');
    expect(typeof caps.canInjectControls).toBe('boolean');
  });
});

// ─── YouTubeAdapter Layout & Docking Tests ─────────

describe('YouTubeAdapter Layout & Docking', () => {
  let adapter: any;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('docks sidebar in #secondary in Default Mode matching Language Reactor', async () => {
    const { YouTubeAdapter } = await import('../src/adapters/YouTubeAdapter');
    adapter = new YouTubeAdapter();

    const watchFlexy = document.createElement('ytd-watch-flexy');
    const secondary = document.createElement('div');
    secondary.id = 'secondary';
    secondary.className = 'ytd-watch-flexy';
    const video = document.createElement('video');
    video.className = 'html5-main-video';
    Object.defineProperty(video, 'offsetHeight', { value: 480, configurable: true });

    document.body.appendChild(watchFlexy);
    document.body.appendChild(secondary);
    document.body.appendChild(video);

    const sidebarEl = document.createElement('div');
    sidebarEl.id = 'codireactor-sidebar-root';

    adapter.repositionSidebar(sidebarEl);

    expect(secondary.contains(sidebarEl)).toBe(true);
    expect(sidebarEl.style.width).toBe('100%');
    expect(sidebarEl.style.height).toBe('480px');
  });

  it('docks sidebar in #player-theater-container in Theater Mode matching Language Reactor', async () => {
    const { YouTubeAdapter } = await import('../src/adapters/YouTubeAdapter');
    adapter = new YouTubeAdapter();

    const watchFlexy = document.createElement('ytd-watch-flexy');
    watchFlexy.setAttribute('theater', '');
    const theaterContainer = document.createElement('div');
    theaterContainer.id = 'player-theater-container';

    document.body.appendChild(watchFlexy);
    document.body.appendChild(theaterContainer);

    const sidebarEl = document.createElement('div');
    sidebarEl.id = 'codireactor-sidebar-root';

    adapter.repositionSidebar(sidebarEl);

    expect(theaterContainer.contains(sidebarEl)).toBe(true);
    expect(sidebarEl.style.display).toBe('flex');
  });

  it('hides sidebar in Fullscreen Mode via watch-flexy attribute, movie_player class, or body class', async () => {
    const { YouTubeAdapter } = await import('../src/adapters/YouTubeAdapter');
    adapter = new YouTubeAdapter();

    const watchFlexy = document.createElement('ytd-watch-flexy');
    watchFlexy.setAttribute('fullscreen', '');
    document.body.appendChild(watchFlexy);

    const sidebarEl = document.createElement('div');
    sidebarEl.id = 'codireactor-sidebar-root';

    adapter.repositionSidebar(sidebarEl);

    expect(sidebarEl.style.display).toBe('none');
    expect(document.body.classList.contains('cr-fullscreen')).toBe(true);

    // Test fullscreen even when theater attribute is also present
    watchFlexy.setAttribute('theater', '');
    adapter.repositionSidebar(sidebarEl);
    expect(sidebarEl.style.display).toBe('none');

    // Test fullscreen via #movie_player.ytp-fullscreen
    watchFlexy.removeAttribute('fullscreen');
    watchFlexy.removeAttribute('theater');
    const moviePlayer = document.createElement('div');
    moviePlayer.id = 'movie_player';
    moviePlayer.className = 'html5-video-player ytp-fullscreen';
    document.body.appendChild(moviePlayer);

    adapter.repositionSidebar(sidebarEl);
    expect(sidebarEl.style.display).toBe('none');
    expect(document.body.classList.contains('cr-fullscreen')).toBe(true);

    // Cleanup movie player
    moviePlayer.remove();
    document.body.classList.remove('cr-fullscreen');
  });

  it('hides sidebar and displays collapsed pill bar in #secondary when closed', async () => {
    const { YouTubeAdapter } = await import('../src/adapters/YouTubeAdapter');
    adapter = new YouTubeAdapter();

    const watchFlexy = document.createElement('ytd-watch-flexy');
    watchFlexy.setAttribute('theater', '');
    const theaterContainer = document.createElement('div');
    theaterContainer.id = 'player-theater-container';
    const secondary = document.createElement('div');
    secondary.id = 'secondary';

    document.body.appendChild(watchFlexy);
    document.body.appendChild(theaterContainer);
    document.body.appendChild(secondary);

    const sidebarEl = document.createElement('div');
    sidebarEl.id = 'codireactor-sidebar-root';
    const pillEl = document.createElement('div');
    pillEl.className = 'cr-vv-toggle-in-sidebar';

    // Simulate sidebar closed
    document.body.classList.add('cr-sidebar-closed');
    adapter.repositionSidebar(sidebarEl, pillEl);

    expect(secondary.contains(pillEl)).toBe(true);
    expect(pillEl.style.display).toBe('flex');
    expect(sidebarEl.style.display).toBe('none');

    // Reopen sidebar
    document.body.classList.remove('cr-sidebar-closed');
    adapter.repositionSidebar(sidebarEl, pillEl);

    expect(pillEl.style.display).toBe('none');
    expect(sidebarEl.style.display).toBe('flex');
    expect(theaterContainer.contains(sidebarEl)).toBe(true);

    document.body.classList.remove('cr-sidebar-closed');
  });
});
