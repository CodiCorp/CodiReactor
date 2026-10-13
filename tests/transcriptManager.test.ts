// ─────────────────────────────────────────────────
// Tests: Transcript Manager
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptManager, formatTimeDisplay } from '../src/ui/TranscriptManager';
import type { SubtitleCue } from '../src/core/types';

let manager: TranscriptManager;

const SAMPLE_CUES: SubtitleCue[] = [
  { id: 'c1', startMs: 0, endMs: 3000, text: 'Hello world' },
  { id: 'c2', startMs: 3500, endMs: 6000, text: 'How are you today' },
  { id: 'c3', startMs: 7000, endMs: 10000, text: 'I am learning English' },
  { id: 'c4', startMs: 11000, endMs: 14000, text: 'This is a beautiful day' },
  { id: 'c5', startMs: 15000, endMs: 18000, text: 'The world is amazing' },
];

beforeEach(() => {
  manager = new TranscriptManager();
  manager.loadCues(SAMPLE_CUES);
});

describe('TranscriptManager', () => {
  it('loads cues correctly', () => {
    expect(manager.getCount()).toBe(5);
    expect(manager.getEntries()).toHaveLength(5);
  });

  it('tracks active cue based on time', () => {
    const idx = manager.updateTime(1500);
    expect(idx).toBe(0);
    expect(manager.getActiveIndex()).toBe(0);

    const entries = manager.getEntries();
    expect(entries[0].isActive).toBe(true);
  });

  it('updates active cue when time changes', () => {
    manager.updateTime(1000);
    expect(manager.getActiveIndex()).toBe(0);

    manager.updateTime(4000);
    expect(manager.getActiveIndex()).toBe(1);

    // Previous cue should be deactivated
    const entries = manager.getEntries();
    expect(entries[0].isActive).toBe(false);
    expect(entries[1].isActive).toBe(true);
  });

  it('returns -1 when time is between cues', () => {
    const idx = manager.updateTime(6500); // Between c2 and c3
    expect(idx).toBe(-1);
  });

  it('searches transcript entries', () => {
    const results = manager.search('learning');
    expect(results).toHaveLength(1);
    expect(results[0].cue.text).toContain('learning');
  });

  it('search is case-insensitive', () => {
    const results = manager.search('HELLO');
    expect(results).toHaveLength(1);
  });

  it('returns all entries on empty search', () => {
    manager.search('learning');
    const results = manager.search('');
    expect(results).toHaveLength(5);
  });

  it('clears search filter', () => {
    manager.search('learning');
    manager.clearSearch();
    expect(manager.getEntries()).toHaveLength(5);
  });

  it('toggles star on cues', () => {
    const starred = manager.toggleStar('c1');
    expect(starred).toBe(true);

    const unstarred = manager.toggleStar('c1');
    expect(unstarred).toBe(false);
  });

  it('gets starred entries', () => {
    manager.toggleStar('c1');
    manager.toggleStar('c3');

    const starred = manager.getStarred();
    expect(starred).toHaveLength(2);
    expect(starred[0].cue.id).toBe('c1');
    expect(starred[1].cue.id).toBe('c3');
  });

  it('preserves star state across loadCues', () => {
    manager.toggleStar('c1');
    manager.loadCues(SAMPLE_CUES);

    const entries = manager.getEntries();
    expect(entries[0].isStarred).toBe(true);
  });
});

describe('Export functions', () => {
  it('exports SRT format', () => {
    const srt = manager.exportSRT();
    expect(srt).toContain('1');
    expect(srt).toContain('00:00:00,000 --> 00:00:03,000');
    expect(srt).toContain('Hello world');
  });

  it('exports VTT format', () => {
    const vtt = manager.exportVTT();
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:03.000');
    expect(vtt).toContain('Hello world');
  });

  it('exports plain text', () => {
    const text = manager.exportText();
    expect(text).toContain('Hello world');
    expect(text).toContain('How are you today');
    expect(text.split('\n')).toHaveLength(5);
  });

  it('exports CSV format', () => {
    const csv = manager.exportCSV();
    expect(csv).toContain('"Timestamp","Text","Translation"');
    expect(csv).toContain('Hello world');
  });

  it('exports vocabulary list', () => {
    const vocab = manager.exportVocabList();
    expect(vocab).toContain('Word\tStatus\tOccurrences');
  });
});

describe('formatTimeDisplay', () => {
  it('formats milliseconds as M:SS', () => {
    expect(formatTimeDisplay(0)).toBe('0:00');
    expect(formatTimeDisplay(5000)).toBe('0:05');
    expect(formatTimeDisplay(65000)).toBe('1:05');
    expect(formatTimeDisplay(3600000)).toBe('60:00');
  });
});
