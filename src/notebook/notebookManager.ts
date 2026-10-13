// ─────────────────────────────────────────────────
// Notebook Manager: CRUD, filtering, bulk actions,
// search, and statistics for saved vocabulary items
// ─────────────────────────────────────────────────

import { SavedItem, TokenStatus } from '../core/types';
import { exportCSV, exportTSV, exportJSON, importJSON } from './exportEngine';
import { sm2, ReviewQuality, SRSCard } from '../srs/phrasePump';

export interface NotebookFilterOptions {
  status?: TokenStatus | 'all';
  platform?: SavedItem['sourcePlatform'] | 'all';
  colorTag?: string | 'all';
  query?: string;
  sortBy?: 'dateAdded' | 'word' | 'srsDueDate' | 'srsRepetitions';
  sortOrder?: 'asc' | 'desc';
  dueOnly?: boolean;
  now?: number;
}

export interface NotebookStats {
  total: number;
  learning: number;
  known: number;
  ignored: number;
  dueForReview: number;
  byPlatform: Record<string, number>;
  byTag: Record<string, number>;
}

export class NotebookManager {
  private items: Map<string, SavedItem> = new Map();

  constructor(initialItems: SavedItem[] = []) {
    for (const item of initialItems) {
      this.items.set(item.id, { ...item });
    }
  }

  /**
   * Add a new saved item or replace if ID exists.
   */
  addItem(item: SavedItem): SavedItem {
    const clean: SavedItem = {
      ...item,
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      dateAdded: item.dateAdded || Date.now(),
      srsInterval: item.srsInterval ?? 0,
      srsRepetitions: item.srsRepetitions ?? 0,
      srsEaseFactor: item.srsEaseFactor ?? 2.5,
      srsDueDate: item.srsDueDate ?? Date.now(),
      status: item.status || 'learning',
    };
    this.items.set(clean.id, clean);
    return clean;
  }

  /**
   * Get an item by ID.
   */
  getItem(id: string): SavedItem | undefined {
    return this.items.get(id);
  }

  /**
   * Update an existing item by ID.
   */
  updateItem(id: string, updates: Partial<SavedItem>): SavedItem | null {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated: SavedItem = { ...existing, ...updates, id };
    this.items.set(id, updated);
    return updated;
  }

