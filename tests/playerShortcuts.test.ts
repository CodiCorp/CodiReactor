// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: PlayerShortcutEngine
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayerShortcutEngine, type ShortcutCallbacks } from '../src/ui/PlayerShortcuts';

let shortcuts: PlayerShortcutEngine;
let callbacks: ShortcutCallbacks;

function fireKey(key: string, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  document.dispatchEvent(event);
}

beforeEach(() => {
  callbacks = {
    seekToPrevCue: vi.fn(),
    replayCurrentCue: vi.fn(),
    seekToNextCue: vi.fn(),
    togglePlayPause: vi.fn(),
    toggleAutoPause: vi.fn(),
    saveCurrentSubtitle: vi.fn(),
    revealMaskedText: vi.fn(),
    decreasePlaybackRate: vi.fn(),
    increasePlaybackRate: vi.fn(),
    toggleOverlay: vi.fn(),
    toggleTranscript: vi.fn(),
  };
  shortcuts = new PlayerShortcutEngine(callbacks);
  shortcuts.enable();
});

afterEach(() => {
  shortcuts.destroy();
});

describe('PlayerShortcutEngine', () => {
  it('calls seekToPrevCue on "a" key', () => {
    fireKey('a');
    expect(callbacks.seekToPrevCue).toHaveBeenCalledTimes(1);
  });

  it('calls seekToNextCue on "d" key', () => {
    fireKey('d');
    expect(callbacks.seekToNextCue).toHaveBeenCalledTimes(1);
  });

  it('calls replayCurrentCue on "s" key', () => {
    fireKey('s');
    expect(callbacks.replayCurrentCue).toHaveBeenCalledTimes(1);
  });

  it('calls togglePlayPause on space key', () => {
    fireKey(' ');
    expect(callbacks.togglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('calls toggleAutoPause on "q" key', () => {
    fireKey('q');
    expect(callbacks.toggleAutoPause).toHaveBeenCalledTimes(1);
  });

  it('calls saveCurrentSubtitle on "r" key', () => {
    fireKey('r');
    expect(callbacks.saveCurrentSubtitle).toHaveBeenCalledTimes(1);
  });

  it('calls decreasePlaybackRate on "1" key', () => {
    fireKey('1');
    expect(callbacks.decreasePlaybackRate).toHaveBeenCalledTimes(1);
  });

  it('calls increasePlaybackRate on "2" key', () => {
    fireKey('2');
    expect(callbacks.increasePlaybackRate).toHaveBeenCalledTimes(1);
  });

  it('calls toggleOverlay on "l" key', () => {
    fireKey('l');
    expect(callbacks.toggleOverlay).toHaveBeenCalledTimes(1);
  });

  it('calls toggleTranscript on "t" key', () => {
    fireKey('t');
    expect(callbacks.toggleTranscript).toHaveBeenCalledTimes(1);
  });

  it('does not fire after destroy', () => {
    shortcuts.destroy();
    fireKey('a');
    expect(callbacks.seekToPrevCue).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', () => {
    shortcuts.disable();
    fireKey('a');
    expect(callbacks.seekToPrevCue).not.toHaveBeenCalled();
  });
});
