// ─────────────────────────────────────────────────
// Transcript Panel: Virtual-scrolling transcript
// with bi-directional video sync
// ─────────────────────────────────────────────────

import { SubtitleCue, EnrichedToken } from '../core/types';

/** Transcript entry = cue + enriched tokens */
export interface TranscriptEntry {
  cue: SubtitleCue;
  tokens: EnrichedToken[];
  isActive: boolean;
  isStarred: boolean;
}

/**
 * TranscriptManager handles the transcript panel logic:
 * - Builds entries from subtitle cues
 * - Tracks active cue based on video time
 * - Supports search/filter
 * - Exports to multiple formats
 */
export class TranscriptManager {
  private entries: TranscriptEntry[] = [];
  private activeIndex = -1;
  private searchQuery = '';
  private filteredIndices: number[] | null = null;
  private starredSet: Set<string> = new Set();

  /** Load cues into the transcript */
  loadCues(cues: SubtitleCue[]): void {
    this.entries = cues.map(cue => ({
      cue,
      tokens: [],
      isActive: false,
      isStarred: this.starredSet.has(cue.id),
    }));
    this.activeIndex = -1;
    this.filteredIndices = null;
  }

  /** Update enriched tokens for a specific cue */
  setTokens(cueId: string, tokens: EnrichedToken[]): void {
    const entry = this.entries.find(e => e.cue.id === cueId);
    if (entry) {
      entry.tokens = tokens;
    }
  }

  /** Update active cue based on video time */
  updateTime(timeMs: number): number {
    const prevActive = this.activeIndex;

    // Find the cue at this timestamp
    const newIndex = this.entries.findIndex(
      e => timeMs >= e.cue.startMs && timeMs <= e.cue.endMs,
    );

    if (newIndex !== prevActive) {
      if (prevActive >= 0 && prevActive < this.entries.length) {
        this.entries[prevActive].isActive = false;
      }
      if (newIndex >= 0) {
        this.entries[newIndex].isActive = true;
      }
      this.activeIndex = newIndex;
    }

    return newIndex;
  }

  /** Get the active cue index */
  getActiveIndex(): number {
    return this.activeIndex;
  }

  /** Get all entries (or filtered if search is active) */
  getEntries(): TranscriptEntry[] {
    if (this.filteredIndices) {
      return this.filteredIndices.map(i => this.entries[i]);
    }
    return this.entries;
  }

  /** Get total entry count */
  getCount(): number {
    return this.entries.length;
  }

  /** Search/filter transcript entries */
  search(query: string): TranscriptEntry[] {
    this.searchQuery = query.toLowerCase().trim();

    if (!this.searchQuery) {
      this.filteredIndices = null;
      return this.entries;
    }

    this.filteredIndices = [];
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].cue.text.toLowerCase().includes(this.searchQuery)) {
        this.filteredIndices.push(i);
      }
    }

    return this.filteredIndices.map(i => this.entries[i]);
  }

  /** Clear search filter */
  clearSearch(): void {
    this.searchQuery = '';
    this.filteredIndices = null;
  }

  /** Toggle star/save on a cue */
  toggleStar(cueId: string): boolean {
    const entry = this.entries.find(e => e.cue.id === cueId);
    if (!entry) return false;

    if (this.starredSet.has(cueId)) {
      this.starredSet.delete(cueId);
      entry.isStarred = false;
      return false;
    } else {
      this.starredSet.add(cueId);
      entry.isStarred = true;
      return true;
    }
  }

  /** Get starred entries */
  getStarred(): TranscriptEntry[] {
    return this.entries.filter(e => e.isStarred);
  }

  // ─── Export Functions ─────────────────────────

  /** Export transcript as SRT format */
  exportSRT(): string {
    const lines: string[] = [];
    const entries = this.entries;

    for (let i = 0; i < entries.length; i++) {
      const { cue } = entries[i];
      lines.push(String(i + 1));
      lines.push(`${formatTimeSRT(cue.startMs)} --> ${formatTimeSRT(cue.endMs)}`);
      lines.push(cue.text);
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Export transcript as VTT format */
  exportVTT(): string {
    const lines: string[] = ['WEBVTT', ''];

    for (const entry of this.entries) {
      const { cue } = entry;
      lines.push(`${formatTimeVTT(cue.startMs)} --> ${formatTimeVTT(cue.endMs)}`);
      lines.push(cue.text);
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Export transcript as plain text */
  exportText(): string {
    return this.entries.map(e => e.cue.text).join('\n');
  }

  /** Export vocabulary list (unique words with status) */
  exportVocabList(): string {
    const words = new Map<string, { status: string; count: number }>();

    for (const entry of this.entries) {
      for (const token of entry.tokens) {
        if (token.isPunctuation || token.isWhitespace) continue;
        const existing = words.get(token.lemma);
        if (existing) {
          existing.count++;
        } else {
          words.set(token.lemma, { status: token.status, count: 1 });
        }
      }
    }

    const lines: string[] = ['Word\tStatus\tOccurrences'];
    for (const [word, data] of words) {
      lines.push(`${word}\t${data.status}\t${data.count}`);
    }

    return lines.join('\n');
  }

  /** Export as CSV for spreadsheet import */
  exportCSV(): string {
    const lines: string[] = ['"Timestamp","Text","Translation"'];

    for (const entry of this.entries) {
      const { cue } = entry;
      const time = formatTimeVTT(cue.startMs);
      const text = cue.text.replace(/"/g, '""');
      const translation = (cue.translatedText || '').replace(/"/g, '""');
      lines.push(`"${time}","${text}","${translation}"`);
    }

    return lines.join('\n');
  }
}

// ─── Time Formatting Helpers ─────────────────────

function formatTimeSRT(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(msRem)}`;
}

function formatTimeVTT(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad3(msRem)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Format milliseconds as human-readable timestamp (MM:SS).
 */
export function formatTimeDisplay(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${pad(s)}`;
}
