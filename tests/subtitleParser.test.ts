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
});
