// ─────────────────────────────────────────────────
// Vocabulary Matrix: User word status + color resolver
// Manages known / learning / ignored word sets
// ─────────────────────────────────────────────────

import { TokenStatus, TOKEN_COLORS, EnrichedToken, UserSettings, DEFAULT_SETTINGS } from '../types';
import { RawToken, isLikelyProperNoun, isNumeric } from './tokenizer';
import { lemmatize } from './lemmatizer';
import { lookupFrequency, rankToCEFR } from './frequencyEngine';

export interface VocabularyState {
  knownWords: Set<string>;
  learningWords: Set<string>;
  ignoredWords: Set<string>;
}

/**
 * Create an empty vocabulary state.
 */
export function createEmptyVocabulary(): VocabularyState {
  return {
    knownWords: new Set(),
    learningWords: new Set(),
    ignoredWords: new Set(),
  };
}

/**
 * Classify a token's status based on user vocabulary and frequency data.
 */
export function classifyToken(
  lemma: string,
  frequencyRank: number,
  isFirstWord: boolean,
  originalText: string,
  vocab: VocabularyState,
  settings: UserSettings = DEFAULT_SETTINGS,
): TokenStatus {
  // User-explicit overrides take priority
  if (vocab.learningWords.has(lemma)) return 'learning';
  if (vocab.ignoredWords.has(lemma)) return 'ignored';
  if (vocab.knownWords.has(lemma)) return 'known';

  // Special detection: proper nouns and numbers
  if (isLikelyProperNoun(originalText, isFirstWord)) return 'special';
  if (isNumeric(originalText)) return 'special';

  // Frequency-based classification
  const userLevel = settings.userLevel;
  if (frequencyRank > 0 && frequencyRank <= userLevel) return 'known';

  // Suggested range: words just above user's level
  const suggestedCeiling = userLevel * (1 + settings.suggestedToKnownRatio);
  if (frequencyRank > 0 && frequencyRank <= suggestedCeiling) return 'suggested';

  // Words with no frequency data — treat as "unknown" → suggested
  if (frequencyRank === 0 || frequencyRank > suggestedCeiling) return 'suggested';

  return 'known';
}

/**
 * Get the CSS color for a token status.
 */
export function getTokenColor(status: TokenStatus): string {
  return TOKEN_COLORS[status] || TOKEN_COLORS.known;
}

/**
 * Whether a token should have an outline border (learning words only).
 */
export function shouldOutline(status: TokenStatus): boolean {
  return status === 'learning';
}

/**
 * Enrich a raw token with linguistic data, vocabulary status, and color.
 * This is the main pipeline function that transforms RawToken → EnrichedToken.
 */
export function enrichToken(
  rawToken: RawToken,
  isFirstWord: boolean,
  locale: string,
  vocab: VocabularyState,
  settings: UserSettings = DEFAULT_SETTINGS,
): EnrichedToken {
  // Non-word tokens (punctuation, whitespace) get minimal enrichment
  if (rawToken.isPunctuation || rawToken.isWhitespace || !rawToken.isWordLike) {
    return {
      text: rawToken.text,
      cleanText: rawToken.cleanText,
      lemma: '',
      pos: '',
      frequencyRank: 0,
      cefrLevel: 'UNK',
      status: 'known',
      color: 'transparent',
      outline: false,
      isPunctuation: rawToken.isPunctuation,
      isWhitespace: rawToken.isWhitespace,
    };
  }

  // 1. Lemmatize
  const lemma = lemmatize(rawToken.cleanText, locale);

  // 2. Frequency lookup
  const freqEntry = lookupFrequency(lemma);
  const frequencyRank = freqEntry?.rank || 0;
  const cefrLevel = freqEntry?.cefr || (frequencyRank > 0 ? rankToCEFR(frequencyRank) : 'UNK');
  const pos = freqEntry?.pos || '';

  // 3. Classify status
  const status = classifyToken(lemma, frequencyRank, isFirstWord, rawToken.text, vocab, settings);

  // 4. Resolve color
  const color = settings.showColors[status] ? getTokenColor(status) : 'transparent';

  return {
    text: rawToken.text,
    cleanText: rawToken.cleanText,
    lemma,
    pos,
    frequencyRank,
    cefrLevel,
    status,
    color,
    outline: shouldOutline(status),
    isPunctuation: false,
    isWhitespace: false,
  };
}

/**
 * Enrich an entire sentence of raw tokens.
 */
export function enrichTokens(
  rawTokens: RawToken[],
  locale: string,
  vocab: VocabularyState,
  settings: UserSettings = DEFAULT_SETTINGS,
): EnrichedToken[] {
  let isFirstWord = true;

  return rawTokens.map(token => {
    const enriched = enrichToken(token, isFirstWord, locale, vocab, settings);
    // Track if this was the first word-like token
    if (token.isWordLike) {
      isFirstWord = false;
    }
    return enriched;
  });
}

/**
 * Toggle a word's status. Cycles: unknown → learning → known → learning → ...
 */
export function toggleWordStatus(
  lemma: string,
  vocab: VocabularyState,
): TokenStatus {
  if (vocab.learningWords.has(lemma)) {
    // Learning → Known
    vocab.learningWords.delete(lemma);
    vocab.knownWords.add(lemma);
    return 'known';
  } else if (vocab.knownWords.has(lemma)) {
    // Known → Learning
    vocab.knownWords.delete(lemma);
    vocab.learningWords.add(lemma);
    return 'learning';
  } else {
    // Unknown → Learning
    vocab.learningWords.add(lemma);
    return 'learning';
  }
}

/**
 * Mark a word as ignored.
 */
export function ignoreWord(lemma: string, vocab: VocabularyState): void {
  vocab.knownWords.delete(lemma);
  vocab.learningWords.delete(lemma);
  vocab.ignoredWords.add(lemma);
}

/**
 * Get vocabulary stats.
 */
export function getVocabStats(vocab: VocabularyState): {
  known: number;
  learning: number;
  ignored: number;
  total: number;
} {
  return {
    known: vocab.knownWords.size,
    learning: vocab.learningWords.size,
    ignored: vocab.ignoredWords.size,
    total: vocab.knownWords.size + vocab.learningWords.size + vocab.ignoredWords.size,
  };
}
