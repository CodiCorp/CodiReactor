// ─────────────────────────────────────────────────
// SM-2 Spaced Repetition Algorithm
// The core scheduling engine for PhrasePump
// ─────────────────────────────────────────────────

/** Quality rating for SM-2 (0–5) */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** Result of an SM-2 scheduling calculation */
export interface SM2Result {
  /** Days until next review */
  interval: number;
  /** Updated consecutive correct count */
  repetitions: number;
  /** Updated ease factor (1.3 – 2.5+) */
  easeFactor: number;
  /** Unix timestamp of next due date */
  dueDate: number;
}

/** An SRS card ready for review */
export interface SRSCard {
  id: string;
  /** The word/phrase being reviewed */
  word: string;
  lemma: string;
  /** Front side: word in context */
  sentenceTarget: string;
  /** Back side: translation + definition */
  sentenceNative: string;
  translation: string;
  phonetic: string;
  pos: string;
  audioUrl?: string;
  /** SM-2 state */
  interval: number;
  repetitions: number;
  easeFactor: number;
  dueDate: number;
  /** History */
  totalReviews: number;
  correctReviews: number;
  dateAdded: number;
  lastReviewed: number;
}

/**
 * SM-2 Algorithm Implementation.
 * 
 * @param quality - User's self-assessment (0-5):
 *   - 0: Complete blackout
 *   - 1: Wrong, recognized after seeing answer
 *   - 2: Wrong, but felt close
 *   - 3: Correct with serious difficulty
 *   - 4: Correct with some hesitation
 *   - 5: Perfect recall
 * @param repetitions - Current consecutive correct count
 * @param easeFactor - Current ease factor (default 2.5)
 * @param interval - Current interval in days
 * @returns Updated SM-2 parameters
 */
export function sm2(
  quality: ReviewQuality,
  repetitions: number,
  easeFactor: number,
  interval: number,
): SM2Result {
  let newInterval: number;
  let newRepetitions: number;
  let newEF: number;

  if (quality < 3) {
    // Failed: reset to beginning
    newInterval = 1;
    newRepetitions = 0;
    newEF = easeFactor; // Don't change EF on failure
  } else {
    // Passed: advance schedule
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }

    newRepetitions = repetitions + 1;

    // Update ease factor: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
    newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEF = Math.max(1.3, newEF); // Floor at 1.3
  }

  // Calculate due date
  const dueDate = Date.now() + newInterval * 24 * 60 * 60 * 1000;

  return {
    interval: newInterval,
    repetitions: newRepetitions,
    easeFactor: newEF,
    dueDate,
  };
}

/**
 * Create a new SRS card with default SM-2 parameters.
 */
export function createCard(params: {
  word: string;
  lemma: string;
  sentenceTarget: string;
  sentenceNative: string;
  translation: string;
  phonetic?: string;
  pos?: string;
  audioUrl?: string;
}): SRSCard {
  return {
    id: crypto.randomUUID(),
    word: params.word,
    lemma: params.lemma,
    sentenceTarget: params.sentenceTarget,
    sentenceNative: params.sentenceNative,
    translation: params.translation,
    phonetic: params.phonetic || '',
    pos: params.pos || '',
    audioUrl: params.audioUrl,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    dueDate: Date.now(), // Due immediately
    totalReviews: 0,
    correctReviews: 0,
    dateAdded: Date.now(),
    lastReviewed: 0,
  };
}

/**
 * Process a review and return the updated card.
 */
export function reviewCard(card: SRSCard, quality: ReviewQuality): SRSCard {
  const result = sm2(quality, card.repetitions, card.easeFactor, card.interval);

  return {
    ...card,
    interval: result.interval,
    repetitions: result.repetitions,
    easeFactor: result.easeFactor,
    dueDate: result.dueDate,
    totalReviews: card.totalReviews + 1,
    correctReviews: quality >= 3 ? card.correctReviews + 1 : card.correctReviews,
    lastReviewed: Date.now(),
  };
}

/**
 * Get cards due for review, sorted by urgency.
 */
export function getDueCards(cards: SRSCard[], limit: number = 20): SRSCard[] {
  const now = Date.now();
  return cards
    .filter(c => c.dueDate <= now)
    .sort((a, b) => a.dueDate - b.dueDate) // Most overdue first
    .slice(0, limit);
}

/**
 * Get review statistics.
 */
export function getReviewStats(cards: SRSCard[]): {
  total: number;
  due: number;
  learning: number;
  mature: number;
  averageEF: number;
  accuracyPercent: number;
} {
  const now = Date.now();
  const due = cards.filter(c => c.dueDate <= now).length;
  const learning = cards.filter(c => c.interval < 21).length;
  const mature = cards.filter(c => c.interval >= 21).length;
  const totalReviews = cards.reduce((sum, c) => sum + c.totalReviews, 0);
  const correctReviews = cards.reduce((sum, c) => sum + c.correctReviews, 0);

  return {
    total: cards.length,
    due,
    learning,
    mature,
    averageEF: cards.length > 0
      ? cards.reduce((sum, c) => sum + c.easeFactor, 0) / cards.length
      : 2.5,
    accuracyPercent: totalReviews > 0
      ? Math.round((correctReviews / totalReviews) * 100)
      : 0,
  };
}

/**
 * Calculate streak data for activity heatmap.
 */
export function getStreakData(cards: SRSCard[]): {
  currentStreak: number;
  longestStreak: number;
  reviewsByDay: Map<string, number>;
} {
  const reviewsByDay = new Map<string, number>();

  for (const card of cards) {
    if (card.lastReviewed > 0) {
      const dayKey = new Date(card.lastReviewed).toISOString().split('T')[0];
      reviewsByDay.set(dayKey, (reviewsByDay.get(dayKey) || 0) + 1);
    }
  }

  // Calculate current streak
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().split('T')[0];

    if (reviewsByDay.has(dayKey)) {
      streak++;
      if (i === 0 || i === currentStreak) {
        currentStreak = streak;
      }
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 0;
      if (i === 0) currentStreak = 0;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  return { currentStreak, longestStreak, reviewsByDay };
}
