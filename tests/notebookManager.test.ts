// ─────────────────────────────────────────────────
// Tests: Notebook Manager
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookManager } from '../src/notebook/notebookManager';
import { SavedItem } from '../src/core/types';

describe('NotebookManager', () => {
  let manager: NotebookManager;

  const sampleItems: SavedItem[] = [
    {
      id: 'item_1',
      word: 'ephemeral',
      cleanWord: 'ephemeral',
      lemma: 'ephemeral',
      translation: 'lasting a very short time',
      phonetic: '/ɪˈfem.ər.əl/',
      pos: 'adjective',
      sentenceTarget: 'Fame in the internet age is often ephemeral.',
      sentenceNative: 'الشهرة في عصر الإنترنت غالبًا ما تكون عابرة.',
      sourcePlatform: 'youtube',
      sourceUrl: 'https://youtube.com/watch?v=1',
      sourceTitle: 'TED Talk on Memory',
      timestampMs: 45000,
      dateAdded: 1600000000000,
      colorTag: 'academic',
      status: 'learning',
      srsInterval: 1,
      srsRepetitions: 1,
      srsEaseFactor: 2.5,
      srsDueDate: 1600000000000 - 1000, // Due in the past
    },
    {
      id: 'item_2',
      word: 'perseverance',
      cleanWord: 'perseverance',
      lemma: 'perseverance',
      translation: 'continued effort and determination',
      phonetic: '/ˌpɜː.sɪˈvɪə.rəns/',
      pos: 'noun',
      sentenceTarget: 'Through hard work and perseverance, she succeeded.',
      sentenceNative: 'من خلال العمل الجاد والمثابرة، نجحت.',
      sourcePlatform: 'netflix',
      sourceUrl: 'https://netflix.com/watch/2',
      sourceTitle: 'Documentary',
      timestampMs: 90000,
      dateAdded: 1600005000000,
      colorTag: 'mindset',
      status: 'learning',
      srsInterval: 6,
      srsRepetitions: 2,
      srsEaseFactor: 2.6,
      srsDueDate: 1600005000000 + 100000000, // Not due yet
    },
    {
      id: 'item_3',
      word: 'ubiquitous',
      cleanWord: 'ubiquitous',
      lemma: 'ubiquitous',
      translation: 'present everywhere',
      phonetic: '/juːˈbɪk.wɪ.təs/',
      pos: 'adjective',
      sentenceTarget: 'Smartphones have become ubiquitous in daily life.',
      sentenceNative: 'أصبحت الهواتف الذكية موجودة في كل مكان.',
      sourcePlatform: 'coursera',
      sourceUrl: 'https://coursera.org/learn/3',
      sourceTitle: 'Tech Trends',
      timestampMs: 120000,
      dateAdded: 1600010000000,
      colorTag: 'academic',
      status: 'known',
      srsInterval: 30,
      srsRepetitions: 5,
      srsEaseFactor: 2.8,
      srsDueDate: 1600010000000 + 500000000,
    },
  ];

  beforeEach(() => {
    manager = new NotebookManager(sampleItems);
  });

  it('initializes with seed items', () => {
    expect(manager.getAll()).toHaveLength(3);
    expect(manager.getItem('item_1')?.word).toBe('ephemeral');
  });

  it('adds and updates items properly', () => {
    const newItem = manager.addItem({
      id: 'item_4',
      word: 'serendipity',
      cleanWord: 'serendipity',
      lemma: 'serendipity',
      translation: 'finding good things without looking',
      phonetic: '/ˌser.ənˈdɪp.ə.ti/',
      pos: 'noun',
      sentenceTarget: 'Finding this book was pure serendipity.',
      sentenceNative: 'كان العثور على هذا الكتاب صدفة جميلة.',
      sourcePlatform: 'udemy',
      sourceUrl: 'https://udemy.com/course/4',
      sourceTitle: 'Creative Writing',
      timestampMs: 15000,
      dateAdded: Date.now(),
      colorTag: 'literature',
      status: 'learning',
      srsInterval: 0,
      srsRepetitions: 0,
      srsEaseFactor: 2.5,
      srsDueDate: Date.now(),
    });

    expect(manager.getAll()).toHaveLength(4);
    expect(manager.getItem('item_4')?.word).toBe('serendipity');

    const updated = manager.updateItem('item_4', { colorTag: 'favorites' });
    expect(updated?.colorTag).toBe('favorites');
    expect(manager.getItem('item_4')?.colorTag).toBe('favorites');
  });

  it('removes item', () => {
    expect(manager.removeItem('item_1')).toBe(true);
    expect(manager.getAll()).toHaveLength(2);
    expect(manager.getItem('item_1')).toBeUndefined();
  });

  it('queries items with status, platform and tag filters', () => {
    const learningOnly = manager.query({ status: 'learning' });
    expect(learningOnly).toHaveLength(2);

    const netflixOnly = manager.query({ platform: 'netflix' });
    expect(netflixOnly).toHaveLength(1);
    expect(netflixOnly[0].word).toBe('perseverance');

    const academicOnly = manager.query({ colorTag: 'academic' });
    expect(academicOnly).toHaveLength(2);
  });

  it('queries with search query', () => {
    const searchResult = manager.query({ query: 'smartphones' });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0].word).toBe('ubiquitous');

    const arabicSearch = manager.query({ query: 'المثابرة' });
    expect(arabicSearch).toHaveLength(1);
    expect(arabicSearch[0].word).toBe('perseverance');
  });

  it('filters due only correctly', () => {
    const due = manager.query({ dueOnly: true, now: 1600000000000 });
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('item_1');
  });

  it('sorts by word and dateAdded', () => {
    const alphaAsc = manager.query({ sortBy: 'word', sortOrder: 'asc' });
    expect(alphaAsc[0].word).toBe('ephemeral');
    expect(alphaAsc[1].word).toBe('perseverance');
    expect(alphaAsc[2].word).toBe('ubiquitous');

    const dateDesc = manager.query({ sortBy: 'dateAdded', sortOrder: 'desc' });
    expect(dateDesc[0].id).toBe('item_3');
  });

  it('bulk updates status and tag', () => {
    const countStatus = manager.bulkSetStatus(['item_1', 'item_2'], 'known');
    expect(countStatus).toBe(2);
    expect(manager.getItem('item_1')?.status).toBe('known');
    expect(manager.getItem('item_2')?.status).toBe('known');

    const countTags = manager.bulkSetTag(['item_1', 'item_3'], 'advanced');
    expect(countTags).toBe(2);
    expect(manager.getItem('item_1')?.colorTag).toBe('advanced');
    expect(manager.getItem('item_3')?.colorTag).toBe('advanced');
  });

  it('bulk deletes items', () => {
    const deleted = manager.bulkDelete(['item_1', 'item_2']);
    expect(deleted).toBe(2);
    expect(manager.getAll()).toHaveLength(1);
  });

  it('records SRS review and updates interval/repetitions/ease', () => {
    const reviewed = manager.recordReview('item_1', 5, 1600000000000);
    expect(reviewed).not.toBeNull();
    expect(reviewed?.srsRepetitions).toBe(2);
    expect(reviewed?.srsInterval).toBe(6);
    expect(reviewed?.srsDueDate).toBe(1600000000000 + 6 * 86400000);
  });

  it('calculates comprehensive notebook statistics', () => {
    const stats = manager.getStats(1600000000000);
    expect(stats.total).toBe(3);
    expect(stats.learning).toBe(2);
    expect(stats.known).toBe(1);
    expect(stats.ignored).toBe(0);
    expect(stats.dueForReview).toBe(1);
    expect(stats.byPlatform['youtube']).toBe(1);
    expect(stats.byPlatform['netflix']).toBe(1);
    expect(stats.byTag['academic']).toBe(2);
  });

  it('exports and imports JSON round-trip', () => {
    const json = manager.export('json');
    const newManager = new NotebookManager();
    const result = newManager.import(json);
    expect(result.imported).toBe(3);
    expect(newManager.getAll()).toHaveLength(3);
    expect(newManager.getItem('item_1')?.word).toBe('ephemeral');
  });
});
