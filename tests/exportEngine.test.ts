// ─────────────────────────────────────────────────
// Tests: Export Engine
// ─────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  exportCSV, exportTSV, exportJSON, importJSON,
  buildAnkiFront, buildAnkiBack, generateAnkiCards,
} from '../src/notebook/exportEngine';
import type { SavedItem } from '../src/core/types';

const SAMPLE_ITEM: SavedItem = {
  id: '1',
  word: 'serendipity',
  cleanWord: 'serendipity',
  lemma: 'serendipity',
  translation: 'صدفة سعيدة',
  phonetic: '/ˌserənˈdɪpɪti/',
  pos: 'noun',
  sentenceTarget: 'It was pure serendipity that they met.',
  sentenceNative: '.كانت مصادفة محضة أنهم التقوا',
  sourcePlatform: 'youtube',
  sourceUrl: 'https://youtube.com/watch?v=test',
  sourceTitle: 'English Vocabulary',
  timestampMs: 45000,
  dateAdded: Date.now(),
  colorTag: 'default',
  status: 'learning',
  srsInterval: 1,
  srsRepetitions: 0,
  srsEaseFactor: 2.5,
  srsDueDate: Date.now(),
};

describe('exportCSV', () => {
  it('generates CSV with headers', () => {
    const csv = exportCSV([SAMPLE_ITEM]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Word');
    expect(lines[0]).toContain('Translation');
    expect(lines).toHaveLength(2);
  });

  it('includes item data', () => {
    const csv = exportCSV([SAMPLE_ITEM]);
    expect(csv).toContain('serendipity');
    expect(csv).toContain('noun');
  });

  it('handles empty items', () => {
    const csv = exportCSV([]);
    expect(csv.split('\n')).toHaveLength(1); // Headers only
  });

  it('escapes commas and quotes', () => {
    const item: SavedItem = {
      ...SAMPLE_ITEM,
      sentenceTarget: 'Hello, "world"',
    };
    const csv = exportCSV([item]);
    expect(csv).toContain('"Hello, ""world"""');
  });
});

describe('exportTSV', () => {
  it('generates TSV with HTML formatting', () => {
    const tsv = exportTSV([SAMPLE_ITEM]);
    expect(tsv).toContain('<b>serendipity</b>');
    expect(tsv).toContain('\t');
  });
});

describe('exportJSON / importJSON', () => {
  it('exports valid JSON backup', () => {
    const json = exportJSON({
      items: [SAMPLE_ITEM],
      version: '0.1.0',
      exportDate: Date.now(),
    });

    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('codireactor-backup');
    expect(parsed.items).toHaveLength(1);
  });

  it('imports JSON backup', () => {
    const json = exportJSON({
      items: [SAMPLE_ITEM],
      version: '0.1.0',
      exportDate: 12345,
    });

    const result = importJSON(json);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.version).toBe('0.1.0');
  });

  it('rejects invalid JSON', () => {
    expect(importJSON('not json')).toBeNull();
  });

  it('rejects wrong format', () => {
    expect(importJSON(JSON.stringify({ format: 'wrong' }))).toBeNull();
  });
});

describe('Anki card generation', () => {
  it('builds front card with word and context', () => {
    const front = buildAnkiFront(SAMPLE_ITEM);
    expect(front).toContain('serendipity');
    expect(front).toContain('noun');
    expect(front).toContain(SAMPLE_ITEM.sentenceTarget);
  });

  it('builds back card with translation', () => {
    const back = buildAnkiBack(SAMPLE_ITEM);
    expect(back).toContain(SAMPLE_ITEM.translation);
    expect(back).toContain('youtube');
  });

  it('generates card array', () => {
    const cards = generateAnkiCards([SAMPLE_ITEM]);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toContain('serendipity');
    expect(cards[0].back).toContain(SAMPLE_ITEM.translation);
    expect(cards[0].tags).toContain('youtube');
  });

  it('escapes HTML in card content', () => {
    const item: SavedItem = {
      ...SAMPLE_ITEM,
      word: '<script>alert(1)</script>',
    };
    const front = buildAnkiFront(item);
    expect(front).not.toContain('<script>');
    expect(front).toContain('&lt;script&gt;');
  });
});
