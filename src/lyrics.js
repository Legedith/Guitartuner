const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
const GENERIC_ARTISTS = new Set(['', 'release', 'topic', 'various artists', 'unknown', 'youtube music']);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finiteTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampFromMatch(match) {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fractionText = match[3] ?? '0';
  return (minutes * 60) + seconds + (Number(fractionText) / (10 ** fractionText.length));
}

function normalizeText(value) {
  return cleanSpace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:feat(?:uring)?|ft)\.?\b/g, ' and ')
    .replace(/\b(?:official|vevo|records?|music|topic)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedTitle(value) {
  return normalizeText(value)
    .replace(/\b(?:live|acoustic|remix(?:ed)?|instrumental|karaoke|cover|demo|unplugged|reprise|sped up|slowed|lo fi|lofi|remaster(?:ed)?|version)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reliableArtist(value) {
  const normalized = normalizeText(value);
  return normalized.length >= 3 && !GENERIC_ARTISTS.has(normalized);
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 100;
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenScore = (intersection / Math.max(leftTokens.size, rightTokens.size, 1)) * 100;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  const containment = longer.includes(shorter) ? (shorter.length / longer.length) * 100 : 0;
  return Math.max(tokenScore, containment);
}

export function lyricsSearchUrl(track) {
  const parameters = new URLSearchParams({ track_name: cleanSpace(track?.title) });
  if (reliableArtist(track?.artist)) parameters.set('artist_name', cleanSpace(track.artist));
  return `${LRCLIB_SEARCH_URL}?${parameters}`;
}

export function scoreLyricsRecord(record, track) {
  if (!record || typeof record !== 'object') return Number.NEGATIVE_INFINITY;
  const recordText = typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim()
    ? record.syncedLyrics
    : typeof record.plainLyrics === 'string' ? record.plainLyrics : '';
  if (!recordText.trim() || record.instrumental) return Number.NEGATIVE_INFINITY;

  const targetTitle = normalizedTitle(track?.title);
  const candidateTitle = normalizedTitle(record.trackName);
  const targetArtist = normalizeText(track?.artist);
  const candidateArtist = normalizeText(record.artistName);
  const titleScore = Math.max(similarity(targetTitle, candidateTitle), similarity(normalizeText(track?.title), normalizeText(record.trackName)));
  const artistScore = reliableArtist(track?.artist) ? similarity(targetArtist, candidateArtist) : 55;
  const targetDuration = Number(track?.duration) || 0;
  const candidateDuration = Number(record.duration) || 0;
  const durationDifference = targetDuration > 0 && candidateDuration > 0 ? Math.abs(targetDuration - candidateDuration) : null;
  const durationScore = durationDifference === null ? 55 : Math.max(0, 100 - Math.min(100, durationDifference * 2));
  const syncedBonus = typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim() ? 8 : 0;
  return (titleScore * .62) + (artistScore * .28) + (durationScore * .1) + syncedBonus;
}

export function selectLyricsRecord(records, track) {
  if (!Array.isArray(records)) return null;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const score = scoreLyricsRecord(record, track);
    if (score > bestScore) {
      best = record;
      bestScore = score;
    }
  }
  return bestScore >= 64 ? best : null;
}

function parseInlineWordTimes(rawLine) {
  const markers = [...rawLine.matchAll(/<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g)];
  const words = [];
  markers.forEach((marker, markerIndex) => {
    const start = marker.index + marker[0].length;
    const end = markerIndex + 1 < markers.length ? markers[markerIndex + 1].index : rawLine.length;
    const segment = cleanSpace(rawLine.slice(start, end).replace(/\[[^\]]+\]/g, ' '));
    const tokens = segment.split(/\s+/).filter(Boolean);
    if (!tokens.length) return;
    const time = timestampFromMatch(marker);
    const nextTime = markerIndex + 1 < markers.length ? timestampFromMatch(markers[markerIndex + 1]) : null;
    tokens.forEach((text, tokenIndex) => {
      const tokenTime = Number.isFinite(nextTime) && nextTime > time
        ? time + (((nextTime - time) * tokenIndex) / tokens.length)
        : time;
      words.push({ time: tokenTime, text });
    });
  });
  return words;
}

export function parseSyncedLyrics(value) {
  const lines = [];
  const source = String(value ?? '').replace(/\r/g, '');
  for (const rawLine of source.split('\n')) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!timestamps.length) continue;
    const text = cleanSpace(rawLine.replace(/\[[^\]]+\]/g, ' ').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, ' '));
    if (!text) continue;
    const wordTimes = parseInlineWordTimes(rawLine);
    for (const match of timestamps) {
      const line = { time: timestampFromMatch(match), text };
      if (wordTimes.length) line.wordTimes = wordTimes.map((word) => ({ ...word }));
      lines.push(line);
    }
  }
  return lines.sort((left, right) => left.time - right.time);
}

export function parsePlainLyrics(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => cleanSpace(line.replace(/^\[[^\]]+\]\s*/, '')))
    .filter(Boolean)
    .map((text) => ({ time: null, text }));
}

export function lyricsLinesFromRecord(record) {
  const synced = parseSyncedLyrics(record?.syncedLyrics);
  if (synced.length) return { lines: synced, synced: true, wordSynced: synced.some((line) => line.wordTimes?.length) };
  return { lines: parsePlainLyrics(record?.plainLyrics), synced: false, wordSynced: false };
}

