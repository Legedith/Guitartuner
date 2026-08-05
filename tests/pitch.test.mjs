import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitchYIN, matchPitchToTargets, median, normalizePitchToTarget, tuningDirection } from '../src/pitch.js';

function sineWave(frequency, sampleRate = 48000, length = 4096, harmonicMix = 0) {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const time = i / sampleRate;
    buffer[i] = (0.75 * Math.sin(2 * Math.PI * frequency * time)) + (harmonicMix * Math.sin(2 * Math.PI * frequency * 2 * time));
  }
  return buffer;
}

test('YIN detects low guitar E', () => {
  const result = detectPitchYIN(sineWave(82.4069), 48000);
  assert.ok(result);
  assert.ok(Math.abs(result.frequency - 82.4069) < 0.35, `${result.frequency} Hz`);
  assert.ok(result.clarity > 0.9);
});

test('YIN detects ukulele A4 with a strong harmonic', () => {
  const result = detectPitchYIN(sineWave(440, 48000, 4096, 0.45), 48000);
  assert.ok(result);
  assert.ok(Math.abs(result.frequency - 440) < 0.8, `${result.frequency} Hz`);
});

test('YIN rejects silence', () => assert.equal(detectPitchYIN(new Float32Array(4096), 48000), null));

test('target matching recovers a second harmonic', () => {
  const match = matchPitchToTargets(164.8138, [{ index: 0, frequency: 82.4069 }, { index: 1, frequency: 110 }]);
  assert.ok(match);
  assert.equal(match.target.index, 0);
  assert.ok(Math.abs(match.cents) < 0.01);
  assert.equal(match.harmonic, 2);
});

test('manual matching folds octaves and preserves cents', () => {
  const match = normalizePitchToTarget(220 * (2 ** (7 / 1200)), 110);
  assert.ok(Math.abs(match.cents - 7) < 0.001);
});

test('helpers are stable', () => {
  assert.equal(median([9, 1, 5, 3]), 4);
  assert.equal(tuningDirection(-4), 'flat');
  assert.equal(tuningDirection(2.5), 'in-tune');
  assert.equal(tuningDirection(9), 'sharp');
});
