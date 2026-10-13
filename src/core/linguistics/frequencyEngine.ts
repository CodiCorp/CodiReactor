// ─────────────────────────────────────────────────
// Frequency Engine: CEFR-graded word frequency lookup
// Maps lemmas to frequency rank and CEFR level
// ─────────────────────────────────────────────────

import { CEFRLevel, FrequencyEntry } from '../types';

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
 * In production, this is replaced by data from Maximax67/Words-CEFR-Dataset.
 */
export function generateSeedFrequencyData(): Record<string, FrequencyEntry> {
  // Top 100 most frequent English words with CEFR levels
  const words: Array<[string, number, CEFRLevel, string]> = [
    ['the', 1, 'A1', 'det'], ['be', 2, 'A1', 'verb'], ['to', 3, 'A1', 'prep'],
    ['of', 4, 'A1', 'prep'], ['and', 5, 'A1', 'conj'], ['a', 6, 'A1', 'det'],
    ['in', 7, 'A1', 'prep'], ['that', 8, 'A1', 'pron'], ['have', 9, 'A1', 'verb'],
    ['i', 10, 'A1', 'pron'], ['it', 11, 'A1', 'pron'], ['for', 12, 'A1', 'prep'],
    ['not', 13, 'A1', 'adv'], ['on', 14, 'A1', 'prep'], ['with', 15, 'A1', 'prep'],
    ['he', 16, 'A1', 'pron'], ['as', 17, 'A1', 'conj'], ['you', 18, 'A1', 'pron'],
    ['do', 19, 'A1', 'verb'], ['at', 20, 'A1', 'prep'], ['this', 21, 'A1', 'pron'],
    ['but', 22, 'A1', 'conj'], ['his', 23, 'A1', 'pron'], ['by', 24, 'A1', 'prep'],
    ['from', 25, 'A1', 'prep'], ['they', 26, 'A1', 'pron'], ['we', 27, 'A1', 'pron'],
    ['say', 28, 'A1', 'verb'], ['her', 29, 'A1', 'pron'], ['she', 30, 'A1', 'pron'],
    ['or', 31, 'A1', 'conj'], ['an', 32, 'A1', 'det'], ['will', 33, 'A1', 'verb'],
    ['my', 34, 'A1', 'pron'], ['one', 35, 'A1', 'num'], ['all', 36, 'A1', 'det'],
    ['would', 37, 'A1', 'verb'], ['there', 38, 'A1', 'adv'], ['their', 39, 'A1', 'pron'],
    ['what', 40, 'A1', 'pron'], ['so', 41, 'A1', 'adv'], ['up', 42, 'A1', 'adv'],
    ['out', 43, 'A1', 'adv'], ['if', 44, 'A1', 'conj'], ['about', 45, 'A1', 'prep'],
    ['who', 46, 'A1', 'pron'], ['get', 47, 'A1', 'verb'], ['which', 48, 'A1', 'pron'],
    ['go', 49, 'A1', 'verb'], ['me', 50, 'A1', 'pron'],
    ['when', 51, 'A1', 'conj'], ['make', 52, 'A1', 'verb'], ['can', 53, 'A1', 'verb'],
    ['like', 54, 'A1', 'verb'], ['time', 55, 'A1', 'noun'], ['no', 56, 'A1', 'det'],
    ['just', 57, 'A1', 'adv'], ['him', 58, 'A1', 'pron'], ['know', 59, 'A1', 'verb'],
    ['take', 60, 'A1', 'verb'], ['people', 61, 'A1', 'noun'], ['into', 62, 'A1', 'prep'],
    ['year', 63, 'A1', 'noun'], ['your', 64, 'A1', 'pron'], ['good', 65, 'A1', 'adj'],
    ['some', 66, 'A1', 'det'], ['could', 67, 'A1', 'verb'], ['them', 68, 'A1', 'pron'],
    ['see', 69, 'A1', 'verb'], ['other', 70, 'A1', 'adj'], ['than', 71, 'A1', 'conj'],
    ['then', 72, 'A1', 'adv'], ['now', 73, 'A1', 'adv'], ['look', 74, 'A1', 'verb'],
    ['only', 75, 'A1', 'adv'], ['come', 76, 'A1', 'verb'], ['its', 77, 'A1', 'pron'],
    ['over', 78, 'A1', 'prep'], ['think', 79, 'A1', 'verb'], ['also', 80, 'A2', 'adv'],
    ['back', 81, 'A1', 'adv'], ['after', 82, 'A1', 'prep'], ['use', 83, 'A1', 'verb'],
    ['two', 84, 'A1', 'num'], ['how', 85, 'A1', 'adv'], ['our', 86, 'A1', 'pron'],
    ['work', 87, 'A1', 'noun'], ['first', 88, 'A1', 'adj'], ['well', 89, 'A1', 'adv'],
    ['way', 90, 'A1', 'noun'], ['even', 91, 'A2', 'adv'], ['new', 92, 'A1', 'adj'],
    ['want', 93, 'A1', 'verb'], ['because', 94, 'A1', 'conj'], ['any', 95, 'A1', 'det'],
    ['these', 96, 'A1', 'pron'], ['give', 97, 'A1', 'verb'], ['day', 98, 'A1', 'noun'],
    ['most', 99, 'A1', 'adv'], ['us', 100, 'A1', 'pron'],
    // A2 band
    ['world', 120, 'A2', 'noun'], ['school', 130, 'A1', 'noun'], ['still', 140, 'A2', 'adv'],
    ['try', 150, 'A1', 'verb'], ['last', 160, 'A1', 'adj'], ['ask', 170, 'A1', 'verb'],
    ['need', 180, 'A1', 'verb'], ['too', 190, 'A1', 'adv'], ['feel', 200, 'A1', 'verb'],
    ['three', 210, 'A1', 'num'], ['tell', 220, 'A1', 'verb'], ['play', 230, 'A1', 'verb'],
    ['small', 240, 'A1', 'adj'], ['end', 250, 'A1', 'noun'], ['put', 260, 'A1', 'verb'],
    ['home', 270, 'A1', 'noun'], ['read', 280, 'A1', 'verb'], ['hand', 290, 'A1', 'noun'],
    ['high', 300, 'A1', 'adj'], ['start', 310, 'A1', 'verb'],
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

  const result: Record<string, FrequencyEntry> = {};
  for (const [word, rank, cefr, pos] of words) {
    result[word] = { rank, cefr, pos };
  }
  return result;
}
