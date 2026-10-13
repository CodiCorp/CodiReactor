// ─────────────────────────────────────────────────
// Tests: Dictionary Service
// ─────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import {
  lookupOffline,
  getExternalDictionaryLinks,
  onlineResultToOfflineEntry,
} from '../src/services/dictionaryService';
import type { DictionaryEntry, DictionaryResult } from '../src/core/types';

describe('lookupOffline', () => {
  it('returns entry from DB when found', async () => {
    const mockEntry: DictionaryEntry = {
      word: 'hello',
      ipa: '/həˈloʊ/',
      senses: [{ pos: 'interjection', glosses: ['A greeting'], examples: ['Hello there!'] }],
    };

    const mockDB = {
      get: vi.fn().mockResolvedValue(mockEntry),
    };

    const result = await lookupOffline('hello', mockDB);
    expect(result).toEqual(mockEntry);
    expect(mockDB.get).toHaveBeenCalledWith('dictionary', 'hello');
  });

  it('returns null when word not found', async () => {
    const mockDB = {
      get: vi.fn().mockResolvedValue(undefined),
    };

    const result = await lookupOffline('xyzzy', mockDB);
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const mockDB = {
      get: vi.fn().mockRejectedValue(new Error('DB error')),
    };

    const result = await lookupOffline('hello', mockDB);
    expect(result).toBeNull();
  });
});

describe('onlineResultToOfflineEntry', () => {
  it('converts DictionaryResult to DictionaryEntry', () => {
    const online: DictionaryResult = {
      word: 'hello',
      phonetic: '/həˈloʊ/',
      audioUrl: 'https://example.com/hello.mp3',
      meanings: [
        {
          partOfSpeech: 'interjection',
          definitions: [
            { definition: 'A greeting', example: 'Hello there!' },
            { definition: 'An exclamation of surprise' },
          ],
        },
      ],
    };

    const entry = onlineResultToOfflineEntry(online);
    expect(entry.word).toBe('hello');
    expect(entry.ipa).toBe('/həˈloʊ/');
    expect(entry.audioUrl).toBe('https://example.com/hello.mp3');
    expect(entry.senses).toHaveLength(1);
    expect(entry.senses[0].pos).toBe('interjection');
    expect(entry.senses[0].glosses).toHaveLength(2);
    expect(entry.senses[0].examples).toHaveLength(1);
  });
});

describe('getExternalDictionaryLinks', () => {
  it('generates default links', () => {
    const links = getExternalDictionaryLinks('hello');
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.some(l => l.name === 'Google Translate')).toBe(true);
    expect(links.some(l => l.name === 'WordReference')).toBe(true);
    expect(links.some(l => l.name === 'Wiktionary')).toBe(true);
  });

  it('includes the word in URLs', () => {
    const links = getExternalDictionaryLinks('world');
    for (const link of links) {
      expect(link.url).toContain('world');
    }
  });

  it('adds custom dictionary URLs', () => {
    const links = getExternalDictionaryLinks('test', [
      'https://mydict.com/search?q={WORD}',
    ]);
    expect(links.length).toBe(4); // 3 default + 1 custom
    expect(links[3].url).toContain('test');
  });
});
