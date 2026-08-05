import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHORD_QUALITIES,
  chordPitchClasses,
  formatChordSymbol,
  generateChordVoicings,
  isChordVoicingValid,
  noteNameFromPitchClass,
  parseChordSymbol,
  pitchClassFromName,
  transposeChordSymbol,
  voicingNoteMidis,
} from '../src/chords.js';
import { getTuningById } from '../src/tunings.js';

const guitar = getTuningById('guitar-standard').midi;
const ukulele = getTuningById('ukulele-standard').midi;

function pitchClass(value) { return ((value % 12) + 12) % 12; }

test('parses common, extended, and slash chord spellings', () => {
  assert.deepEqual(parseChordSymbol('Am'), { root: 9, quality: 'minor', slashBass: null, preferFlats: false, rest: false });
  assert.deepEqual(parseChordSymbol('B♭maj7/D'), { root: 10, quality: 'maj7', slashBass: 2, preferFlats: true, rest: false });
  assert.equal(parseChordSymbol('F#sus4').quality, 'sus4');
  assert.equal(parseChordSymbol('Cadd9').quality, 'add9');
  assert.equal(parseChordSymbol('Cm9').quality, 'm9');
  assert.equal(parseChordSymbol('Cdim7').quality, 'dim7');
  assert.equal(parseChordSymbol('N.C.').rest, true);
  assert.equal(parseChordSymbol('C13'), null);
});

test('normalizes note names and formats accidentals', () => {
  assert.equal(pitchClassFromName('C#'), 1);
  assert.equal(pitchClassFromName('D♭'), 1);
  assert.equal(noteNameFromPitchClass(1, 'sharps'), 'C♯');
  assert.equal(noteNameFromPitchClass(1, 'flats'), 'D♭');
  assert.equal(formatChordSymbol(10, 'maj7', 'flats', 2), 'B♭maj7/D');
});

test('transposes supported chord symbols without changing quality', () => {
  assert.equal(transposeChordSymbol('Am', 2, 'sharps'), 'Bm');
  assert.equal(transposeChordSymbol('B♭maj7/D', 2, 'flats'), 'Cmaj7/E');
  assert.equal(transposeChordSymbol('G7', -2, 'sharps'), 'F7');
  assert.equal(transposeChordSymbol('Fadd9', 2, 'sharps'), 'Gadd9');
  assert.equal(transposeChordSymbol('—', 5), '—');
});

for (const symbol of ['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm', 'Bm', 'A7', 'E7', 'Cadd9']) {
  test(`generates a valid standard-guitar ${symbol} shape`, () => {
    const parsed = parseChordSymbol(symbol);
    const voicings = generateChordVoicings(guitar, parsed.root, parsed.quality, { limit: 6 });
    assert.ok(voicings.length > 0, `expected a ${symbol} voicing`);
    assert.ok(isChordVoicingValid(guitar, voicings[0].frets, parsed.root, parsed.quality));
    assert.equal(voicings[0].frets.length, 6);
    assert.ok(voicings[0].frets.every((fret) => Number.isInteger(fret) && fret >= -1 && fret <= 12));
  });
}

for (const quality of CHORD_QUALITIES) {
  test(`supports ${quality.label} on guitar and ukulele`, () => {
    for (const tuning of [guitar, ukulele]) {
      const voicings = generateChordVoicings(tuning, 0, quality.id, { limit: 4 });
      assert.ok(voicings.length > 0, `${quality.id} should have a voicing on ${tuning.length} strings`);
      assert.ok(isChordVoicingValid(tuning, voicings[0].frets, 0, quality.id));
    }
  });
}

test('slash chords put the requested note in the actual bass', () => {
  const parsed = parseChordSymbol('G/B');
  const voicings = generateChordVoicings(guitar, parsed.root, parsed.quality, { limit: 4, bassPitchClass: parsed.slashBass });
  assert.ok(voicings.length > 0);
  const sounded = voicingNoteMidis(guitar, voicings[0].frets).filter(Number.isFinite);
  assert.equal(pitchClass(Math.min(...sounded)), parsed.slashBass);
  assert.ok(isChordVoicingValid(guitar, voicings[0].frets, parsed.root, parsed.quality, { bassPitchClass: parsed.slashBass }));
});

test('generated notes never leave the requested chord pitch classes', () => {
  const parsed = parseChordSymbol('Dmaj7');
  const allowed = new Set(chordPitchClasses(parsed.root, parsed.quality));
  const voicing = generateChordVoicings(guitar, parsed.root, parsed.quality, { limit: 1 })[0];
  const notes = voicingNoteMidis(guitar, voicing.frets).filter(Number.isFinite);
  assert.ok(notes.length >= 4);
  assert.ok(notes.every((midi) => allowed.has(pitchClass(midi))));
});

test('alternate tunings produce shapes from their actual open strings', () => {
  const dadgad = getTuningById('guitar-dadgad').midi;
  const parsed = parseChordSymbol('Dsus4');
  const voicing = generateChordVoicings(dadgad, parsed.root, parsed.quality, { limit: 1 })[0];
  assert.ok(voicing);
  assert.equal(voicing.frets.length, dadgad.length);
  assert.ok(isChordVoicingValid(dadgad, voicing.frets, parsed.root, parsed.quality));
});
