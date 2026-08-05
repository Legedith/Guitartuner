import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYLIST_URL,
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  formatTime,
  getActiveChordEvent,
  librarySummary,
  parseChordChart,
  parseTimestamp,
  sanitizePlaylistTracks,
  sanitizeSongCharts,
  transposeChordEvents,
} from '../src/song-library.js';

const playlistId = 'PL0gpFgtesNu015JGaKSx8BonbVjGRefKb';

test('accepts the supplied YouTube Music playlist', () => {
  assert.equal(extractYouTubePlaylistId(DEFAULT_PLAYLIST_URL), playlistId);
  assert.equal(extractYouTubePlaylistId(`https://www.youtube.com/playlist?list=${playlistId}`), playlistId);
  assert.equal(extractYouTubePlaylistId(playlistId), playlistId);
  assert.equal(extractYouTubePlaylistId('https://example.com/playlist?list=bad'), null);
});

test('extracts supported YouTube video links', () => {
  assert.equal(extractYouTubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('not-a-video'), null);
});

test('parses and formats song time', () => {
  assert.equal(parseTimestamp('1:23'), 83);
  assert.equal(parseTimestamp('1:02:03'), 3723);
  assert.equal(parseTimestamp('12.5'), 12.5);
  assert.ok(Number.isNaN(parseTimestamp('hello')));
  assert.equal(formatTime(83), '1:23');
  assert.equal(formatTime(3723), '1:02:03');
});

test('parses exact timed chord changes and sections', () => {
  const events = parseChordChart('[Intro]\n0:00 C\n0:12 G\n[Verse]\n0:24 Am\n0:36 F');
  assert.deepEqual(events.map(({ time, chord, section }) => ({ time, chord, section })), [
    { time: 0, chord: 'C', section: 'Intro' },
    { time: 12, chord: 'G', section: '' },
    { time: 24, chord: 'Am', section: 'Verse' },
    { time: 36, chord: 'F', section: '' },
  ]);
});

test('turns an untimed progression into equal bars', () => {
  const events = parseChordChart('[Verse] C | G | Am | F', { bpm: 120, beatsPerChord: 4 });
  assert.deepEqual(events.map((event) => [event.time, event.chord]), [[0, 'C'], [2, 'G'], [4, 'Am'], [6, 'F']]);
  assert.equal(events[0].section, 'Verse');
});

test('selects the correct active chord efficiently', () => {
  const events = parseChordChart('0:00 C\n0:10 G\n0:20 Am\n0:30 F');
  assert.deepEqual(getActiveChordEvent(events, 0), { event: events[0], index: 0 });
  assert.deepEqual(getActiveChordEvent(events, 19.99), { event: events[1], index: 1 });
  assert.deepEqual(getActiveChordEvent(events, 99), { event: events[3], index: 3 });
  assert.deepEqual(getActiveChordEvent(events, -1), { event: events[0], index: 0 });
});

test('transposes an entire chart while preserving timing and sections', () => {
  const events = parseChordChart('[Verse]\n0:00 C\n0:10 Am\n0:20 Fmaj7');
  const transposed = transposeChordEvents(events, 2, 'sharps');
  assert.deepEqual(transposed.map((event) => event.chord), ['D', 'Bm', 'Gmaj7']);
  assert.deepEqual(transposed.map((event) => event.time), [0, 10, 20]);
  assert.equal(transposed[0].section, 'Verse');
});

test('sanitizes playlist metadata and removes duplicate videos', () => {
  const tracks = sanitizePlaylistTracks([
    { videoId: 'dQw4w9WgXcQ', index: 2, title: ' Song ', artist: ' Artist ', duration: 213.2 },
    { videoId: 'dQw4w9WgXcQ', index: 3, title: 'Duplicate' },
    { videoId: '9bZkp7q19f0', index: 0, title: 'Another' },
    { videoId: 'bad' },
  ]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].videoId, '9bZkp7q19f0');
  assert.equal(tracks[1].title, 'Song');
  assert.equal(tracks[1].thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
});

test('sanitizes stored chord maps and produces a library summary', () => {
  const charts = sanitizeSongCharts({
    dQw4w9WgXcQ: { videoId: 'dQw4w9WgXcQ', title: 'Song', artist: 'Artist', bpm: 120, beatsPerChord: 4, raw: 'C | G | Am | F' },
    invalid: { videoId: 'bad', raw: 'C' },
  });
  assert.equal(Object.keys(charts).length, 1);
  assert.equal(charts.dQw4w9WgXcQ.events.length, 4);
  const tracks = sanitizePlaylistTracks([{ videoId: 'dQw4w9WgXcQ', index: 0, artist: 'Artist', duration: 200 }, { videoId: '9bZkp7q19f0', index: 1, artist: 'Artist', duration: 100 }]);
  assert.deepEqual(librarySummary(tracks, charts), { trackCount: 2, charted: 1, totalDuration: 300, topArtists: [{ name: 'Artist', count: 2 }] });
});
