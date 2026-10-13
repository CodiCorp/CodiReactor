// ─────────────────────────────────────────────────
// Sentence Segmenter & Deduplication Engine
// Converts rolling/cumulative ASR transcript streams
// into discrete, sentence-by-sentence subtitle cues
// ─────────────────────────────────────────────────

import { SubtitleCue } from '../types';

/**
 * Clean common YouTube ASR noise:
 * - [music], [applause], brackets
 * - Speaker direction indicators (>>, >)
 * - Speech recognition stutter word/phrase repetitions ("That's a That's a", "How did How did", "I I'm I'm")
 */
export function cleanSubtitleText(text: string): string {
  if (!text) return '';

  let cleaned = text
    .replace(/\[(?:music|applause|laughter|snicker|cheering|ambient|noise)\]/gi, '')
    .replace(/\((?:music|applause|laughter)\)/gi, '')
    // Remove speaker indicators (>> or >)
    .replace(/^>+\s*/, '')
    .replace(/\s+>+\s*/g, ' ')
    // Normalize spaces before punctuation
    .replace(/\s+([.,!?;:])/g, '$1');

  // Remove stutter repetition of 2-word phrases: "That's a That's a" -> "That's a"
  cleaned = cleaned.replace(/\b([a-zA-Z']+\s+[a-zA-Z']+)\s+\1\b/gi, '$1');

  // Remove stutter repetition of single words: "How did How did" or "word word"
  cleaned = cleaned.replace(/\b([a-zA-Z']+)\s+\1\b/gi, '$1');
  cleaned = cleaned.replace(/\b([a-zA-Z']+)\s+\1\b/gi, '$1');

  // Remove common ASR pronoun stutter: "I I'm" -> "I'm"
  cleaned = cleaned.replace(/\bI\s+I'm\b/gi, "I'm");

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Split text into individual sentences based on standard sentence boundaries.
 */
export function splitIntoSentences(text: string): string[] {
  const cleaned = cleanSubtitleText(text);
  if (!cleaned) return [];

  // Match sentence terminators (. ? ! ;) followed by space or end of string
  const sentenceRegex = /[^.?!;]+[.?!;]+(?:\s+|$)|[^.?!;]+$/g;
  const matches = cleaned.match(sentenceRegex);

  if (!matches || matches.length === 0) {
    return [cleaned];
  }

  return matches
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Consolidates rolling ASR cues into discrete, sentence-by-sentence cues.
 * Completely eliminates:
 * 1. Rolling "typewriter style" cumulative duplicates.
 * 2. Block/stream duplicates when cues are re-emitted or looped.
 * 3. Incomplete sentence fragments.
 */
export function consolidateAndSegmentCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  if (!rawCues || rawCues.length === 0) return [];

  // 1. Sort all incoming cues chronologically by start timestamp
  const sorted = [...rawCues].sort((a, b) => a.startMs - b.startMs);
  const consolidated: SubtitleCue[] = [];

  for (const raw of sorted) {
    const cleanedText = cleanSubtitleText(raw.text);
    if (!cleanedText || cleanedText.length < 2) continue;

    // Check if a cue with identical or near-identical text already exists within +/- 20 seconds
    const existingIndex = consolidated.findIndex(existing => {
      const sameText = existing.text.toLowerCase() === cleanedText.toLowerCase();
      const closeTime = Math.abs(existing.startMs - raw.startMs) < 20000;
      return sameText && closeTime;
    });

    if (existingIndex !== -1) {
      // Merge end time if the new cue has longer duration, and skip duplicate row
      consolidated[existingIndex].endMs = Math.max(consolidated[existingIndex].endMs, raw.endMs);
      continue;
    }

    if (consolidated.length === 0) {
      consolidated.push({
        id: raw.id || `cue-0`,
        startMs: raw.startMs,
        endMs: Math.max(raw.endMs, raw.startMs + 1500),
        text: cleanedText,
        translatedText: raw.translatedText,
      });
      continue;
    }

    const last = consolidated[consolidated.length - 1];

    // Case 1: The new cue extends the last cue (YouTube progressive/rolling ASR)
    // Example: last = "I'm going to give you a chance", new = "I'm going to give you a chance to practice"
    if (cleanedText.startsWith(last.text) || (last.text.length > 15 && cleanedText.includes(last.text.slice(0, 20)))) {
      last.text = cleanedText;
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 2: The last cue already includes the new cue (shorter partial update)
    if (last.text.startsWith(cleanedText)) {
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 3: Overlapping timestamps (< 800ms apart) with identical text
    if (Math.abs(raw.startMs - last.startMs) < 800 && raw.text === last.text) {
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 4: Completely distinct new cue
    consolidated.push({
      id: raw.id || `cue-${consolidated.length}`,
      startMs: raw.startMs,
      endMs: Math.max(raw.endMs, raw.startMs + 1500),
      text: cleanedText,
      translatedText: raw.translatedText,
    });
  }

  // Phase 2: Split multi-sentence cues into discrete sentences
  const result: SubtitleCue[] = [];
  let cueId = 0;

  for (const cue of consolidated) {
    const sentences = splitIntoSentences(cue.text);

    if (sentences.length <= 1) {
      result.push({
        ...cue,
        id: `seg-${cueId++}`,
      });
      continue;
    }

    // Proportional duration distribution based on character length
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    const duration = Math.max(cue.endMs - cue.startMs, sentences.length * 1200);
    let currentStart = cue.startMs;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sliceDuration = totalChars > 0 ? Math.round((sentence.length / totalChars) * duration) : Math.round(duration / sentences.length);
      const sentenceEnd = i === sentences.length - 1 ? cue.endMs : currentStart + sliceDuration;

      result.push({
        id: `seg-${cueId++}`,
        startMs: currentStart,
        endMs: Math.max(sentenceEnd, currentStart + 1000),
        text: sentence,
      });

      currentStart = sentenceEnd;
    }
  }

  // Phase 3: Final deduplication pass on generated sentence list
  const finalUnique: SubtitleCue[] = [];
  for (const s of result) {
    const isDup = finalUnique.some(existing => {
      const sameText = existing.text.toLowerCase().trim() === s.text.toLowerCase().trim();
      const closeTime = Math.abs(existing.startMs - s.startMs) < 15000;
      return sameText && closeTime;
    });
    if (!isDup) {
      finalUnique.push(s);
    }
  }

  return finalUnique;
}
