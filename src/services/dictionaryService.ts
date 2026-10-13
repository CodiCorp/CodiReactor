// ─────────────────────────────────────────────────
// Dictionary Service: 3-Tier lookup pipeline
// Tier 1: Offline IndexedDB (Wiktionary) — ≤5ms
// Tier 2: Online Free Dictionary API — ~200ms
// Tier 3: External URL links (user-configurable)
// ─────────────────────────────────────────────────

import { DictionaryEntry, DictionaryResult } from '../core/types';

/**
 * Tier 1: Offline dictionary lookup from IndexedDB cache.
 * Returns null if word is not found offline.
 */
export async function lookupOffline(
  word: string,
  db: { get: (table: string, key: string) => Promise<DictionaryEntry | undefined> },
): Promise<DictionaryEntry | null> {
  try {
    const entry = await db.get('dictionary', word.toLowerCase());
    return entry || null;
  } catch {
    return null;
  }
}

/**
 * Tier 2: Online dictionary lookup via Free Dictionary API.
 * https://dictionaryapi.dev/ — free, no API key required.
 * Caches results in IndexedDB for future offline access.
 */
export async function lookupOnline(
  word: string,
  language: string = 'en',
): Promise<DictionaryResult | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/${language}/${encodeURIComponent(word)}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];

    return {
      word: entry.word || word,
      phonetic: entry.phonetic || entry.phonetics?.[0]?.text || undefined,
      audioUrl: entry.phonetics?.find((p: any) => p.audio)?.audio || undefined,
      meanings: (entry.meanings || []).map((m: any) => ({
        partOfSpeech: m.partOfSpeech || '',
        definitions: (m.definitions || []).slice(0, 5).map((d: any) => ({
          definition: d.definition || '',
          example: d.example || undefined,
        })),
      })),
      sourceUrls: entry.sourceUrls || [],
    };
  } catch {
    return null;
  }
}

/**
 * Convert an online DictionaryResult to an offline DictionaryEntry for caching.
 */
export function onlineResultToOfflineEntry(result: DictionaryResult): DictionaryEntry {
  return {
    word: result.word,
    ipa: result.phonetic || '',
    audioUrl: result.audioUrl,
    senses: result.meanings.map(m => ({
      pos: m.partOfSpeech,
      glosses: m.definitions.map(d => d.definition),
      examples: m.definitions
        .filter(d => d.example)
        .map(d => d.example!),
    })),
  };
}

/**
 * Tier 3: Generate external dictionary URLs for the word.
 * These open in a new tab — not fetched by the extension.
 */
export function getExternalDictionaryLinks(
  word: string,
  customUrls: string[] = [],
): Array<{ name: string; url: string }> {
  const links: Array<{ name: string; url: string }> = [
    {
      name: 'Google Translate',
      url: `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(word)}`,
    },
    {
      name: 'WordReference',
      url: `https://www.wordreference.com/definition/${encodeURIComponent(word)}`,
    },
    {
      name: 'Wiktionary',
      url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    },
  ];

  // Add user-configured custom dictionary URLs
  for (const pattern of customUrls) {
    if (pattern.includes('{WORD}')) {
      links.push({
        name: new URL(pattern.replace('{WORD}', 'test')).hostname.replace('www.', ''),
        url: pattern.replace('{WORD}', encodeURIComponent(word)),
      });
    }
  }

  return links;
}

/**
 * Full 3-tier dictionary lookup pipeline.
 * Returns the first successful result.
 */
export async function lookupWord(
  word: string,
  language: string = 'en',
  db?: { get: (table: string, key: string) => Promise<DictionaryEntry | undefined> },
  customUrls: string[] = [],
): Promise<{
  entry: DictionaryEntry | null;
  onlineResult: DictionaryResult | null;
  externalLinks: Array<{ name: string; url: string }>;
  source: 'offline' | 'online' | 'none';
}> {
  // Tier 1: Offline
  if (db) {
    const offline = await lookupOffline(word, db);
    if (offline) {
      return {
        entry: offline,
        onlineResult: null,
        externalLinks: getExternalDictionaryLinks(word, customUrls),
        source: 'offline',
      };
    }
  }

  // Tier 2: Online
  const online = await lookupOnline(word, language);
  if (online) {
    const entry = onlineResultToOfflineEntry(online);
    return {
      entry,
      onlineResult: online,
      externalLinks: getExternalDictionaryLinks(word, customUrls),
      source: 'online',
    };
  }

  // Tier 3: External links only
  return {
    entry: null,
    onlineResult: null,
    externalLinks: getExternalDictionaryLinks(word, customUrls),
    source: 'none',
  };
}

/**
 * Service class wrapper for 3-tier lookup.
 */
export class DictionaryService {
  async lookup(word: string, language: string = 'en') {
    return lookupWord(word, language);
  }
}
