import { describe, it, expect } from 'vitest';
import { cleanSubtitleText, splitIntoSentences, consolidateAndSegmentCues } from '../src/core/parser/sentenceSegmenter';
import { SubtitleCue } from '../src/core/types';

describe('SentenceSegmenter', () => {
  it('cleans subtitle text from music tags, speaker arrows and ASR stutters', () => {
    const raw = ">> That's a That's a T-Rex. [music] >> How did How did they make this?";
    const cleaned = cleanSubtitleText(raw);
    expect(cleaned).toBe("That's a T-Rex. How did they make this?");
  });

  it('cleans pronoun stutters like I I\'m', () => {
    const raw = "I I'm brought to you live for an announcement.";
    const cleaned = cleanSubtitleText(raw);
    expect(cleaned).toBe("I'm brought to you live for an announcement.");
  });

  it('splits paragraphs into distinct sentences', () => {
    const text = "Hello, hello, and welcome to today's video. In today's video, I'm going to give you a chance to practice your English. Are you ready?";
    const sentences = splitIntoSentences(text);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe("Hello, hello, and welcome to today's video.");
    expect(sentences[1]).toBe("In today's video, I'm going to give you a chance to practice your English.");
    expect(sentences[2]).toBe("Are you ready?");
  });

  it('consolidates rolling ASR typewriter cues and eliminates repetition', () => {
    const progressiveCues: SubtitleCue[] = [
      { id: '1', startMs: 1000, endMs: 2000, text: "I'm going to talk to you" },
      { id: '2', startMs: 1000, endMs: 3000, text: "I'm going to talk to you about a variety" },
      { id: '3', startMs: 1000, endMs: 4000, text: "I'm going to talk to you about a variety of different topics." },
    ];

    const result = consolidateAndSegmentCues(progressiveCues);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("I'm going to talk to you about a variety of different topics.");
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(4000);
  });

  it('completely eliminates duplicated blocks of sentences (Image 1 fix)', () => {
    // Simulating identical block re-emitted by loop or duplicate observer
    const duplicatedBlock: SubtitleCue[] = [
      { id: '1', startMs: 1000, endMs: 2500, text: "Are they high?" },
      { id: '2', startMs: 3000, endMs: 4500, text: "Why do I like it?" },
      { id: '3', startMs: 5000, endMs: 6500, text: "Oh my god, this model." },
      // Duplicate block arrives:
      { id: '4', startMs: 1200, endMs: 2700, text: "Are they high?" },
      { id: '5', startMs: 3100, endMs: 4600, text: "Why do I like it?" },
      { id: '6', startMs: 5200, endMs: 6700, text: "Oh my god, this model." },
    ];

    const result = consolidateAndSegmentCues(duplicatedBlock);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.text)).toEqual([
      "Are they high?",
      "Why do I like it?",
      "Oh my god, this model.",
    ]);
  });

  it('eliminates alternating rolling ASR repetitions and absorbs fragments (Image copy 2 fix)', () => {
    const rawStutterLoop: SubtitleCue[] = [
      { id: '1', startMs: 1000, endMs: 3000, text: "How did they make this score this well on benchmark?" },
      { id: '2', startMs: 3200, endMs: 5000, text: "Are they high?" },
      { id: '3', startMs: 5200, endMs: 7000, text: "Why do I like it?" },
      { id: '4', startMs: 7200, endMs: 9000, text: "Oh my god, this model." },
      // Rolling ASR repeats with fragments and delayed timestamps:
      { id: '5', startMs: 9500, endMs: 11000, text: "this well on benchmark?" },
      { id: '6', startMs: 11500, endMs: 13000, text: "Are they high?" },
      { id: '7', startMs: 13500, endMs: 15000, text: "Oh my god," },
      { id: '8', startMs: 15500, endMs: 17000, text: "this well on benchmark?" },
      { id: '9', startMs: 17500, endMs: 19000, text: "Are they high?" },
      { id: '10', startMs: 19500, endMs: 21000, text: "Why do I like it?" },
    ];

    const result = consolidateAndSegmentCues(rawStutterLoop);
    expect(result).toHaveLength(4);
    expect(result.map(r => r.text)).toEqual([
      "How did they make this score this well on benchmark?",
      "Are they high?",
      "Why do I like it?",
      "Oh my god, this model.",
    ]);
  });
});
