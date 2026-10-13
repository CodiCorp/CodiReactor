// ─────────────────────────────────────────────────
// Frequency Engine: CEFR-graded word frequency lookup
// Maps lemmas to frequency rank and CEFR level
// ─────────────────────────────────────────────────

import { CEFRLevel, FrequencyEntry } from '../types';
import { ALL_RANK_TIERS } from './frequencyData';

/**
 * In-memory frequency database.
 * Loaded once on extension startup from bundled JSON.
 * Format: { "lemma": { rank, cefr, pos } }
 */
let frequencyDB: Map<string, FrequencyEntry> = new Map();

/**
 * Load frequency data from a JSON object.
 * Expected format: { "word": { "rank": number, "cefr": string, "pos": string }, ... }
 */
export function loadFrequencyData(data: Record<string, FrequencyEntry>): void {
  frequencyDB = new Map(Object.entries(data));
}

/**
 * Get the number of loaded frequency entries.
 */
export function getFrequencyDBSize(): number {
  return frequencyDB.size;
}

/**
 * Look up frequency rank and CEFR level for a lemma.
 * Returns null if the word is not in the database.
 */
export function lookupFrequency(lemma: string): FrequencyEntry | null {
  return frequencyDB.get(lemma.toLowerCase()) || null;
}

/**
 * Get CEFR level from frequency rank.
 * Used as fallback when the word exists in frequency DB but without explicit CEFR tag.
 */
export function rankToCEFR(rank: number): CEFRLevel {
  if (rank <= 1000) return 'A1';
  if (rank <= 2500) return 'A2';
  if (rank <= 5000) return 'B1';
  if (rank <= 9000) return 'B2';
  if (rank <= 15000) return 'C1';
  if (rank <= 20000) return 'C2';
  return 'UNK';
}

/**
 * Calculate what percentage of tokens in a text the user "knows"
 * based on their vocabulary level and known word set.
 */
export function calculateCoverage(
  uniqueLemmas: string[],
  userLevel: number,
  knownWords: Set<string>,
): number {
  if (uniqueLemmas.length === 0) return 100;

  let knownCount = 0;
  for (const lemma of uniqueLemmas) {
    if (knownWords.has(lemma)) {
      knownCount++;
      continue;
    }
    const entry = lookupFrequency(lemma);
    if (entry && entry.rank <= userLevel) {
      knownCount++;
    }
  }

  return Math.round((knownCount / uniqueLemmas.length) * 100);
}

/**
 * Generate a built-in frequency database for testing and initial use.
 * Pre-populated with 1000 high-frequency words matching Language Reactor benchmarks.
 */
export function generateSeedFrequencyData(): Record<string, FrequencyEntry> {
  const result: Record<string, FrequencyEntry> = {};

  // 1. Ingest all 1000 ranked tier words
  for (const tier of ALL_RANK_TIERS) {
    tier.words.forEach((w, idx) => {
      const rank = tier.min + idx;
      const cefr = rankToCEFR(rank);
      const clean = w.toLowerCase().trim();
      result[clean] = { rank, cefr, pos: 'word' };
    });
  }

  // 2. Specific explicit grammatical entries & CEFR overrides
  const overrides: Array<[string, number, CEFRLevel, string]> = [
    ['the', 1, 'A1', 'det'], ['be', 2, 'A1', 'verb'], ['to', 3, 'A1', 'prep'],
    ['of', 4, 'A1', 'prep'], ['and', 5, 'A1', 'conj'], ['a', 6, 'A1', 'det'],
    ['in', 7, 'A1', 'prep'], ['that', 8, 'A1', 'pron'], ['have', 9, 'A1', 'verb'],
    ['i', 10, 'A1', 'pron'], ['it', 11, 'A1', 'pron'], ['for', 12, 'A1', 'prep'],
    ['not', 13, 'A1', 'adv'], ['on', 14, 'A1', 'prep'], ['with', 15, 'A1', 'prep'],
    ['he', 16, 'A1', 'pron'], ['as', 17, 'A1', 'conj'], ['you', 18, 'A1', 'pron'],
    ['do', 19, 'A1', 'verb'], ['at', 20, 'A1', 'prep'], ['this', 21, 'A1', 'pron'],
    // B1 band examples
    ['environment', 3000, 'B1', 'noun'], ['experience', 3100, 'B1', 'noun'],
    ['technology', 3200, 'B1', 'noun'], ['research', 3300, 'B1', 'noun'],
    ['government', 3400, 'B1', 'noun'], ['language', 3500, 'B1', 'noun'],
    // B2 band examples
    ['phenomenon', 6000, 'B2', 'noun'], ['hypothesis', 7000, 'B2', 'noun'],
    ['sophisticated', 7500, 'B2', 'adj'], ['consequence', 8000, 'B2', 'noun'],
    // C1 band examples
    ['ubiquitous', 12000, 'C1', 'adj'], ['meticulous', 13000, 'C1', 'adj'],
    ['juxtaposition', 14000, 'C1', 'noun'],
    // C2 band examples
    ['serendipity', 16000, 'C2', 'noun'], ['obfuscate', 17000, 'C2', 'verb'],
    ['ephemeral', 18000, 'C2', 'adj'],
  ];

  for (const [word, rank, cefr, pos] of overrides) {
    result[word] = { rank, cefr, pos };
  }

  return result;
}
