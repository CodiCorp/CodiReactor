// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: OverlayManager 60FPS Spoken Word Highlighting
// and Atomic Singleton Balloon Lifecycle
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverlayManager } from '../src/ui/OverlayManager';
import { EnrichedToken } from '../src/core/types';

// Mock quickTranslation service for rapid testing
vi.mock('../src/services/quickTranslation', () => ({
  getQuickWordTranslation: vi.fn(async (word: string) => {
    // Add artificial delay to simulate async network/lookup latency
    await new Promise((r) => setTimeout(r, 10));
    return ['ترجمة_' + word, 'معنى_' + word];
  }),
  getCollocation: vi.fn(() => null),
  SEED_EN_AR: {},
}));

describe('OverlayManager - 60FPS Spoken Word Highlighting (Karaoke Style)', () => {
  let manager: OverlayManager;
  let mountContainer: HTMLElement;

  beforeEach(() => {
    mountContainer = document.createElement('div');
    document.body.appendChild(mountContainer);
    manager = new OverlayManager();
    manager.mount(mountContainer);
  });

  afterEach(() => {
    manager.unmount();
    mountContainer.remove();
    document.body.innerHTML = '';
  });

  it('renders all tokens with startMs and endMs and applies cr-speaking-word at 60fps', () => {
    const tokens: EnrichedToken[] = [
      {
        text: 'Welcome',
        cleanText: 'welcome',
        lemma: 'welcome',
        pos: 'verb',
        frequencyRank: 100,
        cefrLevel: 'A1',
        status: 'known',
        color: '#7df9c2',
        outline: false,
        isPunctuation: false,
        isWhitespace: false,
        startMs: 1000,
        endMs: 1500,
      },
      {
        text: ' ',
        cleanText: '',
        lemma: '',
        pos: '',
        frequencyRank: 0,
        cefrLevel: 'UNK',
        status: 'known',
        color: '',
        outline: false,
        isPunctuation: false,
        isWhitespace: true,
      },
      {
        text: 'back',
        cleanText: 'back',
        lemma: 'back',
        pos: 'adverb',
        frequencyRank: 120,
        cefrLevel: 'A1',
        status: 'learning',
        color: '#fbc18d',
        outline: true,
        isPunctuation: false,
        isWhitespace: false,
        startMs: 1500,
        endMs: 2000,
      },
      {
        text: '.',
        cleanText: '.',
        lemma: '.',
        pos: 'punct',
        frequencyRank: 0,
        cefrLevel: 'UNK',
        status: 'known',
        color: '',
        outline: false,
        isPunctuation: true,
        isWhitespace: false,
      },
    ];

    manager.renderTokens(tokens, 'en');

    // Both words must be rendered and visible in DOM (no typewriter hiding)
    const shadow = manager.getShadowRoot();
    expect(shadow).toBeTruthy();

    const wordSpans = shadow!.querySelectorAll('.cr-word');
    expect(wordSpans.length).toBe(2);
    expect(wordSpans[0].textContent).toBe('Welcome');
    expect(wordSpans[1].textContent).toBe('back');

    // Initially neither word has cr-speaking-word before time update
    expect(wordSpans[0].classList.contains('cr-speaking-word')).toBe(false);
    expect(wordSpans[1].classList.contains('cr-speaking-word')).toBe(false);

    // At 1200ms -> First word is speaking
    manager.updateActiveSpokenWord(1200);
    expect(wordSpans[0].classList.contains('cr-speaking-word')).toBe(true);
    expect(wordSpans[1].classList.contains('cr-speaking-word')).toBe(false);

    // At 1700ms -> Second word is speaking, first word is unhighlighted
    manager.updateActiveSpokenWord(1700);
    expect(wordSpans[0].classList.contains('cr-speaking-word')).toBe(false);
    expect(wordSpans[1].classList.contains('cr-speaking-word')).toBe(true);

    // At 2500ms (after cue) -> No words are speaking
    manager.updateActiveSpokenWord(2500);
    expect(wordSpans[0].classList.contains('cr-speaking-word')).toBe(false);
    expect(wordSpans[1].classList.contains('cr-speaking-word')).toBe(false);

    // Subtitles remain completely intact
    expect(wordSpans.length).toBe(2);
  });
});

