// ─────────────────────────────────────────────────
// Tests: Subtitle Parsers
// ─────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  parseVTT,
  parseSRT,
  parseTTML,
  parseJSON3,
  autoParseSubtitles,
  parseTimestamp,
} from '../src/core/parser/subtitleParser';

// ─── Timestamp Parsing ───────────────────────────

describe('parseTimestamp', () => {
  it('parses HH:MM:SS.mmm format', () => {
    expect(parseTimestamp('00:01:23.456')).toBe(83456);
  });

  it('parses HH:MM:SS,mmm format (SRT comma)', () => {
    expect(parseTimestamp('00:01:23,456')).toBe(83456);
  });

  it('parses MM:SS.mmm format', () => {
    expect(parseTimestamp('01:23.456')).toBe(83456);
  });

  it('parses zero timestamp', () => {
    expect(parseTimestamp('00:00:00.000')).toBe(0);
  });

  it('parses hours correctly', () => {
    expect(parseTimestamp('01:00:00.000')).toBe(3600000);
  });

  it('handles missing milliseconds', () => {
    expect(parseTimestamp('00:01:23')).toBe(83000);
  });
});

// ─── VTT Parser ──────────────────────────────────

describe('parseVTT', () => {
  it('parses a simple WebVTT file', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello, world!

00:00:05.000 --> 00:00:08.000
How are you today?`;

    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello, world!');
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(4000);
    expect(cues[1].text).toBe('How are you today?');
  });

  it('strips HTML tags from cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<b>Bold</b> and <i>italic</i>`;

    const cues = parseVTT(vtt);
    expect(cues[0].text).toBe('Bold and italic');
  });

  it('handles multi-line cues', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Line one
Line two`;

    const cues = parseVTT(vtt);
    expect(cues[0].text).toBe('Line one Line two');
  });

  it('handles cues with identifiers', () => {
    const vtt = `WEBVTT

intro-1
00:00:01.000 --> 00:00:04.000
First cue`;

    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('First cue');
  });

  it('returns empty array for empty input', () => {
    expect(parseVTT('')).toHaveLength(0);
    expect(parseVTT('WEBVTT')).toHaveLength(0);
  });
});

// ─── SRT Parser ──────────────────────────────────

describe('parseSRT', () => {
  it('parses a standard SRT file', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello from SRT!

2
00:00:05,000 --> 00:00:08,000
Second subtitle.`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello from SRT!');
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(4000);
    expect(cues[1].text).toBe('Second subtitle.');
  });

  it('handles multi-line SRT cues', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
First line
Second line`;

    const cues = parseSRT(srt);
    expect(cues[0].text).toBe('First line Second line');
  });

  it('handles Windows CRLF line endings', () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:04,000\r\nHello!\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld!";

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
  });
});

// ─── TTML Parser ─────────────────────────────────

describe('parseTTML', () => {
  it('parses TTML/DFXP format', () => {
    const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">Hello from TTML!</p>
      <p begin="00:00:05.000" end="00:00:08.000">Second subtitle.</p>
    </div>
  </body>
</tt>`;

    const cues = parseTTML(ttml);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello from TTML!');
    expect(cues[0].startMs).toBe(1000);
  });

  it('handles br tags in TTML', () => {
    const ttml = `<tt><body><div>
      <p begin="00:00:01.000" end="00:00:04.000">Line one<br/>Line two</p>
    </div></body></tt>`;

    const cues = parseTTML(ttml);
    expect(cues[0].text).toBe('Line one Line two');
  });

  it('strips HTML styling from TTML content', () => {
    const ttml = `<tt><body><div>
      <p begin="00:00:01.000" end="00:00:04.000"><span style="s1">Styled text</span></p>
    </div></body></tt>`;

    const cues = parseTTML(ttml);
    expect(cues[0].text).toBe('Styled text');
  });
});

// ─── YouTube JSON3 Parser ────────────────────────

