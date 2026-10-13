// ─────────────────────────────────────────────────
// Tests: SM-2 PhrasePump SRS Engine
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sm2, createCard, reviewCard, getDueCards,
  getReviewStats, getStreakData,
  type SRSCard, type ReviewQuality,
} from '../src/srs/phrasePump';

describe('sm2', () => {
  it('resets on quality < 3 (failed)', () => {
    const result = sm2(2, 5, 2.5, 30);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.easeFactor).toBe(2.5); // EF unchanged on failure
  });

  it('sets interval=1 on first success', () => {
    const result = sm2(4, 0, 2.5, 0);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it('sets interval=6 on second success', () => {
    const result = sm2(4, 1, 2.5, 1);
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('multiplies by EF on third+ success', () => {
    const result = sm2(4, 2, 2.5, 6);
    expect(result.interval).toBe(15); // 6 * 2.5 = 15
    expect(result.repetitions).toBe(3);
  });

  it('increases EF on quality=5', () => {
    const result = sm2(5, 3, 2.5, 15);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  it('decreases EF on quality=3', () => {
    const result = sm2(3, 3, 2.5, 15);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it('never lets EF go below 1.3', () => {
    let ef = 1.4;
    for (let i = 0; i < 20; i++) {
      const result = sm2(3, i, ef, 1);
      ef = result.easeFactor;
    }
    expect(ef).toBeGreaterThanOrEqual(1.3);
  });

  it('sets a future dueDate', () => {
    const before = Date.now();
    const result = sm2(4, 0, 2.5, 0);
    expect(result.dueDate).toBeGreaterThan(before);
  });

  it('handles all quality ratings 0-5', () => {
    for (let q = 0; q <= 5; q++) {
      const result = sm2(q as ReviewQuality, 0, 2.5, 0);
      expect(result.interval).toBeGreaterThanOrEqual(1);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('createCard', () => {
  it('creates a card with default SM-2 parameters', () => {
    const card = createCard({
      word: 'hello',
      lemma: 'hello',
      sentenceTarget: 'Hello world!',
      sentenceNative: '!مرحبا بالعالم',
      translation: 'مرحبا',
    });

    expect(card.id).toBeTruthy();
    expect(card.word).toBe('hello');
    expect(card.easeFactor).toBe(2.5);
    expect(card.interval).toBe(0);
    expect(card.repetitions).toBe(0);
    expect(card.totalReviews).toBe(0);
    expect(card.dueDate).toBeLessThanOrEqual(Date.now());
  });
});

describe('reviewCard', () => {
  let card: SRSCard;

  beforeEach(() => {
    card = createCard({
      word: 'test',
      lemma: 'test',
      sentenceTarget: 'This is a test.',
      sentenceNative: 'هذا اختبار.',
      translation: 'اختبار',
    });
  });

  it('updates card state on correct answer', () => {
    const updated = reviewCard(card, 4);
    expect(updated.interval).toBe(1);
    expect(updated.repetitions).toBe(1);
    expect(updated.totalReviews).toBe(1);
    expect(updated.correctReviews).toBe(1);
    expect(updated.lastReviewed).toBeGreaterThan(0);
  });

  it('resets on incorrect answer', () => {
    const first = reviewCard(card, 5);
    const second = reviewCard(first, 5);
    const failed = reviewCard(second, 1);

    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
    expect(failed.totalReviews).toBe(3);
    expect(failed.correctReviews).toBe(2); // 2 correct + 1 failed
  });

  it('progressively increases interval', () => {
    let c = card;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i++) {
      c = reviewCard(c, 4);
      intervals.push(c.interval);
    }

    // Each interval should be >= previous
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
  });
});

describe('getDueCards', () => {
  it('returns cards that are due', () => {
    const cards: SRSCard[] = [
      { ...createCard({ word: 'a', lemma: 'a', sentenceTarget: '', sentenceNative: '', translation: '' }), dueDate: Date.now() - 10000 },
      { ...createCard({ word: 'b', lemma: 'b', sentenceTarget: '', sentenceNative: '', translation: '' }), dueDate: Date.now() + 86400000 },
    ];

    const due = getDueCards(cards);
    expect(due).toHaveLength(1);
    expect(due[0].word).toBe('a');
  });

  it('respects limit', () => {
    const cards: SRSCard[] = Array.from({ length: 50 }, (_, i) => ({
      ...createCard({ word: `w${i}`, lemma: `w${i}`, sentenceTarget: '', sentenceNative: '', translation: '' }),
      dueDate: Date.now() - 1000,
    }));

    expect(getDueCards(cards, 10)).toHaveLength(10);
  });

  it('sorts by most overdue first', () => {
    const cards: SRSCard[] = [
      { ...createCard({ word: 'recent', lemma: 'recent', sentenceTarget: '', sentenceNative: '', translation: '' }), dueDate: Date.now() - 1000 },
      { ...createCard({ word: 'old', lemma: 'old', sentenceTarget: '', sentenceNative: '', translation: '' }), dueDate: Date.now() - 99999 },
    ];

    const due = getDueCards(cards);
    expect(due[0].word).toBe('old');
  });

  it('returns empty for no due cards', () => {
    const cards: SRSCard[] = [
      { ...createCard({ word: 'future', lemma: 'future', sentenceTarget: '', sentenceNative: '', translation: '' }), dueDate: Date.now() + 86400000 },
    ];
    expect(getDueCards(cards)).toHaveLength(0);
  });
});

describe('getReviewStats', () => {
  it('returns correct stats', () => {
    const cards: SRSCard[] = [
      { ...createCard({ word: 'a', lemma: 'a', sentenceTarget: '', sentenceNative: '', translation: '' }),
        interval: 1, totalReviews: 5, correctReviews: 4, dueDate: Date.now() - 1000 },
      { ...createCard({ word: 'b', lemma: 'b', sentenceTarget: '', sentenceNative: '', translation: '' }),
        interval: 30, totalReviews: 10, correctReviews: 9, dueDate: Date.now() + 86400000 },
    ];

    const stats = getReviewStats(cards);
    expect(stats.total).toBe(2);
    expect(stats.due).toBe(1);
    expect(stats.learning).toBe(1); // interval < 21
    expect(stats.mature).toBe(1);   // interval >= 21
    expect(stats.accuracyPercent).toBe(87); // 13/15 ≈ 87%
  });

  it('handles empty cards', () => {
    const stats = getReviewStats([]);
    expect(stats.total).toBe(0);
    expect(stats.averageEF).toBe(2.5);
    expect(stats.accuracyPercent).toBe(0);
  });
});

describe('getStreakData', () => {
  it('calculates streak from review history', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const cards: SRSCard[] = [
      { ...createCard({ word: 'a', lemma: 'a', sentenceTarget: '', sentenceNative: '', translation: '' }),
        lastReviewed: today.getTime() },
      { ...createCard({ word: 'b', lemma: 'b', sentenceTarget: '', sentenceNative: '', translation: '' }),
        lastReviewed: yesterday.getTime() },
    ];

    const streak = getStreakData(cards);
    expect(streak.currentStreak).toBeGreaterThanOrEqual(1);
    expect(streak.reviewsByDay.size).toBeGreaterThanOrEqual(1);
  });

  it('handles cards with no reviews', () => {
    const cards: SRSCard[] = [
      createCard({ word: 'a', lemma: 'a', sentenceTarget: '', sentenceNative: '', translation: '' }),
    ];

    const streak = getStreakData(cards);
    expect(streak.currentStreak).toBe(0);
    expect(streak.reviewsByDay.size).toBe(0);
  });
});
