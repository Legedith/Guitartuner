import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayChord,
  loadLyricsStore,
  parseChordedLyrics,
  saveLyricsStore,
  sanitizeLyricsStore,
  setSongLyrics,
} from '../src/lyrics-sheet.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test('renders inline chord markers above their lyric fragments', () => {
  const entries = parseChordedLyrics('[C]Morning light [G]finds the road\n[Am]Carry on [F]home');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    type: 'line',
    segments: [
      { chord: 'C', text: 'Morning light ' },
      { chord: 'G', text: 'finds the road' },
    ],
  });
  assert.deepEqual(entries[1].segments.map((segment) => segment.chord), ['Am', 'F']);
});

test('pairs a traditional chord row with the following lyric row', () => {
  const entries = parseChordedLyrics('C          G\nMorning light finds the road');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'line');
  assert.deepEqual(entries[0].segments.map((segment) => segment.chord), ['C', 'G']);
  assert.equal(entries[0].segments.map((segment) => segment.text).join(''), 'Morning light finds the road');
});

test('keeps sections, blank space, plain lyrics and chord-only progressions', () => {
  const entries = parseChordedLyrics('[Verse]\nC | G | Am | F\n\nA plain lyric line');
  assert.deepEqual(entries[0], { type: 'section', text: 'Verse' });
  assert.deepEqual(entries[1], { type: 'chords', chords: ['C', 'G', 'Am', 'F'] });
  assert.equal(entries[2].type, 'spacer');
  assert.deepEqual(entries[3], { type: 'line', segments: [{ chord: '', text: 'A plain lyric line' }] });
});

test('does not treat arbitrary bracketed text as a chord', () => {
  const entries = parseChordedLyrics('[Verse 2]\n[quietly] a plain direction');
  assert.deepEqual(entries[0], { type: 'section', text: 'Verse 2' });
  assert.deepEqual(entries[1], { type: 'line', segments: [{ chord: '', text: '[quietly] a plain direction' }] });
});

test('transposes displayed chords without changing stored lyrics', () => {
  assert.equal(displayChord('Am', 2, 'sharps'), 'Bm');
  assert.equal(displayChord('B♭maj7/D', 2, 'flats'), 'Cmaj7/E');
  assert.equal(displayChord('', 2), '');
});

test('lyrics storage is local, sanitized and removable', () => {
  const storage = memoryStorage();
  let store = setSongLyrics({}, 'dQw4w9WgXcQ', '[C]Local words');
  assert.equal(saveLyricsStore(store, storage), true);
  assert.deepEqual(loadLyricsStore(storage), { dQw4w9WgXcQ: '[C]Local words' });
  store = setSongLyrics(store, 'dQw4w9WgXcQ', '   ');
  assert.deepEqual(store, {});
});

test('invalid video ids and non-string values cannot enter the lyric store', () => {
  assert.deepEqual(sanitizeLyricsStore({ bad: 'words', dQw4w9WgXcQ: 42, '9bZkp7q19f0': '[G]valid' }), { '9bZkp7q19f0': '[G]valid' });
});
