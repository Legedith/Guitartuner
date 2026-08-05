import { parseChordSymbol, transposeChordSymbol } from './chords.js';

export const DEFAULT_PLAYLIST_URL = 'https://music.youtube.com/playlist?list=PL0gpFgtesNu015JGaKSx8BonbVjGRefKb';
export const DEFAULT_PLAYLIST_CATALOG_URL = './data/playlist-catalog.json';

function finiteNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function cleanText(value, limit = 500) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''; }

export function extractYouTubePlaylistId(value) {
  const source = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{12,}$/.test(source) && /^(PL|OLAK5uy_|RD|UU|LL|FL)/.test(source)) return source;
  try {
    const url = new URL(source);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null;
    const playlistId = url.searchParams.get('list');
    return playlistId && /^[A-Za-z0-9_-]{12,}$/.test(playlistId) ? playlistId : null;
  } catch (_) { return null; }
}

export function extractYouTubeVideoId(value) {
  const source = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(source)) return source;
  try {
    const url = new URL(source);
    if (url.hostname === 'youtu.be') return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
    const fromQuery = url.searchParams.get('v');
    if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
    const match = url.pathname.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  } catch (_) { return null; }
}

export function sanitizeExternalUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href.slice(0, 500) : '';
  } catch (_) { return ''; }
}

export function youtubeVideoUrl(videoId) { return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`; }

export function parseTimestamp(value) {
  const source = String(value ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(source)) return Number(source);
  const parts = source.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return Number.NaN;
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

export function formatTime(seconds, includeHours = false) {
  const safe = Math.max(0, Math.round(finiteNumber(seconds)));
  const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const remainder = safe % 60;
  if (includeHours || hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function cleanChordToken(token) {
  return String(token ?? '').trim().replace(/^[,;]+|[,;]+$/g, '');
}

function chordTokens(value) {
  const source = String(value ?? '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return [];
  return source.split(' ').map(cleanChordToken).filter((token) => token && parseChordSymbol(token));
}

function sectionFromLine(line) {
  const match = line.match(/\[([^\]]+)\]/);
  return match ? match[1].trim().slice(0, 48) : '';
}

export function parseChordChart(value, options = {}) {
  const source = String(value ?? '').replace(/\r/g, '').trim();
  if (!source) return [];
  const bpm = clamp(finiteNumber(options.bpm, 90), 20, 300);
  const beatsPerChord = clamp(finiteNumber(options.beatsPerChord, 4), 0.25, 32);
  const secondsPerChord = (60 / bpm) * beatsPerChord;
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  const timestampPattern = /^(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+(.+)$/;
  const timed = lines.some((line) => timestampPattern.test(line));
  const events = [];
  let pendingSection = '';
  let cursor = Math.max(0, finiteNumber(options.startTime, 0));

  for (const line of lines) {
    const section = sectionFromLine(line);
    const withoutSection = line.replace(/\[[^\]]+\]/g, ' ').trim();
    if (section) pendingSection = section;
    if (!withoutSection) continue;

    const match = withoutSection.match(timestampPattern);
    let tokens;
    if (match) {
      cursor = parseTimestamp(match[1]);
      if (!Number.isFinite(cursor)) continue;
      tokens = chordTokens(match[2]);
    } else if (timed) {
      continue;
    } else {
      tokens = chordTokens(withoutSection);
    }

    for (const symbol of tokens) {
      const parsed = parseChordSymbol(symbol);
      if (!parsed) continue;
      events.push({ time: Math.max(0, cursor), chord: parsed.rest ? '—' : symbol, section: pendingSection });
      pendingSection = '';
      cursor += secondsPerChord;
    }
  }

  const deduplicated = new Map();
  for (const event of events) deduplicated.set(`${event.time.toFixed(3)}:${event.chord}`, event);
  return [...deduplicated.values()].sort((left, right) => left.time - right.time).slice(0, 2000);
}

export function getActiveChordEvent(events, time) {
  if (!Array.isArray(events) || !events.length) return { event: null, index: -1 };
  const currentTime = Math.max(0, finiteNumber(time));
  let low = 0; let high = events.length - 1; let answer = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].time <= currentTime) { answer = middle; low = middle + 1; } else high = middle - 1;
  }
  return { event: answer >= 0 ? events[answer] : null, index: answer };
}

export function transposeChordEvents(events, semitones = 0, accidentalMode = 'sharps') {
  return (Array.isArray(events) ? events : []).map((event) => ({
    ...event,
    chord: event.chord === '—' ? '—' : transposeChordSymbol(event.chord, semitones, accidentalMode),
  }));
}

export function sanitizePlaylistTracks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(); const tracks = [];
  for (const item of value) {
    const videoId = extractYouTubeVideoId(item?.videoId);
    if (!videoId) continue;
    const index = Math.max(0, Math.floor(finiteNumber(item.index, tracks.length)));
    const suppliedCatalogId = cleanText(item.catalogId, 160);
    const catalogId = suppliedCatalogId || `${videoId}:${index}`;
    const dedupeKey = suppliedCatalogId ? catalogId : videoId;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const thumbnail = sanitizeExternalUrl(item.thumbnail) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    tracks.push({
      catalogId,
      videoId,
      index,
      title: cleanText(item.title, 200),
      artist: cleanText(item.artist, 160),
      album: cleanText(item.album, 180),
      releaseYear: clamp(Math.floor(finiteNumber(item.releaseYear)), 0, 2200),
      duration: clamp(finiteNumber(item.duration), 0, 86400),
      thumbnail,
    });
  }
  return tracks.sort((left, right) => left.index - right.index).slice(0, 5000);
}

function richerTrack(base, overlay) {
  if (!overlay) return base;
  return {
    ...base,
    title: overlay.title || base.title,
    artist: overlay.artist || base.artist,
    album: overlay.album || base.album,
    releaseYear: overlay.releaseYear || base.releaseYear,
    duration: overlay.duration || base.duration,
    thumbnail: overlay.thumbnail || base.thumbnail,
  };
}

export function mergePlaylistTracks(primary, secondary) {
  const baseTracks = sanitizePlaylistTracks(primary);
  const overlays = sanitizePlaylistTracks(secondary);
  if (!baseTracks.length) return overlays;
  const byCatalogId = new Map(overlays.map((track) => [track.catalogId, track]));
  const byVideoId = new Map();
  for (const track of overlays) if (!byVideoId.has(track.videoId)) byVideoId.set(track.videoId, track);
  const merged = baseTracks.map((track) => richerTrack(track, byCatalogId.get(track.catalogId) ?? byVideoId.get(track.videoId)));
  const baseIds = new Set(baseTracks.map((track) => track.catalogId));
  const baseVideos = new Set(baseTracks.map((track) => track.videoId));
  for (const track of overlays) if (!baseIds.has(track.catalogId) && !baseVideos.has(track.videoId)) merged.push(track);
  return sanitizePlaylistTracks(merged);
}

export async function loadBundledPlaylistCatalog(url = DEFAULT_PLAYLIST_CATALOG_URL) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Playlist catalog request failed with ${response.status}.`);
  const value = await response.json();
  const tracks = sanitizePlaylistTracks(value?.tracks);
  if (value?.schema !== 'fretline-playlist-catalog' || !tracks.length) throw new Error('The bundled playlist catalog is empty or invalid.');
  return {
    schema: 'fretline-playlist-catalog',
    version: Math.max(1, Math.floor(finiteNumber(value.version, 1))),
    playlistId: cleanText(value.playlistId, 100) || extractYouTubePlaylistId(value.sourceUrl) || '',
    sourceUrl: sanitizeExternalUrl(value.sourceUrl) || DEFAULT_PLAYLIST_URL,
    title: cleanText(value.title, 200) || 'Personal YouTube Music playlist',
    owner: cleanText(value.owner, 160),
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
    reportedEntries: Math.max(tracks.length, Math.floor(finiteNumber(value.reportedEntries, tracks.length))),
    playableEntries: tracks.length,
    skippedEntries: Math.max(0, Math.floor(finiteNumber(value.skippedEntries))),
    tracks,
  };
}

