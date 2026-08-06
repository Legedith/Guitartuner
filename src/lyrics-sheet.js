import { parseChordSymbol, transposeChordSymbol } from './chords.js';

export const LYRICS_STORAGE_KEY = 'fretline:lyrics:v1';
export const MAX_LYRICS_LENGTH = 60000;

const SECTION_PATTERN = /^(?:intro|verse|pre[ -]?chorus|chorus|post[ -]?chorus|bridge|hook|refrain|interlude|instrumental|solo|break|outro|ending)(?:\s+\d+)?[:.]?$/i;
const CHORD_SEPARATORS = new Set(['|', '||', ':', '·', '•']);

function cleanRaw(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_LYRICS_LENGTH);
}

function chordValue(value) {
  const token = String(value ?? '').trim();
  return parseChordSymbol(token) ? token : null;
}

function sectionValue(line) {
  const trimmed = line.trim();
  const bracketed = trimmed.match(/^(?:\[([^\]]+)\]|\{([^}]+)\})$/);
  if (bracketed) {
    const inner = (bracketed[1] ?? bracketed[2] ?? '').trim();
    if (inner && !chordValue(inner)) return inner.slice(0, 80);
  }
  if (SECTION_PATTERN.test(trimmed)) return trimmed.replace(/[:.]$/, '').slice(0, 80);
  return null;
}

function inlineSegments(line) {
  const matches = [];
  for (const match of line.matchAll(/\[([^\]]{1,28})\]/g)) {
    const chord = chordValue(match[1]);
    if (chord) matches.push({ chord, index: match.index ?? 0, length: match[0].length });
  }
  if (!matches.length) return null;

  const segments = [];
  let cursor = 0;
  let activeChord = '';
  for (const match of matches) {
    const text = line.slice(cursor, match.index);
    if (text || activeChord) segments.push({ chord: activeChord, text: text || ' ' });
    activeChord = match.chord;
    cursor = match.index + match.length;
  }
  const tail = line.slice(cursor);
  segments.push({ chord: activeChord, text: tail || ' ' });
  return segments;
}

function chordLineTokens(line) {
  const tokens = [];
  for (const match of line.matchAll(/\S+/g)) {
    const raw = match[0];
    if (CHORD_SEPARATORS.has(raw)) continue;
    const chord = chordValue(raw.replace(/^[|:]+|[|:]+$/g, ''));
    if (!chord) return null;
    tokens.push({ chord, index: match.index ?? 0 });
  }
  return tokens.length ? tokens : null;
}

function positionedSegments(chords, lyric) {
  const segments = [];
  if (chords[0].index > 0) {
    segments.push({ chord: '', text: lyric.slice(0, chords[0].index) || ' ' });
  }
  for (let index = 0; index < chords.length; index += 1) {
    const start = chords[index].index;
    const end = chords[index + 1]?.index ?? Math.max(lyric.length, start + chords[index].chord.length + 1);
    const text = lyric.slice(start, end);
    segments.push({ chord: chords[index].chord, text: text || ' ' });
  }
  return segments;
}

export function parseChordedLyrics(value) {
  const lines = cleanRaw(value).split('\n');
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+$/g, '');
    if (!line.trim()) {
      entries.push({ type: 'spacer' });
      continue;
    }

    const section = sectionValue(line);
    if (section) {
      entries.push({ type: 'section', text: section });
      continue;
    }

    const inline = inlineSegments(line);
    if (inline) {
      entries.push({ type: 'line', segments: inline });
      continue;
    }

    const chords = chordLineTokens(line);
    if (chords) {
      const nextLine = lines[index + 1]?.replace(/\s+$/g, '') ?? '';
      const nextIsLyric = Boolean(
        nextLine.trim()
        && !sectionValue(nextLine)
        && !inlineSegments(nextLine)
        && !chordLineTokens(nextLine),
      );
      if (nextIsLyric) {
        entries.push({ type: 'line', segments: positionedSegments(chords, nextLine) });
        index += 1;
      } else {
        entries.push({ type: 'chords', chords: chords.map((item) => item.chord) });
      }
      continue;
    }

    entries.push({ type: 'line', segments: [{ chord: '', text: line }] });
  }

  while (entries[0]?.type === 'spacer') entries.shift();
  while (entries.at(-1)?.type === 'spacer') entries.pop();
  return entries;
}

export function displayChord(chord, semitones = 0, accidentalMode = 'sharps') {
  if (!chord) return '';
  return semitones ? transposeChordSymbol(chord, semitones, accidentalMode) : chord;
}

export function sanitizeLyricsStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [videoId, raw] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || typeof raw !== 'string') continue;
    const cleaned = cleanRaw(raw);
    if (cleaned.trim()) output[videoId] = cleaned;
  }
  return output;
}

export function loadLyricsStore(storage = globalThis.localStorage) {
  if (!storage?.getItem) return {};
  try { return sanitizeLyricsStore(JSON.parse(storage.getItem(LYRICS_STORAGE_KEY) || '{}')); }
  catch (_) { return {}; }
}

export function saveLyricsStore(store, storage = globalThis.localStorage) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(LYRICS_STORAGE_KEY, JSON.stringify(sanitizeLyricsStore(store)));
    return true;
  } catch (_) {
    return false;
  }
}

export function setSongLyrics(store, videoId, raw) {
  const next = { ...sanitizeLyricsStore(store) };
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId ?? ''))) return next;
  const cleaned = cleanRaw(raw);
  if (cleaned.trim()) next[videoId] = cleaned;
  else delete next[videoId];
  return next;
}