function collapsedChordEvents(events) {
  const output = [];
  let previousDisplay = '';
  let previousSound = '';
  for (const event of Array.isArray(events) ? events : []) {
    const displayChord = cleanSpace(event?.displayChord ?? event?.chord);
    const soundChord = cleanSpace(event?.soundChord ?? event?.chord);
    if (!displayChord || displayChord === '—' || (displayChord === previousDisplay && soundChord === previousSound)) continue;
    output.push({
      time: Math.max(0, Number(event.time) || 0),
      chord: displayChord,
      soundChord: soundChord || displayChord,
      section: cleanSpace(event.section),
    });
    previousDisplay = displayChord;
    previousSound = soundChord;
  }
  return output;
}

function syncedLineIndex(lines, time) {
  let low = 0;
  let high = lines.length - 1;
  let answer = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].time <= time) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}

function median(values) {
  if (!values.length) return 4;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function lineWords(line) {
  const timedWords = Array.isArray(line?.wordTimes)
    ? line.wordTimes
      .map((word) => ({ text: cleanSpace(word?.text), time: finiteTimestamp(word?.time), chords: [] }))
      .filter((word) => word.text)
    : [];
  if (timedWords.length) return timedWords;
  return cleanSpace(line?.text).split(/\s+/).filter(Boolean).map((text) => ({ text, time: null, chords: [] }));
}

function wordIndexFromTimes(words, time) {
  const timed = words.map((word, index) => ({ index, time: finiteTimestamp(word.time) })).filter((word) => Number.isFinite(word.time));
  if (!timed.length) return null;
  let answer = timed[0].index;
  for (const word of timed) {
    if (word.time > time) break;
    answer = word.index;
  }
  return answer;
}

function locateGlobalWord(lines, target) {
  let remaining = target;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (remaining < lines[lineIndex].words.length) return { lineIndex, wordIndex: remaining };
    remaining -= lines[lineIndex].words.length;
  }
  const lineIndex = Math.max(0, lines.length - 1);
  return { lineIndex, wordIndex: Math.max(0, lines[lineIndex].words.length - 1) };
}

export function placeChordsAboveWords(lines, events, duration = 0) {
  const lyricLines = (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      time: finiteTimestamp(line?.time),
      endTime: null,
      text: cleanSpace(line?.text),
      words: lineWords(line),
      chords: [],
      section: '',
    }))
    .filter((line) => line.text && line.words.length);
  if (!lyricLines.length) return [];

  const chords = collapsedChordEvents(events);
  const timedLyrics = lyricLines.every((line) => Number.isFinite(line.time));
  const songDuration = Math.max(0, Number(duration) || 0);
  if (timedLyrics) {
    const gaps = lyricLines.slice(1).map((line, index) => line.time - lyricLines[index].time).filter((gap) => gap > .2 && gap < 30);
    const fallbackGap = median(gaps);
    lyricLines.forEach((line, index) => {
      const nextTime = lyricLines[index + 1]?.time;
      line.endTime = Number.isFinite(nextTime) && nextTime > line.time
        ? nextTime
        : songDuration > line.time ? songDuration : line.time + fallbackGap;
    });
  }

  const totalWords = lyricLines.reduce((sum, line) => sum + line.words.length, 0);
  chords.forEach((event, eventIndex) => {
    let lineIndex = 0;
    let wordIndex = 0;
    if (timedLyrics) {
      lineIndex = syncedLineIndex(lyricLines, event.time);
      const line = lyricLines[lineIndex];
      const timestampedWord = wordIndexFromTimes(line.words, event.time);
      if (Number.isInteger(timestampedWord)) {
        wordIndex = timestampedWord;
      } else {
        const span = Math.max(.25, line.endTime - line.time);
        const ratio = clamp((event.time - line.time) / span, 0, .999999);
        wordIndex = Math.floor(ratio * line.words.length);
      }
    } else {
      const ratio = songDuration > 0
        ? clamp(event.time / songDuration, 0, .999999)
        : eventIndex / Math.max(1, chords.length);
      const target = Math.min(totalWords - 1, Math.floor(ratio * totalWords));
      ({ lineIndex, wordIndex } = locateGlobalWord(lyricLines, target));
    }

    const line = lyricLines[clamp(lineIndex, 0, lyricLines.length - 1)];
    const word = line.words[clamp(wordIndex, 0, line.words.length - 1)];
    const placement = { chord: event.chord, soundChord: event.soundChord, time: event.time, section: event.section };
    if (!word.chords.some((item) => item.chord === placement.chord && item.soundChord === placement.soundChord)) word.chords.push(placement);
    if (!line.chords.includes(event.chord)) line.chords.push(event.chord);
    if (!line.section && event.section) line.section = event.section;
  });
  return lyricLines;
}

export function placeChordsAboveLyrics(lines, events, duration = 0) {
  return placeChordsAboveWords(lines, events, duration).map((line) => ({
    ...line,
    chords: line.words.flatMap((word) => word.chords.map((placement) => placement.chord)).filter((chord, index, values) => values.indexOf(chord) === index),
  }));
}

export function clampLyricsScrollSpeed(value) {
  return Math.round(clamp(Number(value) || .5, .1, 1) * 10) / 10;
}

export function lyricsScrollRate(scrollHeight, viewportHeight, duration, speed) {
  const distance = Math.max(0, Number(scrollHeight) - Number(viewportHeight));
  const multiplier = clampLyricsScrollSpeed(speed);
  const songDuration = Math.max(0, Number(duration) || 0);
  if (!distance) return 0;
  if (songDuration > 10) return (distance / songDuration) * multiplier;
  return 28 * multiplier;
}