export function sanitizeSongCharts(value) {
  if (!value || typeof value !== 'object') return {};
  const entries = Array.isArray(value) ? value.map((item, index) => [item?.videoId ?? String(index), item]) : Object.entries(value);
  const output = {};
  for (const [key, item] of entries) {
    const videoId = extractYouTubeVideoId(item?.videoId ?? key);
    if (!videoId) continue;
    const raw = typeof item.raw === 'string' ? item.raw.slice(0, 24000) : '';
    const bpm = clamp(finiteNumber(item.bpm, 90), 20, 300);
    const beatsPerChord = clamp(finiteNumber(item.beatsPerChord, 4), 0.25, 32);
    const parsedEvents = parseChordChart(raw, { bpm, beatsPerChord });
    output[videoId] = {
      videoId,
      title: cleanText(item.title, 160),
      artist: cleanText(item.artist, 120),
      bpm,
      beatsPerChord,
      raw,
      sourceUrl: sanitizeExternalUrl(item.sourceUrl),
      events: parsedEvents,
      updatedAt: Math.max(0, finiteNumber(item.updatedAt, Date.now())),
    };
  }
  return output;
}

export function librarySummary(tracks, charts) {
  const safeTracks = sanitizePlaylistTracks(tracks);
  const safeCharts = sanitizeSongCharts(charts);
  const totalDuration = safeTracks.reduce((sum, track) => sum + track.duration, 0);
  const charted = safeTracks.filter((track) => safeCharts[track.videoId]?.events?.length).length;
  const artists = new Map();
  for (const track of safeTracks) if (track.artist) artists.set(track.artist, (artists.get(track.artist) ?? 0) + 1);
  const topArtists = [...artists.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([name, count]) => ({ name, count }));
  return { trackCount: safeTracks.length, charted, totalDuration, topArtists };
}