describe('OverlayManager - Atomic Singleton Balloon Lifecycle (No Stuck Popups)', () => {
  let manager: OverlayManager;
  let mountContainer: HTMLElement;

  beforeEach(() => {
    mountContainer = document.createElement('div');
    document.body.appendChild(mountContainer);
    manager = new OverlayManager();
    manager.mount(mountContainer);
  });

  afterEach(() => {
    manager.unmount();
    mountContainer.remove();
    document.body.innerHTML = '';
  });

  it('never leaves overlapping stuck balloons during rapid sequential word clicks', async () => {
    const tokens: EnrichedToken[] = [
      {
        text: 'your',
        cleanText: 'your',
        lemma: 'your',
        pos: 'pronoun',
        frequencyRank: 20,
        cefrLevel: 'A1',
        status: 'known',
        color: '#7df9c2',
        outline: false,
        isPunctuation: false,
        isWhitespace: false,
      },
      {
        text: ' ',
        cleanText: '',
        lemma: '',
        pos: '',
        frequencyRank: 0,
        cefrLevel: 'UNK',
        status: 'known',
        color: '',
        outline: false,
        isPunctuation: false,
        isWhitespace: true,
      },
      {
        text: 'become',
        cleanText: 'become',
        lemma: 'become',
        pos: 'verb',
        frequencyRank: 150,
        cefrLevel: 'A2',
        status: 'learning',
        color: '#fbc18d',
        outline: true,
        isPunctuation: false,
        isWhitespace: false,
      },
    ];

    manager.renderTokens(tokens, 'en');
    const shadow = manager.getShadowRoot();
    expect(shadow).toBeTruthy();

    const wordSpans = shadow!.querySelectorAll('.cr-word');
    expect(wordSpans.length).toBe(2);

    const span1 = wordSpans[0] as HTMLElement;
    const span2 = wordSpans[1] as HTMLElement;

    // Simulate user rapidly clicking 'your' (span1) and then 'become' (span2)
    span1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Immediately click second span before first translation finishes
    span2.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Wait for async resolutions
    await new Promise((resolve) => setTimeout(resolve, 50));

    // CRITICAL: Exactly ONE balloon must be in the DOM!
    const balloons = shadow!.querySelectorAll('.cr-hover-balloon');
    expect(balloons.length).toBe(1);

    // The active balloon must be for the second word ('become')
    const wordBadge = balloons[0].querySelector('.cr-balloon-word-badge');
    expect(wordBadge?.textContent).toBe('become');

    // Span1 must not retain active-word class, only span2
    expect(span1.classList.contains('cr-active-word')).toBe(false);
    expect(span2.classList.contains('cr-active-word')).toBe(true);
  });

  it('dismisses all balloons when clicking outside or pressing Escape', async () => {
    const tokens: EnrichedToken[] = [
      {
        text: 'nature',
        cleanText: 'nature',
        lemma: 'nature',
        pos: 'noun',
        frequencyRank: 300,
        cefrLevel: 'B1',
        status: 'suggested',
        color: '#c084fc',
        outline: false,
        isPunctuation: false,
        isWhitespace: false,
      },
    ];

    manager.renderTokens(tokens, 'en');
    const shadow = manager.getShadowRoot();
    const wordSpan = shadow!.querySelector('.cr-word') as HTMLElement;

    wordSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(shadow!.querySelectorAll('.cr-hover-balloon').length).toBe(1);

    // Press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(shadow!.querySelectorAll('.cr-hover-balloon').length).toBe(0);
    expect(wordSpan.classList.contains('cr-active-word')).toBe(false);
  });
});
