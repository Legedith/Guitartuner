import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  chordVariationCounter,
  collectUniqueSongChords,
  nextChordVariationIndex,
  voicingFretLabel,
} from '../src/song-chord-tray.js';

test('collects each displayed song chord once in first-use order', () => {
  const chords = collectUniqueSongChords([
    { chord: 'C', displayChord: 'C', soundChord: 'D' },
    { chord: 'G', displayChord: 'G', soundChord: 'A' },
    { chord: 'C', displayChord: 'C', soundChord: 'D' },
    { chord: '—' },
    { chord: 'Am' },
  ]);
  assert.deepEqual(chords, [
    { displayChord: 'C', soundChord: 'D' },
    { displayChord: 'G', soundChord: 'A' },
    { displayChord: 'Am', soundChord: 'Am' },
  ]);
});

test('variation arrows wrap in both directions', () => {
  assert.equal(nextChordVariationIndex(0, 4, 1), 1);
  assert.equal(nextChordVariationIndex(3, 4, 1), 0);
  assert.equal(nextChordVariationIndex(0, 4, -1), 3);
  assert.equal(nextChordVariationIndex(2, 1, 1), 0);
  assert.equal(nextChordVariationIndex(2, 0, -1), 0);
});

test('variation counter is compact and one-based', () => {
  assert.equal(chordVariationCounter(0, 6), '1/6');
  assert.equal(chordVariationCounter(5, 6), '6/6');
  assert.equal(chordVariationCounter(99, 6), '6/6');
  assert.equal(chordVariationCounter(0, 0), '0/0');
});

test('fret labels clearly distinguish open and moved shapes', () => {
  assert.equal(voicingFretLabel({ frets: [0, 0, 0, 0] }), 'Open');
  assert.equal(voicingFretLabel({ frets: [-1, 3, 2, 0, 1, 0] }), 'Open · frets 1–3');
  assert.equal(voicingFretLabel({ frets: [-1, 5, 5, 5, 5, -1] }), 'Fret 5');
  assert.equal(voicingFretLabel({ frets: [8, 10, 10, 9, 8, 8] }), 'Frets 8–10');
});

test('practice integration renders tuning-aware variations before lyrics', async () => {
  const source = await readFile(new URL('../src/app-parts/17-song-chord-tray.js', import.meta.url), 'utf8');
  assert.match(source, /insertBefore\(fretlineSongChordTray, fretlineLyricsViewport\)/);
  assert.match(source, /collectUniqueSongChords\(guidanceForTrack\(selectedSong\)\?\.events/);
  assert.match(source, /generateChordVoicings\(/);
  assert.match(source, /createChordDiagramElement\(/);
  assert.match(source, /data-sound-chord/);
  assert.match(source, /chordVariationCounter\(/);
  assert.match(source, /voicingFretLabel\(/);
  assert.match(source, /bassPitchClass: parsed\.slashBass/);
});
