import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS, PRESET_TUNINGS, buildTargetStrings, formatMidiNote, getTuningsForInstrument, midiToFrequency, sanitizeCustomTunings } from '../src/tunings.js';

test('standard guitar is the default six-string tuning', () => {
  const standard = PRESET_TUNINGS.find((item) => item.id === INSTRUMENTS.guitar.defaultTuningId);
  assert.deepEqual(standard.midi, [40, 45, 50, 55, 59, 64]);
  assert.equal(buildTargetStrings(standard).length, 6);
});

test('standard ukulele uses re-entrant high G', () => {
  const standard = PRESET_TUNINGS.find((item) => item.id === INSTRUMENTS.ukulele.defaultTuningId);
  assert.deepEqual(standard.midi, [67, 60, 64, 69]);
  assert.equal(buildTargetStrings(standard)[0].number, 4);
});

test('A4 calibration shifts targets', () => {
  assert.equal(midiToFrequency(69, 442), 442);
  assert.ok(midiToFrequency(40, 442) > midiToFrequency(40, 440));
});

test('flat spelling is available', () => assert.equal(formatMidiNote(63, 'flats'), 'E♭4'));

test('custom tuning sanitization rejects malformed entries', () => {
  const cleaned = sanitizeCustomTunings([{ id: 'good', instrument: 'ukulele', name: '  My uke  ', midi: [67, 60, 64, 69] }, { id: 'bad', instrument: 'guitar', name: 'Bad', midi: [40, 45] }]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].name, 'My uke');
});

test('both instruments have alternate tunings', () => {
  assert.ok(getTuningsForInstrument('guitar').length >= 8);
  assert.ok(getTuningsForInstrument('ukulele').length >= 4);
});
