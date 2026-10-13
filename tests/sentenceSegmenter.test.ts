import { describe, it, expect } from 'vitest';
import { cleanSubtitleText, splitIntoSentences, consolidateAndSegmentCues } from '../src/core/parser/sentenceSegmenter';
import { SubtitleCue } from '../src/core/types';

describe('SentenceSegmenter', () => {
  it('cleans subtitle text from music and sound effects tags', () => {
    const raw = "I I'm [music] brought to you live [applause] for an announcement.";
    const cleaned = cleanSubtitleText(raw);
    expect(cleaned).toBe("I I'm brought to you live for an announcement.");
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
});
