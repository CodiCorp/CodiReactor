// ─────────────────────────────────────────────────
// IndexedDB Schema & Database (Dexie.js)
// Source of truth for all persistent data
// ─────────────────────────────────────────────────

import Dexie, { type Table } from 'dexie';
import { SavedItem, DictionaryEntry, UserSettings, DEFAULT_SETTINGS } from '../core/types';

// ─── Database Tables ─────────────────────────────

export interface WordRecord {
  id?: number;
  word: string;
  lemma: string;
  status: 'known' | 'learning' | 'ignored';
  dateAdded: number;
  colorTag: string;
}

export interface HistoryRecord {
  id?: number;
  url: string;
  title: string;
  platform: string;
  dateWatched: number;
  durationMs: number;
  coveragePercent: number;
}

export interface SettingRecord {
  key: string;
  value: any;
}

// ─── Dexie Database Class ────────────────────────

export class CodiReactorDB extends Dexie {
  words!: Table<WordRecord>;
  phrases!: Table<SavedItem>;
  history!: Table<HistoryRecord>;
  dictionary!: Table<DictionaryEntry>;
  settings!: Table<SettingRecord>;

  constructor() {
    super('CodiReactorDB');

    // Version 1: Initial schema
    this.version(1).stores({
      words: '++id, word, lemma, status, dateAdded',
      phrases: '++id, word, lemma, sourcePlatform, dateAdded, status',
      history: '++id, url, platform, dateWatched',
      dictionary: 'word',
      settings: 'key',
    });

    // Version 2: Add colorTag index
    this.version(2).stores({
      words: '++id, word, lemma, status, dateAdded, colorTag',
      phrases: '++id, word, lemma, sourcePlatform, dateAdded, status, colorTag',
      history: '++id, url, platform, dateWatched',
      dictionary: 'word',
      settings: 'key',
    }).upgrade(tx => {
      return tx.table('words').toCollection().modify(word => {
        if (!word.colorTag) word.colorTag = 'default';
      });
    });
  }
}

// ─── Singleton Instance ──────────────────────────

let dbInstance: CodiReactorDB | null = null;

export function getDB(): CodiReactorDB {
  if (!dbInstance) {
    dbInstance = new CodiReactorDB();
  }
  return dbInstance;
}

/**
 * Reset the database instance (for testing).
 */
export function resetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ─── Word Operations ─────────────────────────────

export async function addWord(word: string, lemma: string, status: 'known' | 'learning' | 'ignored'): Promise<void> {
  const db = getDB();
  const existing = await db.words.where('lemma').equals(lemma).first();
  if (existing) {
    await db.words.update(existing.id!, { status, dateAdded: Date.now() });
  } else {
    await db.words.add({
      word,
      lemma,
      status,
      dateAdded: Date.now(),
      colorTag: 'default',
    });
  }
}

export async function getWordsByStatus(status: 'known' | 'learning' | 'ignored'): Promise<WordRecord[]> {
  const db = getDB();
  return db.words.where('status').equals(status).toArray();
}

export async function loadVocabularyState(): Promise<{
  knownWords: Set<string>;
  learningWords: Set<string>;
  ignoredWords: Set<string>;
}> {
  const db = getDB();
  const allWords = await db.words.toArray();

  const known = new Set<string>();
  const learning = new Set<string>();
  const ignored = new Set<string>();

  for (const w of allWords) {
    switch (w.status) {
      case 'known': known.add(w.lemma); break;
      case 'learning': learning.add(w.lemma); break;
      case 'ignored': ignored.add(w.lemma); break;
    }
  }

  return { knownWords: known, learningWords: learning, ignoredWords: ignored };
}

// ─── Phrase / Saved Item Operations ──────────────

export async function savePhrase(item: Omit<SavedItem, 'id'>): Promise<string> {
  const db = getDB();
  const id = crypto.randomUUID();
  await db.phrases.add({ ...item, id } as SavedItem);
  return id;
}

export async function getSavedPhrases(filters?: {
  status?: string;
  platform?: string;
}): Promise<SavedItem[]> {
  const db = getDB();
  let collection = db.phrases.toCollection();

  if (filters?.status) {
    collection = db.phrases.where('status').equals(filters.status);
  }

  const results = await collection.toArray();

  if (filters?.platform) {
    return results.filter(r => r.sourcePlatform === filters.platform);
  }

  return results;
}

// ─── Dictionary Cache Operations ─────────────────

export async function cacheDictionaryEntry(entry: DictionaryEntry): Promise<void> {
  const db = getDB();
  await db.dictionary.put(entry);
}

export async function getCachedDictionary(word: string): Promise<DictionaryEntry | undefined> {
  const db = getDB();
  return db.dictionary.get(word.toLowerCase());
}

// ─── Settings Operations ─────────────────────────

export async function getSetting<K extends keyof UserSettings>(key: K): Promise<UserSettings[K]> {
  const db = getDB();
  const record = await db.settings.get(key);
  return record ? record.value : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<void> {
  const db = getDB();
  await db.settings.put({ key, value });
}

export async function getAllSettings(): Promise<UserSettings> {
  const db = getDB();
  const records = await db.settings.toArray();
  const settings = { ...DEFAULT_SETTINGS };
  for (const record of records) {
    (settings as any)[record.key] = record.value;
  }
  return settings;
}

// ─── History Operations ──────────────────────────

export async function addHistory(record: Omit<HistoryRecord, 'id'>): Promise<void> {
  const db = getDB();
  await db.history.add(record as HistoryRecord);
}

export async function getHistory(limit: number = 50): Promise<HistoryRecord[]> {
  const db = getDB();
  return db.history.orderBy('dateWatched').reverse().limit(limit).toArray();
}
