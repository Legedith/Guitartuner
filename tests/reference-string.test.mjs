import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitchYIN } from '../src/pitch.js';
import { generatePluckedStringSamples, referenceStringDuration } from '../src/reference-string.js';
import { midiToFrequency } from '../src/tunings.js';

const sampleRate = 48000;
const cases = {
  guitar: [36, 40, 45, 50, 55, 59, 64],
  ukulele: [55, 60, 64, 67, 69, 71],
};

for (const [instrument, midiNotes] of Object.entries(cases)) {
  for (const midi of midiNotes) {
    const frequency = midiToFrequency(midi);
    test(`${instrument} reference MIDI ${midi} stays within three cents`, () => {
      const samples = generatePluckedStringSamples({ frequency, instrument, sampleRate, seed: 42 });
      const frameStart = Math.round(sampleRate * 0.09);
      const frame = samples.slice(frameStart, frameStart + 8192);
      const result = detectPitchYIN(frame, sampleRate, { minFrequency: frequency * 0.65, maxFrequency: frequency * 1.55, minClarity: 0.55, minRms: 0.001 });
      assert.ok(result, 'expected a detectable pitch');
      const cents = 1200 * Math.log2(result.frequency / frequency);
      assert.ok(Math.abs(cents) < 3, `${result.frequency.toFixed(3)} Hz (${cents.toFixed(2)} cents)`);
    });
  }
}

test('reference generation is deterministic for a cached pluck variant', () => {
  const first = generatePluckedStringSamples({ frequency: 110, instrument: 'guitar', sampleRate, seed: 9 });
  const second = generatePluckedStringSamples({ frequency: 110, instrument: 'guitar', sampleRate, seed: 9 });
  assert.deepEqual(first.slice(0, 256), second.slice(0, 256));
});

test('reference output stays below full scale', () => {
  const samples = generatePluckedStringSamples({ frequency: 440, instrument: 'ukulele', sampleRate, seed: 7 });
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  assert.ok(peak <= 0.71);
});

test('guitar low strings sustain longer than ukulele strings', () => {
  assert.ok(referenceStringDuration(82.4069, 'guitar') > referenceStringDuration(329.628, 'ukulele'));
});
