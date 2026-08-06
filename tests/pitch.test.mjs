import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptiveRmsThreshold,
  AutoTargetTracker,
  detectPitchYIN,
  matchPitchToTargets,
  median,
  normalizePitchToTarget,
  PitchSmoother,
  pitchDetectionRmsFloor,
  sensitivityRmsFloor,
  tuningDirection,
  updateAdaptiveNoiseFloor,
} from '../src/pitch.js';

function sineWave(frequency, sampleRate = 48000, length = 4096, harmonicMix = 0, amplitude = 0.75) {
  const buffer = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    buffer[index] = amplitude * (
      (0.75 * Math.sin(2 * Math.PI * frequency * time))
      + (harmonicMix * Math.sin(2 * Math.PI * frequency * 2 * time))
    );
  }
  return buffer;
}

function decayingString(frequency, amplitude, sampleRate = 48000, length = 4096) {
  const buffer = new Float32Array(length);
  let seed = 1337;
  for (let index = 0; index < length; index += 1) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    const noise = ((seed / 0xffffffff) * 2) - 1;
    const time = index / sampleRate;
    const envelope = amplitude * Math.exp(-time * 2.2);
    buffer[index] = envelope * (
      (0.72 * Math.sin(2 * Math.PI * frequency * time))
      + (0.36 * Math.sin(2 * Math.PI * frequency * 2 * time + 0.18))
      + (0.18 * Math.sin(2 * Math.PI * frequency * 3 * time + 0.43))
    ) + (noise * 0.000008);
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

test('YIN remains accurate while a guitar note decays below the old amplitude gate', () => {
  for (const amplitude of [0.02, 0.006, 0.0015]) {
    const result = detectPitchYIN(decayingString(110, amplitude), 48000);
    assert.ok(result, `missing pitch at amplitude ${amplitude}`);
    assert.ok(Math.abs(result.frequency - 110) < 0.7, `${result.frequency} Hz at amplitude ${amplitude}`);
  }
});

test('YIN tracks every standard guitar string at low input level', () => {
  const frequencies = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
  for (const frequency of frequencies) {
    const result = detectPitchYIN(decayingString(frequency, 0.0015), 48000, { minFrequency: 45, minRms: 0.0002 });
    assert.ok(result, `missing ${frequency} Hz`);
    assert.ok(Math.abs(result.frequency - frequency) < 0.8, `${result.frequency} Hz for ${frequency} Hz`);
  }
});

test('YIN rejects silence and broadband noise', () => {
  assert.equal(detectPitchYIN(new Float32Array(4096), 48000), null);
  let seed = 42;
  const noise = new Float32Array(4096);
  for (let index = 0; index < noise.length; index += 1) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    noise[index] = ((((seed / 0xffffffff) * 2) - 1) * 0.02);
  }
  assert.equal(detectPitchYIN(noise, 48000, { minRms: 0.0002, minClarity: 0.57 }), null);
});

test('target matching recovers a second harmonic and reports separation', () => {
  const match = matchPitchToTargets(164.8138, [{ index: 0, frequency: 82.4069 }, { index: 1, frequency: 110 }]);
  assert.ok(match);
  assert.equal(match.target.index, 0);
  assert.ok(Math.abs(match.cents) < 0.01);
  assert.equal(match.harmonic, 2);
  assert.ok(match.margin > 0);
});

test('automatic target tracking can move forward and backward without manual reset', () => {
  const tracker = new AutoTargetTracker({ strongConfirmMs: 40 });
  const first = { target: { index: 3 }, cents: 2, score: 2, margin: 100 };
  const second = { target: { index: 1 }, cents: -4, score: 4, margin: 90 };
  assert.equal(tracker.update(first, 0, 0).accepted, false);
  assert.deepEqual(tracker.update(first, 0, 60), { accepted: true, changed: true, index: 3 });
  assert.equal(tracker.update(second, 3, 120).accepted, false);
  assert.deepEqual(tracker.update(second, 3, 180), { accepted: true, changed: true, index: 1 });
});

test('pitch smoothing rejects an isolated outlier and follows sustained correction', () => {
  const smoother = new PitchSmoother();
  const stable = [8, 7.5, 8.2, 42, 7.8].map((cents, index) => smoother.update({ cents, targetIndex: 0, clarity: 0.9, time: index * 60 }));
  assert.ok(Math.abs(stable.at(-1) - 8) < 2, `${stable.at(-1)} cents`);
  for (let index = 5; index < 12; index += 1) smoother.update({ cents: -12, targetIndex: 0, clarity: 0.92, time: index * 60 });
  assert.ok(smoother.value < -6, `${smoother.value} cents`);
});

test('adaptive sensitivity permits quiet pitch analysis while keeping a noise-aware UI threshold', () => {
  assert.ok(sensitivityRmsFloor(100) < sensitivityRmsFloor(55));
  assert.ok(sensitivityRmsFloor(55) < 0.002);
  assert.ok(pitchDetectionRmsFloor(55, 0.0006) < 0.0006);
  assert.ok(pitchDetectionRmsFloor(100, 0.0006) <= 0.0002);
  assert.ok(adaptiveRmsThreshold(55, 0.001) >= 0.001);
  const quiet = updateAdaptiveNoiseFloor(0.002, 0.0005);
  const pluck = updateAdaptiveNoiseFloor(quiet, 0.03, { pitched: true });
  assert.ok(quiet < 0.002);
  assert.ok(pluck - quiet < 0.00005, `${pluck - quiet}`);
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
