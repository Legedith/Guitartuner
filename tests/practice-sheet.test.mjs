import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPracticeGuidance,
  clampPracticeTranspose,
  simplifyChordSymbol,
  transformPracticeEvents,
} from '../src/practice-sheet.js';

function progression(chords, seconds = 10) {
  return chords.map((chord, index) => ({ time: index * seconds, chord }));
}

test('simplifies extensions while preserving the basic chord character', () => {
  assert.equal(simplifyChordSymbol('Cmaj7/G'), 'C');
  assert.equal(simplifyChordSymbol('Am9'), 'Am');
  assert.equal(simplifyChordSymbol('G7'), 'G');
  assert.equal(simplifyChordSymbol('Fsus4'), 'F');
  assert.equal(simplifyChordSymbol('Bm7b5'), 'Bdim');
  assert.equal(simplifyChordSymbol('Caug'), 'Caug');
  assert.equal(simplifyChordSymbol('B♭maj7/D', 'auto'), 'B♭');
});

test('transposes before simplifying the practice progression', () => {
  const events = transformPracticeEvents(progression(['Cmaj7', 'G7', 'Am9', 'Fadd9']), {
    transpose: 2,
    simplify: true,
    accidentalMode: 'sharps',
  });
  assert.deepEqual(events.map((event) => event.chord), ['D', 'A', 'Bm', 'G']);
  assert.deepEqual(events.map((event) => event.originalChord), ['Cmaj7', 'G7', 'Am9', 'Fadd9']);
});

test('full chords remain intact when simplify is off', () => {
  const events = transformPracticeEvents(progression(['Cmaj7', 'G7/B']), {
    transpose: -2,
    simplify: false,
    accidentalMode: 'flats',
  });
  assert.deepEqual(events.map((event) => event.chord), ['B♭maj7', 'F7/A']);
});

test('practice transpose covers every distinct key without a duplicate octave', () => {
  assert.equal(clampPracticeTranspose(-99), -11);
  assert.equal(clampPracticeTranspose(-2.4), -2);
  assert.equal(clampPracticeTranspose(3.6), 4);
  assert.equal(clampPracticeTranspose(99), 11);
});

test('practice guidance updates key and sounding chords', () => {
  const guidance = buildPracticeGuidance({
    events: progression(['Cmaj7', 'G7', 'Am7', 'Fadd9']),
    chart: { bpm: 96 },
    instrument: 'guitar',
    duration: 40,
    accidentalMode: 'sharps',
    transpose: 2,
    simplify: true,
  });
  assert.equal(guidance.key.name, 'D');
  assert.equal(guidance.transpose, 2);
  assert.equal(guidance.simplified, true);
  assert.deepEqual(guidance.events.map((event) => event.soundChord), ['D', 'A', 'Bm', 'G']);
});