  /**
   * Remove an item by ID.
   */
  removeItem(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Get all items as an array.
   */
  getAll(): SavedItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Filter and sort saved items based on criteria.
   */
  query(options: NotebookFilterOptions = {}): SavedItem[] {
    let result = Array.from(this.items.values());
    const now = options.now ?? Date.now();

    // Filter by status
    if (options.status && options.status !== 'all') {
      result = result.filter(item => item.status === options.status);
    }

    // Filter by platform
    if (options.platform && options.platform !== 'all') {
      result = result.filter(item => item.sourcePlatform === options.platform);
    }

    // Filter by tag
    if (options.colorTag && options.colorTag !== 'all') {
      result = result.filter(item => item.colorTag === options.colorTag);
    }

    // Filter by due only
    if (options.dueOnly) {
      result = result.filter(item => item.srsDueDate <= now);
    }

    // Text search query
    if (options.query && options.query.trim()) {
      const q = options.query.toLowerCase().trim();
      result = result.filter(item => {
        return (
          item.word.toLowerCase().includes(q) ||
          item.cleanWord.toLowerCase().includes(q) ||
          item.lemma.toLowerCase().includes(q) ||
          item.translation.toLowerCase().includes(q) ||
          item.sentenceTarget.toLowerCase().includes(q) ||
          item.sentenceNative.toLowerCase().includes(q) ||
          item.sourceTitle.toLowerCase().includes(q)
        );
      });
    }

    // Sorting
    const sortBy = options.sortBy || 'dateAdded';
    const sortOrder = options.sortOrder || 'desc';
    const mult = sortOrder === 'asc' ? 1 : -1;

    result.sort((a, b) => {
      switch (sortBy) {
        case 'word':
          return mult * a.word.localeCompare(b.word);
        case 'srsDueDate':
          return mult * (a.srsDueDate - b.srsDueDate);
        case 'srsRepetitions':
          return mult * (a.srsRepetitions - b.srsRepetitions);
        case 'dateAdded':
        default:
          return mult * (a.dateAdded - b.dateAdded);
      }
    });

    return result;
  }

  /**
   * Bulk update status for multiple items.
   */
  bulkSetStatus(ids: string[], status: TokenStatus): number {
    let updated = 0;
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) {
        item.status = status;
        updated++;
      }
    }
    return updated;
  }

  /**
   * Bulk assign tag to multiple items.
   */
  bulkSetTag(ids: string[], colorTag: string): number {
    let updated = 0;
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) {
        item.colorTag = colorTag;
        updated++;
      }
    }
    return updated;
  }

  /**
   * Bulk delete items by ID.
   */
  bulkDelete(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      if (this.items.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Convert saved items to SRSCards for PhrasePump.
   */
  toSRSCards(): SRSCard[] {
    return Array.from(this.items.values()).map(item => ({
      id: item.id,
      word: item.word,
      lemma: item.lemma,
      sentenceTarget: item.sentenceTarget,
      sentenceNative: item.sentenceNative,
      translation: item.translation,
      phonetic: item.phonetic,
      pos: item.pos,
      interval: item.srsInterval,
      repetitions: item.srsRepetitions,
      easeFactor: item.srsEaseFactor,
      dueDate: item.srsDueDate,
      totalReviews: item.srsRepetitions,
      correctReviews: item.srsRepetitions,
      dateAdded: item.dateAdded,
      lastReviewed: 0,
    }));
  }

  /**
   * Process an SRS review rating and update the underlying SavedItem.
   */
  recordReview(id: string, quality: ReviewQuality, now: number = Date.now()): SavedItem | null {
    const item = this.items.get(id);
    if (!item) return null;

    const res = sm2(quality, item.srsRepetitions, item.srsEaseFactor, item.srsInterval);

    item.srsInterval = res.interval;
    item.srsRepetitions = res.repetitions;
    item.srsEaseFactor = res.easeFactor;
    item.srsDueDate = now + res.interval * 24 * 60 * 60 * 1000;

    if (res.interval >= 21) {
      item.status = 'known';
    }

    return item;
  }

  /**
   * Calculate comprehensive notebook statistics.
   */
  getStats(now: number = Date.now()): NotebookStats {
    let learning = 0;
    let known = 0;
    let ignored = 0;
    let due = 0;
    const byPlatform: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const item of this.items.values()) {
      if (item.status === 'learning') learning++;
      else if (item.status === 'known') known++;
      else if (item.status === 'ignored') ignored++;

      if (item.srsDueDate <= now) due++;

      byPlatform[item.sourcePlatform] = (byPlatform[item.sourcePlatform] || 0) + 1;
      if (item.colorTag) {
        byTag[item.colorTag] = (byTag[item.colorTag] || 0) + 1;
      }
    }

    return {
      total: this.items.size,
      learning,
      known,
      ignored,
      dueForReview: due,
      byPlatform,
      byTag,
    };
  }

  /**
   * Export items in various formats.
   */
  export(format: 'csv' | 'tsv' | 'json', filterOptions?: NotebookFilterOptions): string {
    const items = filterOptions ? this.query(filterOptions) : this.getAll();
    switch (format) {
      case 'csv':
        return exportCSV(items);
      case 'tsv':
        return exportTSV(items);
      case 'json':
      default:
        return exportJSON({
          items,
          version: '1.0',
          exportDate: Date.now(),
        });
    }
  }

  /**
   * Import items from JSON backup.
   */
  import(jsonString: string, mode: 'merge' | 'overwrite' = 'merge'): { imported: number; errors: number } {
    const parsed = importJSON(jsonString);
    if (!parsed) {
      return { imported: 0, errors: 1 };
    }

    if (mode === 'overwrite') {
      this.items.clear();
    }

    let imported = 0;
    for (const item of parsed.items) {
      this.addItem(item);
      imported++;
    }

    return { imported, errors: 0 };
  }
}
