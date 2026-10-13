// ─────────────────────────────────────────────────
// Subtitle Parsers: VTT, SRT, TTML, YouTube JSON3
// Pure functions — no side effects, fully testable
// ─────────────────────────────────────────────────

import { SubtitleCue, WordTiming } from '../types';

/** Parse a timestamp string to milliseconds */
function parseTimestamp(ts: string): number {
  // Handles both HH:MM:SS.mmm and HH:MM:SS,mmm (SRT uses comma)
  const normalized = ts.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    const [h, m, rest] = parts;
    const [s, ms = '0'] = rest.split('.');
    return (
      parseInt(h, 10) * 3600000 +
      parseInt(m, 10) * 60000 +
      parseInt(s, 10) * 1000 +
      parseInt(ms.padEnd(3, '0').slice(0, 3), 10)
    );
  } else if (parts.length === 2) {
    // MM:SS.mmm format
    const [m, rest] = parts;
    const [s, ms = '0'] = rest.split('.');
    return (
      parseInt(m, 10) * 60000 +
      parseInt(s, 10) * 1000 +
      parseInt(ms.padEnd(3, '0').slice(0, 3), 10)
    );
  }

  return 0;
}

/** Strip HTML tags from subtitle text */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

// ─── WebVTT Parser ───────────────────────────────

