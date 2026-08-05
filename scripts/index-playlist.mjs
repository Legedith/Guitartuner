import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_PLAYLIST_ID = 'PL0gpFgtesNu015JGaKSx8BonbVjGRefKb';
const DEFAULT_SOURCE_URL = `https://music.youtube.com/playlist?list=${DEFAULT_PLAYLIST_ID}`;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function cleanArtist(value) {
  return cleanText(value, 160)
    .replace(/\s+-\s+Topic$/i, '')
    .replace(/^Various Artists$/i, '')
    .trim();
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => cleanArtist(item?.name ?? item))
        .filter(Boolean)
        .join(', ');
      if (joined) return joined;
      continue;
    }
    const cleaned = cleanText(value, 200);
    if (cleaned) return cleaned;
  }
  return '';
}

function youtubeVideoId(value) {
  const source = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(source)) return source;
  try {
    const url = new URL(source);
    const direct = url.searchParams.get('v');
    if (direct && /^[A-Za-z0-9_-]{11}$/.test(direct)) return direct;
    const match = url.pathname.match(/\/(?:watch|embed|shorts)?\/?([A-Za-z0-9_-]{11})(?:$|[/?])/);
    return match?.[1] ?? null;
  } catch (_) {
    return null;
  }
}

function titleAndArtist(entry) {
  let title = firstText(entry.track, entry.title, entry.fulltitle, entry.alt_title);
  let artist = cleanArtist(firstText(entry.artists, entry.artist, entry.creator, entry.uploader, entry.channel));

  if (!artist && title.includes(' - ')) {
    const [possibleArtist, ...rest] = title.split(' - ');
    if (rest.length) {
      artist = cleanArtist(possibleArtist);
      title = cleanText(rest.join(' - '), 200);
    }
  }

  title = title
    .replace(/\s*\((?:official\s+)?(?:music\s+)?video\)\s*$/i, '')
    .replace(/\s*\[(?:official\s+)?(?:music\s+)?video\]\s*$/i, '')
    .replace(/\s*\((?:official\s+)?audio\)\s*$/i, '')
    .replace(/\s*\[(?:official\s+)?audio\]\s*$/i, '')
    .trim();

  return { title: cleanText(title, 200), artist: cleanArtist(artist) };
}

function bestThumbnail(entry, videoId) {
  const thumbnails = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const candidate = [...thumbnails]
    .filter((item) => typeof item?.url === 'string' && /^https:\/\//.test(item.url))
    .sort((left, right) => finiteNumber(right.width) - finiteNumber(left.width))[0]?.url;
  return candidate?.slice(0, 500) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function normalizeEntry(entry, fallbackIndex) {
  const videoId = youtubeVideoId(entry?.id ?? entry?.url ?? entry?.webpage_url ?? entry?.original_url);
  if (!videoId) return null;
  const playlistIndex = Math.max(0, Math.floor(finiteNumber(entry.playlist_index, fallbackIndex + 1)) - 1);
  const { title, artist } = titleAndArtist(entry);
  const releaseYear = Math.max(0, Math.floor(finiteNumber(entry.release_year ?? String(entry.release_date ?? '').slice(0, 4))));

  return {
    catalogId: `${videoId}:${playlistIndex}`,
    videoId,
    index: playlistIndex,
    title: title || `Track ${playlistIndex + 1}`,
    artist,
    album: cleanText(entry.album, 180),
    releaseYear: releaseYear >= 1900 && releaseYear <= 2200 ? releaseYear : 0,
    duration: Math.max(0, Math.round(finiteNumber(entry.duration) * 1000) / 1000),
    thumbnail: bestThumbnail(entry, videoId),
  };
}

async function main() {
  const inputPath = resolve(process.argv[2] || '/tmp/fretline-playlist.json');
  const outputPath = resolve(process.argv[3] || 'src/data/playlist-catalog.json');
  const minimumEntries = Math.max(1, Number(process.env.MIN_PLAYLIST_ENTRIES || 1000));
  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const tracks = entries.map(normalizeEntry).filter(Boolean).sort((left, right) => left.index - right.index);

  if (tracks.length < minimumEntries) {
    throw new Error(`Playlist extraction returned ${tracks.length} playable entries; expected at least ${minimumEntries}. Refusing to publish a partial catalog.`);
  }

  const playlistId = cleanText(raw.id, 100) || DEFAULT_PLAYLIST_ID;
  const sourceUrl = cleanText(raw.webpage_url ?? raw.original_url, 500) || DEFAULT_SOURCE_URL;
  const reportedEntries = Math.max(entries.length, Math.floor(finiteNumber(raw.playlist_count, entries.length)));
  const catalog = {
    schema: 'fretline-playlist-catalog',
    version: 1,
    playlistId,
    sourceUrl,
    title: cleanText(raw.title, 200) || 'Personal YouTube Music playlist',
    owner: cleanText(raw.uploader ?? raw.channel, 160),
    generatedAt: new Date().toISOString(),
    reportedEntries,
    playableEntries: tracks.length,
    skippedEntries: Math.max(0, reportedEntries - tracks.length),
    tracks,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Indexed ${tracks.length} playable entries from ${reportedEntries} reported playlist entries.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
