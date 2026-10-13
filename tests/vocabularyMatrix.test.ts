// ─────────────────────────────────────────────────
// Tests: Vocabulary Matrix & Token Enrichment
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyToken,
  enrichToken,
  enrichTokens,
  toggleWordStatus,
  ignoreWord,
  getVocabStats,
  getTokenColor,
  shouldOutline,
  createEmptyVocabulary,
} from '../src/core/linguistics/vocabularyMatrix';
import { tokenize } from '../src/core/linguistics/tokenizer';
import { loadFrequencyData, generateSeedFrequencyData } from '../src/core/linguistics/frequencyEngine';
import { TOKEN_COLORS, DEFAULT_SETTINGS } from '../src/core/types';
import type { VocabularyState } from '../src/core/linguistics/vocabularyMatrix';

let vocab: VocabularyState;

beforeEach(() => {
  vocab = createEmptyVocabulary();
  loadFrequencyData(generateSeedFrequencyData());
});

// ─── Token Classification ────────────────────────

describe('classifyToken', () => {
  it('classifies known words by frequency', () => {
    const status = classifyToken('the', 1, false, 'the', vocab);
    expect(status).toBe('known');
  });

  it('classifies user-marked learning words', () => {
    vocab.learningWords.add('hello');
    const status = classifyToken('hello', 100, false, 'Hello', vocab);
    expect(status).toBe('learning');
  });

  it('classifies user-marked ignored words', () => {
    vocab.ignoredWords.add('um');
    const status = classifyToken('um', 0, false, 'um', vocab);
    expect(status).toBe('ignored');
  });

  it('classifies user-marked known words', () => {
    vocab.knownWords.add('serendipity');
    const status = classifyToken('serendipity', 16000, false, 'serendipity', vocab);
    expect(status).toBe('known');
  });

  it('classifies suggested words above user level', () => {
    const settings = { ...DEFAULT_SETTINGS, userLevel: 100 };
    const status = classifyToken('environment', 3000, false, 'environment', vocab, settings);
    expect(status).toBe('suggested');
  });

  it('classifies numbers as special', () => {
    const status = classifyToken('42', 0, false, '42', vocab);
    expect(status).toBe('special');
  });
});

// ─── Token Colors ────────────────────────────────

describe('getTokenColor', () => {
  it('returns mint green for known', () => {
    expect(getTokenColor('known')).toBe(TOKEN_COLORS.known);
  });

  it('returns orange for suggested', () => {
    expect(getTokenColor('suggested')).toBe(TOKEN_COLORS.suggested);
  });

  it('returns purple for learning', () => {
    expect(getTokenColor('learning')).toBe(TOKEN_COLORS.learning);
  });
});

describe('shouldOutline', () => {
  it('returns true only for learning', () => {
    expect(shouldOutline('learning')).toBe(true);
    expect(shouldOutline('known')).toBe(false);
    expect(shouldOutline('suggested')).toBe(false);
  });
});

// ─── Token Enrichment Pipeline ───────────────────

describe('enrichToken', () => {
  it('enriches a word token with lemma and color', () => {
    const raw = tokenize('running', 'en')[0];
    const enriched = enrichToken(raw, false, 'en', vocab);
    expect(enriched.lemma).toBe('run');
    expect(enriched.isPunctuation).toBe(false);
    expect(enriched.isWhitespace).toBe(false);
  });

  it('marks punctuation tokens as transparent', () => {
    const raw = tokenize(',', 'en').find(t => t.isPunctuation);
    if (raw) {
      const enriched = enrichToken(raw, false, 'en', vocab);
      expect(enriched.color).toBe('transparent');
    }
  });
});

describe('enrichTokens', () => {
  it('enriches a full sentence', () => {
    const raw = tokenize('The cat sat on the mat', 'en');
    const enriched = enrichTokens(raw, 'en', vocab);

    // All tokens should be enriched
    expect(enriched.length).toBe(raw.length);

    // Word tokens should have lemmas
    const words = enriched.filter(t => !t.isPunctuation && !t.isWhitespace);
    expect(words.every(w => w.lemma.length > 0)).toBe(true);
  });
});

// ─── Vocabulary Management ───────────────────────

describe('toggleWordStatus', () => {
  it('moves unknown word to learning', () => {
    const result = toggleWordStatus('hello', vocab);
    expect(result).toBe('learning');
    expect(vocab.learningWords.has('hello')).toBe(true);
  });

  it('moves learning word to known', () => {
    vocab.learningWords.add('hello');
    const result = toggleWordStatus('hello', vocab);
    expect(result).toBe('known');
    expect(vocab.knownWords.has('hello')).toBe(true);
    expect(vocab.learningWords.has('hello')).toBe(false);
  });

  it('moves known word back to learning', () => {
    vocab.knownWords.add('hello');
    const result = toggleWordStatus('hello', vocab);
    expect(result).toBe('learning');
    expect(vocab.learningWords.has('hello')).toBe(true);
    expect(vocab.knownWords.has('hello')).toBe(false);
  });
});

describe('ignoreWord', () => {
  it('moves any word to ignored', () => {
    vocab.knownWords.add('um');
    ignoreWord('um', vocab);
    expect(vocab.ignoredWords.has('um')).toBe(true);
    expect(vocab.knownWords.has('um')).toBe(false);
  });
});

describe('getVocabStats', () => {
  it('returns correct counts', () => {
    vocab.knownWords.add('a');
    vocab.knownWords.add('b');
    vocab.learningWords.add('c');
    vocab.ignoredWords.add('d');

    const stats = getVocabStats(vocab);
    expect(stats.known).toBe(2);
    expect(stats.learning).toBe(1);
    expect(stats.ignored).toBe(1);
    expect(stats.total).toBe(4);
  });
});
