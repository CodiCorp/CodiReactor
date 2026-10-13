// ─────────────────────────────────────────────────
// Tokenizer: Language-aware word segmentation
// Uses Intl.Segmenter for universal segmentation
// ─────────────────────────────────────────────────

export interface RawToken {
  /** The original text segment (including whitespace) */
  text: string;
  /** Cleaned lowercase version without punctuation */
  cleanText: string;
  /** True if this segment is punctuation only */
  isPunctuation: boolean;
  /** True if this segment is whitespace only */
  isWhitespace: boolean;
  /** Segment type from Intl.Segmenter */
  isWordLike: boolean;
}

// Punctuation pattern — matches tokens that are entirely punctuation
const PUNCTUATION_RE = /^[\p{P}\p{S}]+$/u;
// Whitespace pattern
const WHITESPACE_RE = /^\s+$/;
// Clean pattern — strip leading/trailing punctuation for dictionary lookup
const CLEAN_RE = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/**
 * Tokenize text into word/punctuation/whitespace segments.
 * Uses Intl.Segmenter for full Unicode support across all languages.
 */
export function tokenize(text: string, locale: string = 'en'): RawToken[] {
  // Use Intl.Segmenter if available (Chrome 87+, Firefox 125+)
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return tokenizeWithSegmenter(text, locale);
  }

  // Fallback: simple regex-based tokenization
  return tokenizeWithRegex(text);
}

function tokenizeWithSegmenter(text: string, locale: string): RawToken[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
  const segments = segmenter.segment(text);
  const tokens: RawToken[] = [];

  for (const segment of segments) {
    const raw = segment.segment;

    // Preserve whitespace tokens to maintain spacing in rendering
    if (WHITESPACE_RE.test(raw)) {
      tokens.push({
        text: raw,
        cleanText: '',
        isPunctuation: false,
        isWhitespace: true,
        isWordLike: false,
      });
      continue;
    }

    const isPunctuation = PUNCTUATION_RE.test(raw);
    const cleanText = isPunctuation ? '' : raw.replace(CLEAN_RE, '').toLowerCase();

    tokens.push({
      text: raw,
      cleanText,
      isPunctuation,
      isWhitespace: false,
      isWordLike: segment.isWordLike ?? !isPunctuation,
    });
  }

  return tokens;
}

function tokenizeWithRegex(text: string): RawToken[] {
  // Split on word boundaries while preserving all characters
  const parts = text.match(/\S+|\s+/g) || [];
  const tokens: RawToken[] = [];

  for (const part of parts) {
    if (WHITESPACE_RE.test(part)) {
      tokens.push({
        text: part,
        cleanText: '',
        isPunctuation: false,
        isWhitespace: true,
        isWordLike: false,
      });
      continue;
    }

    const isPunctuation = PUNCTUATION_RE.test(part);
    const cleanText = isPunctuation ? '' : part.replace(CLEAN_RE, '').toLowerCase();

    tokens.push({
      text: part,
      cleanText,
      isPunctuation,
      isWhitespace: false,
      isWordLike: !isPunctuation && cleanText.length > 0,
    });
  }

  return tokens;
}

/**
 * Check if a token is likely a proper noun (name, place).
 * Heuristic: starts with uppercase and is not the first word of a sentence.
 */
export function isLikelyProperNoun(text: string, isFirstWord: boolean): boolean {
  if (isFirstWord) return false;
  if (text.length === 0) return false;
  return /^\p{Lu}/u.test(text) && !/^\p{Lu}+$/u.test(text); // Uppercase start, not ALL CAPS
}

/**
 * Check if a token is a number or numeric expression.
 */
export function isNumeric(text: string): boolean {
  return /^[\d.,:%$€£¥₹+\-*/^()]+$/.test(text.trim());
}
