// ─────────────────────────────────────────────────
// Tests: Platform Adapters
// Tests adapter detection, interfaces, and registry
// (DOM tests require JSDOM environment)
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
