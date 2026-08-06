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
  return (titleScore * 0.62) + (artistScore * 0.28) + (durationScore * 0.10) + syncedBonus;
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

export function parseSyncedLyrics(value) {
  const lines = [];
  const source = String(value ?? '').replace(/\r/g, '');
  for (const rawLine of source.split('\n')) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!timestamps.length) continue;
    const text = cleanSpace(rawLine.replace(/\[[^\]]+\]/g, ' '));
    if (!text) continue;
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionText = match[3] ?? '0';
      const fraction = Number(fractionText) / (10 ** fractionText.length);
      lines.push({ time: (minutes * 60) + seconds + fraction, text });
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
  if (synced.length) return { lines: synced, synced: true };
  return { lines: parsePlainLyrics(record?.plainLyrics), synced: false };
}

function collapsedChordEvents(events) {
  const output = [];
  let previous = '';
  for (const event of Array.isArray(events) ? events : []) {
    const chord = cleanSpace(event?.chord);
    if (!chord || chord === '—' || chord === previous) continue;
    output.push({ time: Math.max(0, Number(event.time) || 0), chord, section: cleanSpace(event.section) });
    previous = chord;
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

export function placeChordsAboveLyrics(lines, events, duration = 0) {
  const lyricLines = (Array.isArray(lines) ? lines : []).map((line) => ({
    time: finiteTimestamp(line?.time),
    text: cleanSpace(line?.text),
    chords: [],
    section: '',
  })).filter((line) => line.text);
  if (!lyricLines.length) return [];

  const chords = collapsedChordEvents(events);
  const timedLyrics = lyricLines.every((line) => Number.isFinite(line.time));
  const songDuration = Math.max(0, Number(duration) || 0);
  chords.forEach((event, eventIndex) => {
    let lineIndex;
    if (timedLyrics) {
      lineIndex = syncedLineIndex(lyricLines, event.time);
    } else if (songDuration > 0) {
      lineIndex = Math.round(clamp(event.time / songDuration, 0, 1) * (lyricLines.length - 1));
    } else {
      lineIndex = Math.round((eventIndex / Math.max(1, chords.length - 1)) * (lyricLines.length - 1));
    }
    const line = lyricLines[clamp(lineIndex, 0, lyricLines.length - 1)];
    if (!line.chords.includes(event.chord)) line.chords.push(event.chord);
    if (!line.section && event.section) line.section = event.section;
  });
  return lyricLines;
}

export function clampLyricsScrollSpeed(value) {
  return Math.round(clamp(Number(value) || 0.5, 0.1, 1) * 10) / 10;
}

export function lyricsScrollRate(scrollHeight, viewportHeight, duration, speed) {
  const distance = Math.max(0, Number(scrollHeight) - Number(viewportHeight));
  const multiplier = clampLyricsScrollSpeed(speed);
  const songDuration = Math.max(0, Number(duration) || 0);
  if (!distance) return 0;
  if (songDuration > 10) return (distance / songDuration) * multiplier;
  return 28 * multiplier;
}
