import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSongGuidance,
  inferSongKey,
  recommendCapo,
  suggestStrummingPattern,
  transposeEventsForCapo,
} from '../src/song-guidance.js';

function progression(chords, seconds = 10) {
  return chords.map((chord, index) => ({ time: index * seconds, chord }));
}

test('infers common major and minor song keys', () => {
  const cMajor = inferSongKey(progression(['C', 'G', 'Am', 'F']), 'sharps', 40);
  assert.equal(cMajor.name, 'C');
  assert.equal(cMajor.mode, 'major');

  const aMinor = inferSongKey(progression(['Am', 'F', 'C', 'G']), 'sharps', 40);
  assert.equal(aMinor.name, 'Am');
  assert.equal(aMinor.mode, 'minor');

  const dMajor = inferSongKey(progression(['D', 'A', 'Bm', 'G']), 'sharps', 40);
  assert.equal(dMajor.name, 'D');
});

test('uses the chord spelling to choose flat key names', () => {
  const key = inferSongKey(progression(['B♭', 'F', 'Gm', 'E♭']), 'auto', 40);
  assert.equal(key.name, 'B♭');
  assert.equal(key.accidentalMode, 'flats');
});

test('recommends instrument-specific capo shapes', () => {
  const events = progression(['A', 'E', 'F♯m', 'D']);
  const key = inferSongKey(events, 'sharps', 40);
  const guitar = recommendCapo(events, key, 'guitar');
  const ukulele = recommendCapo(events, key, 'ukulele');
  assert.equal(guitar.capo, 2);
  assert.equal(guitar.shapeName, 'G');
  assert.equal(ukulele.capo, 0);
  assert.equal(ukulele.shapeName, 'A');
});

test('capo shapes preserve the original sounding chord', () => {
  const events = transposeEventsForCapo([{ time: 0, chord: 'A' }, { time: 10, chord: 'F♯m' }], 2, 'sharps');
  assert.deepEqual(events.map(({ displayChord, soundChord }) => ({ displayChord, soundChord })), [
    { displayChord: 'G', soundChord: 'A' },
    { displayChord: 'Em', soundChord: 'F♯m' },
  ]);
});

test('strumming suggestions respond to tempo and instrument', () => {
  assert.equal(suggestStrummingPattern({ bpm: 60, instrument: 'guitar' }), '↓ · ↓ · ↓↑');
  assert.equal(suggestStrummingPattern({ bpm: 96, instrument: 'guitar' }), '↓ ↓↑ ↑↓↑');
  assert.equal(suggestStrummingPattern({ bpm: 96, instrument: 'ukulele' }), '↓ ↓↑ ↑↓↑');
  assert.equal(suggestStrummingPattern({ bpm: 150, instrument: 'ukulele' }), '↓↑ ↓↑ ↓↑ ↓↑');
});

test('builds one compact guidance model for the lyric reader', () => {
  const guidance = buildSongGuidance({
    events: progression(['A', 'E', 'F♯m', 'D']),
    chart: { bpm: 96 },
    instrument: 'guitar',
    duration: 40,
    accidentalMode: 'sharps',
  });
  assert.equal(guidance.key.name, 'A');
  assert.equal(guidance.capo.capo, 2);
  assert.equal(guidance.pattern, '↓ ↓↑ ↑↓↑');
  assert.deepEqual(guidance.events.map((event) => event.displayChord), ['G', 'D', 'Em', 'C']);
});