describe('parseJSON3', () => {
  it('parses YouTube JSON3 format', () => {
    const json = {
      wireMagic: 'pb3',
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [{ utf8: 'Hello ' }, { utf8: 'from YouTube!' }],
        },
        {
          tStartMs: 5000,
          dDurationMs: 3000,
          segs: [{ utf8: 'Second subtitle.' }],
        },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello from YouTube!');
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(4000);
  });

  it('skips events without segments', () => {
    const json = {
      events: [
        { tStartMs: 0, wWinId: 1 }, // Window styling event
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Real text' }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Real text');
  });

  it('skips empty/newline-only segments', () => {
    const json = {
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Content' }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Content');
  });

  it('returns empty for empty events', () => {
    expect(parseJSON3({ events: [] })).toHaveLength(0);
    expect(parseJSON3({})).toHaveLength(0);
  });
});

// ─── Auto-detect Parser ──────────────────────────

describe('autoParseSubtitles', () => {
  it('detects and parses WebVTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello VTT!`;

    const cues = autoParseSubtitles(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello VTT!');
  });

  it('detects and parses SRT (fallback)', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello SRT!`;

    const cues = autoParseSubtitles(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello SRT!');
  });

  it('detects and parses TTML/XML', () => {
    const ttml = `<?xml version="1.0"?>
<tt><body><div>
  <p begin="00:00:01.000" end="00:00:04.000">Hello TTML!</p>
</div></body></tt>`;

    const cues = autoParseSubtitles(ttml);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello TTML!');
  });

  it('detects and parses YouTube JSON3', () => {
    const json = JSON.stringify({
      wireMagic: 'pb3',
      events: [
        { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: 'Hello JSON!' }] },
      ],
    });

    const cues = autoParseSubtitles(json);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello JSON!');
  });

  it('detects and parses YouTube XML timedtext', () => {
    const xml = `<transcript>
      <text start="1.52" dur="3.4">Hello YouTube &amp; World</text>
      <text start="5.0" dur="2.1">Second line</text>
    </transcript>`;

    const cues = autoParseSubtitles(xml);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello YouTube & World');
    expect(cues[0].startMs).toBe(1520);
    expect(cues[0].endMs).toBe(4920);
    expect(cues[1].text).toBe('Second line');
  });
});

// ─── Language Reactor Parity: TimedText Consolidation & wordTimings ───

describe('Language Reactor Parity: parseJSON3 TimedText Consolidation', () => {
  it('extracts wordTimings using segment tOffsetMs', () => {
    const json = {
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: 'Hello, ' },
            { utf8: 'world!', tOffsetMs: 400 },
          ],
        },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(1);
    expect(cues[0].wordTimings).toBeDefined();
    expect(cues[0].wordTimings).toHaveLength(2);
    expect(cues[0].wordTimings![0].word).toBe('Hello,');
    expect(cues[0].wordTimings![0].startMs).toBe(1000);
    expect(cues[0].wordTimings![1].word).toBe('world!');
    expect(cues[0].wordTimings![1].startMs).toBe(1400);
  });

  it('clamps previous cue endMs when it overlaps next cue startMs', () => {
    const json = {
      events: [
        { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: 'Sentence one.' }] },
        { tStartMs: 3500, dDurationMs: 3000, segs: [{ utf8: 'Sentence two.' }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(2);
    expect(cues[0].endMs).toBe(3500); // Clamped from 5000 to 3500!
  });

  it('prunes rolling ASR orphan fragments (aAppend: 1 or single-word roll-offs)', () => {
    const json = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'First of all, I was born in Vancouver, Canada.' }] },
        { tStartMs: 3000, dDurationMs: 1000, aAppend: 1, segs: [{ utf8: 'Canada.' }] },
        { tStartMs: 4000, dDurationMs: 2500, segs: [{ utf8: 'Vancouver is a city on the west coast of Canada.' }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(2);
    expect(cues.map(c => c.text)).not.toContain('Canada.');
  });

  it('consolidates continuous rolling clauses with gap <= 10ms matching translate.pdf', () => {
    const json = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello, hello, ' }] },
        { tStartMs: 3005, dDurationMs: 2000, segs: [{ utf8: 'and welcome to today\'s video.' }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Hello, hello, and welcome to today's video.");
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(5005);
  });

  it('caps lingering ASR cue duration using fixedEnd (lastWord.startMs + 1300)', () => {
    const json = {
      events: [
        {
          tStartMs: 10000,
          dDurationMs: 8000, // Lingering 8-second duration from raw YouTube ASR
          segs: [
            { utf8: 'I ', acAsrConf: 250, tOffsetMs: 0 },
            { utf8: 'started ', acAsrConf: 250, tOffsetMs: 200 },
            { utf8: 'posting.', acAsrConf: 250, tOffsetMs: 700 }, // Last word starts at 10700
          ],
        },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(1);
    // fixedEnd should cap 10000 + 8000 = 18000 down to 10700 + 1300 = 12000ms!
    expect(cues[0].endMs).toBe(12000);
  });

  it('replicates translate.pdf vLijZb9BpkE sequence for 5:37, 5:40, 5:48', () => {
    // Exact crawling events for vLijZb9BpkE
    const json = {
      events: [
        // 5:37 (337000ms)
        {
          tStartMs: 337000,
          dDurationMs: 2900,
          segs: [
            { utf8: 'this ', acAsrConf: 250, tOffsetMs: 0 },
            { utf8: 'point. ', acAsrConf: 250, tOffsetMs: 350 },
            { utf8: 'I ', acAsrConf: 250, tOffsetMs: 800 },
            { utf8: 'started ', acAsrConf: 250, tOffsetMs: 1000 },
            { utf8: 'posting ', acAsrConf: 250, tOffsetMs: 1400 },
            { utf8: 'some ', acAsrConf: 250, tOffsetMs: 1800 },
            { utf8: 'grammar ', acAsrConf: 250, tOffsetMs: 2100 },
            { utf8: 'lessons,', acAsrConf: 250, tOffsetMs: 2500 },
          ],
        },
        // 5:40 (340000ms) - continuous crawl pair (gap <= 10ms between part 1 and part 2)
        {
          tStartMs: 340000,
          dDurationMs: 4000,
          segs: [
            { utf8: 'some ', acAsrConf: 250, tOffsetMs: 0 },
            { utf8: 'tips ', acAsrConf: 250, tOffsetMs: 300 },
            { utf8: 'and ', acAsrConf: 250, tOffsetMs: 600 },
            { utf8: 'tricks ', acAsrConf: 250, tOffsetMs: 800 },
            { utf8: 'on ', acAsrConf: 250, tOffsetMs: 1300 },
            { utf8: 'uh ', acAsrConf: 250, tOffsetMs: 1600 },
            { utf8: 'vocabulary, ', acAsrConf: 250, tOffsetMs: 1800 },
          ],
        },
        {
          tStartMs: 344005, // 5ms gap with previous cue (344005 - 344000 = 5ms <= 10ms) -> merged!
          dDurationMs: 4000,
          segs: [
            { utf8: 'idioms, ', acAsrConf: 250, tOffsetMs: 0 },
            { utf8: 'slang, ', acAsrConf: 250, tOffsetMs: 600 },
            { utf8: 'that ', acAsrConf: 250, tOffsetMs: 1200 },
            { utf8: 'kind ', acAsrConf: 250, tOffsetMs: 1500 },
            { utf8: 'of ', acAsrConf: 250, tOffsetMs: 1800 },
            { utf8: 'thing. ', acAsrConf: 250, tOffsetMs: 2000 },
            { utf8: 'As', acAsrConf: 250, tOffsetMs: 2500 },
          ],
        },
        // 5:48 (348100ms) - speech continues after short pause (gap > 10ms)
        {
          tStartMs: 348100,
          dDurationMs: 5000,
          segs: [
            { utf8: "I'm ", acAsrConf: 250, tOffsetMs: 0 },
            { utf8: 'sure ', acAsrConf: 250, tOffsetMs: 250 },
            { utf8: 'you ', acAsrConf: 250, tOffsetMs: 500 },
            { utf8: 'know, ', acAsrConf: 250, tOffsetMs: 700 },
            { utf8: "you've ", acAsrConf: 250, tOffsetMs: 1100 },
            { utf8: 'seen ', acAsrConf: 250, tOffsetMs: 1400 },
            { utf8: 'my ', acAsrConf: 250, tOffsetMs: 1700 },
            { utf8: 'videos, ', acAsrConf: 250, tOffsetMs: 1900 },
            { utf8: 'probably. ', acAsrConf: 250, tOffsetMs: 2400 },
            { utf8: 'If ', acAsrConf: 250, tOffsetMs: 2900 },
            { utf8: 'this ', acAsrConf: 250, tOffsetMs: 3100 },
            { utf8: 'is ', acAsrConf: 250, tOffsetMs: 3300 },
            { utf8: 'your ', acAsrConf: 250, tOffsetMs: 3500 },
            { utf8: 'first', acAsrConf: 250, tOffsetMs: 3800 },
          ],
        },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(3);

    // Cue 1: 5:37
    expect(cues[0].startMs).toBe(337000);
    expect(cues[0].text).toBe('this point. I started posting some grammar lessons,');

    // Cue 2: 5:40 (consolidated pair)
    expect(cues[1].startMs).toBe(340000);
    expect(cues[1].text).toBe(
      'some tips and tricks on uh vocabulary, idioms, slang, that kind of thing. As'
    );

    // Cue 3: 5:48
    expect(cues[2].startMs).toBe(348100);
    expect(cues[2].text).toBe(
      "I'm sure you know, you've seen my videos, probably. If this is your first"
    );
  });

  it('matches Language Reactor 14 sentiment cards structure for vLijZb9BpkE opening exactly', () => {
    const json = {
      events: [
        { tStartMs: 0, dDurationMs: 3100, segs: [{ utf8: "Hello, hello, and welcome to today's video." }] },
        { tStartMs: 3200, dDurationMs: 4000, segs: [{ utf8: "In today's video, I'm going to give you a chance to practice your English" }] },
        { tStartMs: 7400, dDurationMs: 3800, segs: [{ utf8: "listening skills. We're going to have a conversation. I'm" }] },
        { tStartMs: 11400, dDurationMs: 4200, segs: [{ utf8: "going to talk to you about a variety of different topics, and you're going to" }] },
        { tStartMs: 15800, dDurationMs: 4100, segs: [{ utf8: "have a chance to practice listening to and understanding real-world spoken" }] },
        { tStartMs: 20100, dDurationMs: 3200, segs: [{ utf8: "English. This is a topic, or rather a video, that" }] },
        { tStartMs: 23500, dDurationMs: 4500, segs: [{ utf8: "many of you have requested, and I think it's a great idea because honestly, the" }] },
        { tStartMs: 28200, dDurationMs: 4000, segs: [{ utf8: "more you listen to English, the more exposure you get to the English" }] },
        { tStartMs: 32400, dDurationMs: 4800, segs: [{ utf8: "language, the better your English will become and the faster you will improve." }] },
        { tStartMs: 37400, dDurationMs: 2800, segs: [{ utf8: "Now, today I'm going to tell you a bit more" }] },
        { tStartMs: 40400, dDurationMs: 4200, segs: [{ utf8: "about myself. This is not something I normally talk about on this channel. The" }] },
        { tStartMs: 44800, dDurationMs: 4900, segs: [{ utf8: "focus is normally grammar, vocabulary, speaking, and pronunciation, but I know" }] },
        { tStartMs: 49900, dDurationMs: 4100, segs: [{ utf8: "many of you are curious about my background, how I started teaching" }] },
        { tStartMs: 54200, dDurationMs: 3500, segs: [{ utf8: "English, so I thought this would be a good opportunity to" }] },
      ],
    };

    const cues = parseJSON3(json);
    expect(cues).toHaveLength(14);
    expect(cues[0].text).toBe("Hello, hello, and welcome to today's video.");
    expect(cues[1].text).toBe("In today's video, I'm going to give you a chance to practice your English");
    expect(cues[2].text).toBe("listening skills. We're going to have a conversation. I'm");
    expect(cues[3].text).toBe("going to talk to you about a variety of different topics, and you're going to");
    expect(cues[4].text).toBe("have a chance to practice listening to and understanding real-world spoken");
    expect(cues[5].text).toBe("English. This is a topic, or rather a video, that");
    expect(cues[6].text).toBe("many of you have requested, and I think it's a great idea because honestly, the");
    expect(cues[7].text).toBe("more you listen to English, the more exposure you get to the English");
    expect(cues[8].text).toBe("language, the better your English will become and the faster you will improve.");
    expect(cues[9].text).toBe("Now, today I'm going to tell you a bit more");
    expect(cues[10].text).toBe("about myself. This is not something I normally talk about on this channel. The");
    expect(cues[11].text).toBe("focus is normally grammar, vocabulary, speaking, and pronunciation, but I know");
    expect(cues[12].text).toBe("many of you are curious about my background, how I started teaching");
    expect(cues[13].text).toBe("English, so I thought this would be a good opportunity to");
  });
});

