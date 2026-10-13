// ─────────────────────────────────────────────────
// Tests: Tokenizer & Lemmatizer & Frequency Engine
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { tokenize, isLikelyProperNoun, isNumeric } from '../src/core/linguistics/tokenizer';
import { lemmatize, loadLemmaData, getLangFamily } from '../src/core/linguistics/lemmatizer';
import {
  loadFrequencyData,
  lookupFrequency,
  rankToCEFR,
  calculateCoverage,
  getFrequencyDBSize,
  generateSeedFrequencyData,
} from '../src/core/linguistics/frequencyEngine';

// ─── Tokenizer ───────────────────────────────────

describe('tokenize', () => {
  it('tokenizes a simple English sentence', () => {
    const tokens = tokenize('Hello world');
    const words = tokens.filter(t => t.isWordLike);
    expect(words).toHaveLength(2);
    expect(words[0].cleanText).toBe('hello');
    expect(words[1].cleanText).toBe('world');
  });

  it('preserves punctuation tokens', () => {
    const tokens = tokenize('Hello, world!');
    const punctuation = tokens.filter(t => t.isPunctuation);
    expect(punctuation.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves whitespace tokens', () => {
    const tokens = tokenize('Hello world');
    const whitespace = tokens.filter(t => t.isWhitespace);
    expect(whitespace.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toHaveLength(0);
  });

  it('handles string with only punctuation', () => {
    const tokens = tokenize('...');
    const words = tokens.filter(t => t.isWordLike);
    expect(words).toHaveLength(0);
  });

  it('tokenizes numbers', () => {
    const tokens = tokenize('I have 42 cats');
    const words = tokens.filter(t => t.isWordLike);
    expect(words.length).toBeGreaterThanOrEqual(3);
  });
});

describe('isLikelyProperNoun', () => {
  it('detects capitalized non-first words', () => {
    expect(isLikelyProperNoun('London', false)).toBe(true);
    expect(isLikelyProperNoun('John', false)).toBe(true);
  });

  it('ignores first word of sentence', () => {
    expect(isLikelyProperNoun('The', true)).toBe(false);
  });

  it('ignores all-caps words', () => {
    expect(isLikelyProperNoun('USA', false)).toBe(false);
  });

  it('ignores lowercase words', () => {
    expect(isLikelyProperNoun('hello', false)).toBe(false);
  });
});

describe('isNumeric', () => {
  it('detects plain numbers', () => {
    expect(isNumeric('42')).toBe(true);
    expect(isNumeric('3.14')).toBe(true);
  });

  it('detects currency/percentage', () => {
    expect(isNumeric('$99.99')).toBe(true);
    expect(isNumeric('100%')).toBe(true);
  });

  it('rejects words', () => {
    expect(isNumeric('hello')).toBe(false);
    expect(isNumeric('abc123')).toBe(false);
  });
});

// ─── Lemmatizer ──────────────────────────────────

describe('lemmatize', () => {
  it('resolves irregular English verbs', () => {
    expect(lemmatize('was', 'en')).toBe('be');
    expect(lemmatize('went', 'en')).toBe('go');
    expect(lemmatize('thought', 'en')).toBe('think');
    expect(lemmatize('ate', 'en')).toBe('eat');
    expect(lemmatize('children', 'en')).toBe('child');
  });

  it('strips regular English suffixes', () => {
    expect(lemmatize('running', 'en')).toBe('run');
    expect(lemmatize('walked', 'en')).toBe('walk');
    expect(lemmatize('cats', 'en')).toBe('cat');
    expect(lemmatize('quickly', 'en')).toBe('quick');
  });

  it('handles contractions', () => {
    expect(lemmatize("don't", 'en')).toBe('do');
    expect(lemmatize("won't", 'en')).toBe('will');
    expect(lemmatize("i'm", 'en')).toBe('be');
  });

  it('returns the word unchanged for CJK', () => {
    expect(lemmatize('食べる', 'ja')).toBe('食べる');
    expect(lemmatize('学习', 'zh')).toBe('学习');
  });

  it('strips Arabic prefixes and suffixes', () => {
    const lemma = lemmatize('الكتاب', 'ar');
    expect(lemma).toBe('كتاب'); // al-kitab → kitab
  });

  it('handles empty string', () => {
    expect(lemmatize('', 'en')).toBe('');
  });

  it('uses external lemma data when loaded', () => {
    loadLemmaData({ 'better': 'good', 'best': 'good' });
    expect(lemmatize('better', 'en')).toBe('good');
    expect(lemmatize('best', 'en')).toBe('good');
    // Clean up
    loadLemmaData({});
  });
});

describe('getLangFamily', () => {
  it('classifies English', () => expect(getLangFamily('en')).toBe('english'));
  it('classifies Spanish', () => expect(getLangFamily('es')).toBe('romance'));
  it('classifies German', () => expect(getLangFamily('de')).toBe('germanic'));
  it('classifies Chinese', () => expect(getLangFamily('zh')).toBe('cjk'));
  it('classifies Japanese', () => expect(getLangFamily('ja')).toBe('cjk'));
  it('classifies Arabic', () => expect(getLangFamily('ar')).toBe('arabic'));
  it('classifies unknown', () => expect(getLangFamily('xyz')).toBe('other'));
});

// ─── Frequency Engine ────────────────────────────

describe('frequencyEngine', () => {
  beforeEach(() => {
    loadFrequencyData(generateSeedFrequencyData());
  });

  it('loads seed data', () => {
    expect(getFrequencyDBSize()).toBeGreaterThan(100);
  });

  it('looks up common words', () => {
    const entry = lookupFrequency('the');
    expect(entry).not.toBeNull();
    expect(entry!.rank).toBe(1);
    expect(entry!.cefr).toBe('A1');
  });

  it('returns null for unknown words', () => {
    expect(lookupFrequency('supercalifragilistic')).toBeNull();
  });

  it('maps rank to CEFR correctly', () => {
    expect(rankToCEFR(500)).toBe('A1');
    expect(rankToCEFR(2000)).toBe('A2');
    expect(rankToCEFR(4000)).toBe('B1');
    expect(rankToCEFR(7000)).toBe('B2');
    expect(rankToCEFR(12000)).toBe('C1');
    expect(rankToCEFR(18000)).toBe('C2');
    expect(rankToCEFR(25000)).toBe('UNK');
  });

  it('calculates coverage correctly', () => {
    const knownWords = new Set(['the', 'be', 'to', 'of', 'and']);
    const lemmas = ['the', 'be', 'to', 'of', 'and'];
    expect(calculateCoverage(lemmas, 1000, knownWords)).toBe(100);
  });

  it('returns 100% for empty input', () => {
    expect(calculateCoverage([], 1000, new Set())).toBe(100);
  });
});
