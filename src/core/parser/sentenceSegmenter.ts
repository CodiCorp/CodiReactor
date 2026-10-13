// ─────────────────────────────────────────────────
// Sentence Segmenter & Deduplication Engine
// Converts rolling/cumulative ASR transcript streams
// into discrete, sentence-by-sentence subtitle cues
// ─────────────────────────────────────────────────

import { SubtitleCue } from '../types';

/**
 * Clean common YouTube ASR noise like [music], [applause], etc.
 */
export function cleanSubtitleText(text: string): string {
  return text
    .replace(/\[(?:music|applause|laughter|snicker|cheering|ambient)\]/gi, '')
    .replace(/\((?:music|applause|laughter)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Prevents "typewriter style" repetition where each new word creates a duplicate cue.
 */
export function consolidateAndSegmentCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  if (!rawCues || rawCues.length === 0) return [];

  const consolidated: SubtitleCue[] = [];

  for (const raw of rawCues) {
    const cleanedText = cleanSubtitleText(raw.text);
    if (!cleanedText) continue;

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

    // Case 1: The new cue is an extension of the last cue (YouTube progressive/rolling ASR)
    // Example: last = "I'm going to give you a chance", new = "I'm going to give you a chance to practice"
    if (cleanedText.startsWith(last.text) || (last.text.length > 15 && cleanedText.includes(last.text.slice(0, 20)))) {
      last.text = cleanedText;
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 2: The last cue extends the new cue (shorter partial update)
    if (last.text.startsWith(cleanedText)) {
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 3: Overlapping timestamps (< 400ms apart) with identical text
    if (Math.abs(raw.startMs - last.startMs) < 500 && raw.text === last.text) {
      last.endMs = Math.max(last.endMs, raw.endMs);
      continue;
    }

    // Case 4: Completely new cue
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
    const duration = cue.endMs - cue.startMs;
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

  return result;
}
