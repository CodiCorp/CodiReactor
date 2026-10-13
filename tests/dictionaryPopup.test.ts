// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: DictionaryPopup builder
// ─────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { buildDictionaryPopup, type DictionaryPopupOptions } from '../src/ui/DictionaryPopup';

describe('buildDictionaryPopup', () => {
  it('renders word and IPA in header', () => {
    const popup = buildDictionaryPopup({
      entry: {
        word: 'hello',
        ipa: '/həˈloʊ/',
        senses: [{ pos: 'interjection', glosses: ['A greeting'], examples: ['Hello there!'] }],
      },
      externalLinks: [],
      currentStatus: 'suggested',
    });

    const wordEl = popup.querySelector('.cr-dict-word');
    const ipaEl = popup.querySelector('.cr-dict-ipa');
    expect(wordEl?.textContent).toBe('hello');
    expect(ipaEl?.textContent).toBe('/həˈloʊ/');
  });

  it('renders POS badge', () => {
    const popup = buildDictionaryPopup({
      entry: {
        word: 'run',
        ipa: '',
        senses: [{ pos: 'verb', glosses: ['To move quickly'] }],
      },
      externalLinks: [],
      currentStatus: 'suggested',
    });

    const posEl = popup.querySelector('.cr-dict-pos');
    expect(posEl?.textContent).toBe('verb');
  });

  it('renders definitions list', () => {
    const popup = buildDictionaryPopup({
      entry: {
        word: 'chest',
        ipa: '/tʃest/',
        senses: [
          { pos: 'noun', glosses: ['Front part of the body', 'A large box'], examples: ['His chest hurt.'] },
        ],
      },
      externalLinks: [],
      currentStatus: 'suggested',
    });

    const senses = popup.querySelector('.cr-dict-senses');
    expect(senses).toBeTruthy();
    const items = senses!.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders external links', () => {
    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [
        { name: 'Google Translate', url: 'https://translate.google.com' },
        { name: 'Wiktionary', url: 'https://en.wiktionary.org' },
      ],
      currentStatus: 'suggested',
    });

    const links = popup.querySelectorAll('.cr-dict-external-link');
    expect(links.length).toBe(2);
    expect(links[0].textContent).toBe('Google Translate');
  });

  it('renders action buttons', () => {
    const onMarkKnown = vi.fn();
    const onMarkLearning = vi.fn();

    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [],
      currentStatus: 'suggested',
      onMarkKnown,
      onMarkLearning,
    });

    const buttons = popup.querySelectorAll('.cr-dict-action-btn');
    expect(buttons.length).toBe(4); // Known, Learning, Save, Ignore
  });

  it('shows "✓ Known" when status is known', () => {
    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [],
      currentStatus: 'known',
    });

    const knownBtn = popup.querySelector('.cr-action-known');
    expect(knownBtn?.textContent).toBe('✓ Known');
  });

  it('shows "✓ Learning" when status is learning', () => {
    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [],
      currentStatus: 'learning',
    });

    const learningBtn = popup.querySelector('.cr-action-learning');
    expect(learningBtn?.textContent).toBe('✓ Learning');
  });

  it('renders audio button when audioUrl is provided', () => {
    const popup = buildDictionaryPopup({
      entry: {
        word: 'hello',
        ipa: '',
        audioUrl: 'https://example.com/hello.mp3',
        senses: [],
      },
      externalLinks: [],
      currentStatus: 'suggested',
    });

    const audioBtn = popup.querySelector('.cr-dict-audio-btn');
    expect(audioBtn).toBeTruthy();
    expect(audioBtn?.textContent).toBe('🔊');
  });

  it('handles null entry gracefully', () => {
    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [],
      currentStatus: 'suggested',
    });

    const wordEl = popup.querySelector('.cr-dict-word');
    expect(wordEl?.textContent).toBe('No definition found');
  });

  it('renders CodiReactor brand title and calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    const popup = buildDictionaryPopup({
      entry: null,
      externalLinks: [],
      currentStatus: 'suggested',
      onClose,
    });

    const brandEl = popup.querySelector('.cr-dict-brand-title');
    expect(brandEl?.textContent).toBe('CodiReactor');

    const closeBtn = popup.querySelector('.cr-dict-close-btn') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.textContent).toBe('✖');

    closeBtn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
