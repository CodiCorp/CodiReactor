// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: WebReader Adapter
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebReaderAdapter } from '../src/adapters/WebReaderAdapter';

describe('WebReaderAdapter', () => {
  let adapter: WebReaderAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    adapter = new WebReaderAdapter();
  });

  afterEach(() => {
    adapter.destroy();
  });

  it('detects web reader mode from data attribute', () => {
    expect(adapter.detect()).toBe(false);

    document.body.setAttribute('data-codireactor-reader', 'true');
    expect(adapter.detect()).toBe(true);
  });

  it('extracts paragraphs and splits them into subtitle cues', async () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <p>The quick brown fox jumps over the lazy dog. It was a sunny afternoon.</p>
      <p>Language learning requires consistent spaced repetition.</p>
    `;
    document.body.appendChild(article);

    const tracks = await adapter.extractCaptions('en');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].cues.length).toBeGreaterThanOrEqual(2);

    const firstCue = tracks[0].cues[0];
    expect(firstCue.plainText).toContain('The quick brown fox');
    expect(firstCue.startMs).toBe(0);
    expect(firstCue.endMs).toBeGreaterThan(0);
  });

  it('virtual seek updates current time and triggers time callbacks', () => {
    const timeSpy = vi.fn();
    adapter.onTimeUpdate(timeSpy);

    adapter.seekTo(3500);
    expect(timeSpy).toHaveBeenCalledWith(3500);
    expect(adapter.getCurrentTime()).toBe(3.5);
  });

  it('reports webreader capabilities correctly', () => {
    const caps = adapter.getCapabilities();
    expect(caps.canSeek).toBe(true);
    expect(caps.hasDRM).toBe(false);
    expect(caps.canInterceptSubtitles).toBe(true);
  });

  it('creates and returns overlay mount point element', () => {
    const mount = adapter.getOverlayMountPoint();
    expect(mount).not.toBeNull();
    expect(mount.id).toBe('codireactor-reader-overlay');
  });
});