export function parseVTT(vttContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Split into blocks separated by empty lines
  const blocks = vttContent.split(/\n\s*\n/);
  let cueIndex = 0;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find the timing line (contains ' --> ')
    let timingLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(' --> ')) {
        timingLineIdx = i;
        break;
      }
    }
    if (timingLineIdx === -1) continue;

    const timingLine = lines[timingLineIdx];
    const [startStr, endStr] = timingLine.split(' --> ').map(s => s.split(' ')[0].trim());

    const startMs = parseTimestamp(startStr);
    const endMs = parseTimestamp(endStr);

    // Text is everything after the timing line
    const text = lines
      .slice(timingLineIdx + 1)
      .map(l => stripTags(l))
      .filter(l => l.length > 0)
      .join(' ');

    if (text.length > 0) {
      cues.push({
        id: `vtt-${cueIndex++}`,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

// ─── SRT Parser ──────────────────────────────────

export function parseSRT(srtContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalize line endings
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First line is the cue number (or timing line if no number)
    let timingLineIdx = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      timingLineIdx = 1;
    }

    if (timingLineIdx >= lines.length) continue;
    const timingLine = lines[timingLineIdx];
    if (!timingLine.includes(' --> ')) continue;

    const [startStr, endStr] = timingLine.split(' --> ').map(s => s.trim());
    const startMs = parseTimestamp(startStr);
    const endMs = parseTimestamp(endStr);

    const text = lines
      .slice(timingLineIdx + 1)
      .map(l => stripTags(l))
      .filter(l => l.length > 0)
      .join(' ');

    if (text.length > 0) {
      cues.push({
        id: `srt-${lines[0]?.trim() || cues.length}`,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

// ─── TTML / DFXP Parser (Netflix) ────────────────

export function parseTTML(xmlContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Regex-based extraction that works without DOMParser in service worker
  // Match <p> elements with begin/end or begin/dur attributes
  const pRegex = /<p[^>]*\sbegin=["']([^"']+)["'][^>]*\send=["']([^"']+)["'][^>]*>([\s\S]*?)<\/p>/gi;

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pRegex.exec(xmlContent)) !== null) {
    const [, beginStr, endStr, content] = match;
    const startMs = parseTTMLTimestamp(beginStr);
    const endMs = parseTTMLTimestamp(endStr);
    const text = stripTags(content.replace(/<br\s*\/?>/gi, ' ')).trim();

    if (text.length > 0) {
      cues.push({
        id: `ttml-${index++}`,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

/** Parse TTML timestamp formats: HH:MM:SS.mmm or HH:MM:SS:FF (framerate) or ticks */
function parseTTMLTimestamp(ts: string): number {
  ts = ts.trim();

  // Tick format: e.g., "10000000t" = 1 second (10 million ticks)
  if (ts.endsWith('t')) {
    const ticks = parseInt(ts.slice(0, -1), 10);
    return Math.round(ticks / 10000); // Convert ticks to ms
  }

  // Standard HH:MM:SS.mmm or HH:MM:SS:FF
  return parseTimestamp(ts.replace(/:\d{1,2}$/, '')); // Strip frame count if present
}

// ─── YouTube JSON3 Parser ────────────────────────

export interface YouTubeJSON3 {
  wireMagic?: string;
  events?: YouTubeJSON3Event[];
}

interface YouTubeJSON3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{
    utf8: string;
    acAsrConf?: number;
  }>;
  aAppend?: number;
  wWinId?: number;
}

export function parseJSON3(json: YouTubeJSON3): SubtitleCue[] {
  if (!json.events || !Array.isArray(json.events)) return [];

  // 1. First pass: extract raw events, word timings via Language Reactor's Se() algorithm,
  // and clamp previous cue endMs if it overlaps the current cue startMs
  interface RawParsedCue {
    startMs: number;
    endMs: number;
    text: string;
    wordTimings: WordTiming[];
    aAppend?: number;
  }

  const rawList: RawParsedCue[] = [];

  for (const event of json.events) {
    if (!event.segs || event.segs.length === 0) continue;
    if (event.tStartMs === undefined) continue;

    const startMs = event.tStartMs;
    const duration = event.dDurationMs ?? 5000;
    const endMs = startMs + duration;

    // Extract word segments with tOffsetMs (Language Reactor Se() parity)
    const wordTimings: WordTiming[] = [];

    for (let i = 0; i < event.segs.length; i++) {
      const seg = event.segs[i];
      const rawUtf8 = seg.utf8 || '';
      const decoded = decodeHtmlEntities(rawUtf8).replace(/\n/g, ' ');
      const clean = decoded.trim();
      if (!clean) continue;

      const segOffset = seg.tOffsetMs ?? 0;
      const wStart = startMs + segOffset;
      const nextSeg = event.segs[i + 1];
      const nextStart = nextSeg?.tOffsetMs !== undefined ? startMs + nextSeg.tOffsetMs : undefined;
      const wEnd = nextStart && nextStart > wStart ? nextStart : Math.min(endMs, wStart + 800);

      wordTimings.push({
        word: clean,
        startMs: wStart,
        endMs: Math.max(wStart + 100, wEnd),
      });
    }

    const fullText = decodeHtmlEntities(
      event.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim()
    );

    if (fullText.length === 0) continue;

    // Strict Overlap Clamping (Language Reactor we() parity):
    // prevCue.end > currentCue.start -> prevCue.end = currentCue.start
    if (rawList.length > 0) {
      const prev = rawList[rawList.length - 1];
      if (prev.endMs > startMs) {
        prev.endMs = startMs;
      }
    }

    rawList.push({
      startMs,
      endMs,
      text: fullText,
      wordTimings,
      aAppend: event.aAppend,
    });
  }

  // 2. Second pass: Filter rolling ASR fragments and aAppend roll-offs
  const filtered: RawParsedCue[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    const prev = filtered[filtered.length - 1];
    const next = rawList[i + 1];

    const isSingleWord = item.wordTimings.length <= 1 || item.text.split(/\s+/).length <= 1;

    // Prune orphan roll-off fragments (e.g. "Canada.", "Ocean.", "The", "This", "video.")
    // if the single word is already contained at the end of prev or start of next
    if (isSingleWord && (item.aAppend === 1 || item.text.length < 15)) {
      const normText = item.text.toLowerCase().replace(/[^a-z0-9]/gi, '');
      const prevNorm = prev?.text.toLowerCase().replace(/[^a-z0-9]/gi, '') || '';
      const nextNorm = next?.text.toLowerCase().replace(/[^a-z0-9]/gi, '') || '';

      if (prevNorm.endsWith(normText) || nextNorm.startsWith(normText)) {
        continue; // Skip orphan roll-off fragment!
      }
    }

    filtered.push(item);
  }

  // 3. Third pass: Consolidate continuous rolling clauses (gap <= 10ms) matching Language Reactor we()
  const cues: SubtitleCue[] = [];
  let cueIdx = 0;

  for (let i = 0; i < filtered.length; ) {
    const cur = filtered[i];
    const next = filtered[i + 1];

    const isCurComplete = /[.!?]$/.test(cur.text.trim());

    // If next exists, gap <= 10ms, and current is an incomplete clause, merge into a complete sentence (translate.pdf parity)
    if (!isCurComplete && next && (next.startMs - cur.endMs <= 10)) {
      cues.push({
        id: `yt-${cueIdx++}`,
        startMs: cur.startMs,
        endMs: next.endMs,
        text: `${cur.text} ${next.text}`.trim(),
        wordTimings: [...cur.wordTimings, ...next.wordTimings],
      });
      i += 2;
    } else {
      cues.push({
        id: `yt-${cueIdx++}`,
        startMs: cur.startMs,
        endMs: cur.endMs,
        text: cur.text,
        wordTimings: cur.wordTimings,
      });
      i += 1;
    }
  }

  return cues;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * YouTube XML TimedText Parser (handles both <transcript><text ...> and <timedtext><p t="..." d="...">)
 */
export function parseYouTubeXML(xmlContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let index = 0;

  // Format 1: <text start="1.52" dur="3.4">Hello world</text>
  const textTagRegex = /<text\s+[^>]*start=["']([\d.]+)["'][^>]*dur=["']([\d.]+)["'][^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = textTagRegex.exec(xmlContent)) !== null) {
    const [, startSec, durSec, rawText] = match;
    const startMs = Math.round(parseFloat(startSec) * 1000);
    const endMs = startMs + Math.round(parseFloat(durSec) * 1000);
    const text = decodeHtmlEntities(stripTags(rawText.replace(/<br\s*\/?>/gi, ' '))).trim();
    if (text) {
      cues.push({
        id: `yt-xml-${index++}`,
        startMs,
        endMs,
        text,
      });
    }
  }

  if (cues.length > 0) return cues;

  // Format 2: <p t="1520" d="3400">Hello</p>
  const pTagRegex = /<p\s+[^>]*t=["'](\d+)["'][^>]*d=["'](\d+)["'][^>]*>([\s\S]*?)<\/p>/gi;
  while ((match = pTagRegex.exec(xmlContent)) !== null) {
    const [, tMs, dMs, rawText] = match;
    const startMs = parseInt(tMs, 10);
    const endMs = startMs + parseInt(dMs, 10);
    const text = decodeHtmlEntities(stripTags(rawText.replace(/<br\s*\/?>/gi, ' '))).trim();
    if (text) {
      cues.push({
        id: `yt-xml-p-${index++}`,
        startMs,
        endMs,
        text,
      });
    }
  }

  return cues;
}

// ─── Auto-detect and parse ───────────────────────

export function autoParseSubtitles(content: string): SubtitleCue[] {
  const trimmed = content.trim();

  // YouTube JSON3
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      if (json.wireMagic || json.events) {
        return parseJSON3(json);
      }
    } catch {
      // Not valid JSON, fall through
    }
  }

  // YouTube XML timedtext / transcript
  if (trimmed.includes('<transcript') || (trimmed.includes('<text') && trimmed.includes('start=')) || (trimmed.includes('<timedtext') && trimmed.includes('<p '))) {
    const ytXmlCues = parseYouTubeXML(trimmed);
    if (ytXmlCues.length > 0) return ytXmlCues;
  }

  // TTML / XML
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
    return parseTTML(trimmed);
  }

  // WebVTT
  if (trimmed.startsWith('WEBVTT')) {
    return parseVTT(trimmed);
  }

  // Default: try SRT
  return parseSRT(trimmed);
}

export { parseTimestamp };
