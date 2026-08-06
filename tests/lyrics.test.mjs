import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampLyricsScrollSpeed,
  lyricsLinesFromRecord,
  lyricsScrollRate,
  lyricsSearchUrl,
  parsePlainLyrics,
  parseSyncedLyrics,
  placeChordsAboveLyrics,
  placeChordsAboveWords,
  scoreLyricsRecord,
  selectLyricsRecord,
} from '../src/lyrics.js';

test('builds a responsible LRCLIB search URL', () => {
  const url = new URL(lyricsSearchUrl({ title: 'River Road (Live)', artist: 'Example Artist' }));
  assert.equal(url.origin, 'https://lrclib.net');
  assert.equal(url.pathname, '/api/search');
  assert.equal(url.searchParams.get('track_name'), 'River Road (Live)');
  assert.equal(url.searchParams.get('artist_name'), 'Example Artist');
});

test('omits generic artist metadata from lyric searches', () => {
  const url = new URL(lyricsSearchUrl({ title: 'River Road', artist: '- Topic' }));
  assert.equal(url.searchParams.get('track_name'), 'River Road');
  assert.equal(url.searchParams.has('artist_name'), false);
});

test('selects the closest usable synced lyric record', () => {
  const track = { title: 'River Road (Acoustic)', artist: 'Example Artist', duration: 210 };
  const records = [
    { trackName: 'Other River', artistName: 'Other Artist', duration: 210, syncedLyrics: '[00:01.00] Other words' },
    { trackName: 'River Road', artistName: 'Example Artist', duration: 208, syncedLyrics: '[00:01.00] First line' },
    { trackName: 'River Road', artistName: 'Example Artist', duration: 208, instrumental: true, syncedLyrics: '[00:01.00] Not usable' },
  ];
  assert.equal(selectLyricsRecord(records, track), records[1]);
  assert.ok(scoreLyricsRecord(records[1], track) > scoreLyricsRecord(records[0], track));
  assert.equal(scoreLyricsRecord(records[2], track), Number.NEGATIVE_INFINITY);
});

test('parses multiple LRC timestamps and fractional seconds', () => {
  const lines = parseSyncedLyrics('[00:01.25][00:05.5] First light\n[01:02.005] River home\n[offset:20]');
  assert.deepEqual(lines, [
    { time: 1.25, text: 'First light' },
    { time: 5.5, text: 'First light' },
    { time: 62.005, text: 'River home' },
  ]);
});

test('preserves enhanced LRC word timestamps when available', () => {
  const lines = parseSyncedLyrics('[00:00.00]<00:00.00>First <00:01.20>light <00:02.40>falls');
  assert.deepEqual(lines, [{
    time: 0,
    text: 'First light falls',
    wordTimes: [
      { time: 0, text: 'First' },
      { time: 1.2, text: 'light' },
      { time: 2.4, text: 'falls' },
    ],
  }]);
  assert.equal(lyricsLinesFromRecord({ syncedLyrics: '[00:00.00]<00:00.00>First <00:01.20>light' }).wordSynced, true);
});

test('falls back from synced to plain lyric lines', () => {
  assert.deepEqual(lyricsLinesFromRecord({ syncedLyrics: '', plainLyrics: '[Verse]\nFirst light\n\nRiver home' }), {
    synced: false,
    wordSynced: false,
    lines: [{ time: null, text: 'First light' }, { time: null, text: 'River home' }],
  });
  assert.deepEqual(parsePlainLyrics('One line\r\nTwo lines'), [
    { time: null, text: 'One line' },
    { time: null, text: 'Two lines' },
  ]);
});

test('retains line-level chord grouping for compatibility', () => {
  const lines = [
    { time: 0, text: 'First line' },
    { time: 10, text: 'Second line' },
    { time: 20, text: 'Third line' },
  ];
  const events = [
    { time: 0, chord: 'C', section: 'Verse' },
    { time: 8, chord: 'G' },
    { time: 12, chord: 'Am' },
    { time: 22, chord: 'F' },
  ];
  const result = placeChordsAboveLyrics(lines, events, 30);
  assert.deepEqual(result.map((line) => line.chords), [['C', 'G'], ['Am'], ['F']]);
  assert.equal(result[0].section, 'Verse');
});

test('aligns line-timed chord changes above the target lyric word', () => {
  const lines = [
    { time: 0, text: 'We start playing right now' },
    { time: 10, text: 'Then move into the chorus' },
  ];
  const events = [
    { time: 0, chord: 'C' },
    { time: 4, chord: 'G' },
    { time: 8.5, chord: 'Am' },
    { time: 12, chord: 'F' },
  ];
  const result = placeChordsAboveWords(lines, events, 20);
  assert.deepEqual(result[0].words.map((word) => word.chords.map((item) => item.chord)), [
    ['C'], [], ['G'], [], ['Am'],
  ]);
  assert.deepEqual(result[1].words.map((word) => word.chords.map((item) => item.chord)), [
    [], ['F'], [], [], [],
  ]);
});

test('uses enhanced word timestamps before interpolation', () => {
  const lines = parseSyncedLyrics('[00:00.00]<00:00.00>First <00:01.20>light <00:02.40>falls\n[00:04.00]Next line');
  const result = placeChordsAboveWords(lines, [
    { time: .2, chord: 'C' },
    { time: 1.5, chord: 'G' },
    { time: 2.8, chord: 'Am' },
  ], 8);
  assert.deepEqual(result[0].words.map((word) => word.chords.map((item) => item.chord)), [['C'], ['G'], ['Am']]);
});

test('places estimated chord events proportionally across words in plain lyrics', () => {
  const lines = ['One first', 'Two second', 'Three third', 'Four fourth'].map((text) => ({ time: null, text }));
  const events = [
    { time: 0, chord: 'C' },
    { time: 25, chord: 'G' },
    { time: 50, chord: 'Am' },
    { time: 75, chord: 'F' },
    { time: 90, chord: 'F' },
  ];
  const result = placeChordsAboveWords(lines, events, 100);
  assert.deepEqual(result.map((line) => line.words.flatMap((word) => word.chords.map((item) => item.chord))), [['C'], ['G'], ['Am'], ['F']]);
});

test('keeps displayed capo shapes separate from sounding chords', () => {
  const result = placeChordsAboveWords([{ time: 0, text: 'Start here' }], [{
    time: 0,
    chord: 'A',
    displayChord: 'G',
    soundChord: 'A',
  }], 4);
  assert.deepEqual(result[0].words[0].chords[0], { chord: 'G', soundChord: 'A', time: 0, section: '' });
});

test('scroll speed is constrained to the requested 0.1 to 1.0 range', () => {
  assert.equal(clampLyricsScrollSpeed(-2), .1);
  assert.equal(clampLyricsScrollSpeed(.56), .6);
  assert.equal(clampLyricsScrollSpeed(4), 1);
  assert.equal(clampLyricsScrollSpeed('bad'), .5);
});

test('1.0 scroll speed completes the lyrics over the song duration', () => {
  assert.equal(lyricsScrollRate(1500, 500, 200, 1), 5);
  assert.equal(lyricsScrollRate(1500, 500, 200, .5), 2.5);
  assert.equal(lyricsScrollRate(500, 500, 200, 1), 0);
});
