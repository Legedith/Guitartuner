import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitchYIN, matchPitchToTargets, comparePitchToTarget, PitchSmoother, TuningStabilityTracker, AutoTargetTracker, updateAdaptiveNoiseFloor, sensitivityRmsFloor } from '../src/pitch.js';

const centsBetween = (actual, expected) => 1200 * Math.log2(actual / expected);
const guitar = [82.4068892282, 110, 146.8323839587, 195.9977179909, 246.9416506281, 329.6275569129].map((frequency, index) => ({ frequency, index }));
function signal(frequency, { sampleRate = 48000, length = 4096, partials = [1, 0.5, 0.25], amplitude = 0.2, decay = 2.2, noise = 0, dc = 0, phase = 0 } = {}) {
  let seed = 731;
  return Float32Array.from({ length }, (_, index) => {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    const time = index / sampleRate;
    const tone = partials.reduce((sum, weight, harmonic) => sum + weight * Math.sin((2 * Math.PI * frequency * (harmonic + 1) * time) + phase + (0.18 * harmonic)), 0);
    return dc + (amplitude * Math.exp(-time * decay) * tone) + (noise * (((seed / 0xffffffff) * 2) - 1));
  });
}
function detect(frequency, options = {}) {
  const sampleRate = options.sampleRate ?? 48000;
  return detectPitchYIN(signal(frequency, options), sampleRate, { minFrequency: 30, maxFrequency: 2300, minRms: 0.0002 });
}

test('every standard string stays accurate at common device rates, phases, and detunings', () => {
  for (const sampleRate of [44100, 48000, 96000]) for (const target of guitar) for (const detuning of [-170, 0, 170]) {
    const frequency = target.frequency * (2 ** (detuning / 1200));
    const result = detect(frequency, { sampleRate, length: sampleRate > 48000 ? 8192 : 4096, phase: 0.73, noise: 0.001 });
    assert.ok(result, `missing ${frequency} Hz at ${sampleRate}`);
    assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 1, `${frequency} Hz at ${sampleRate}: ${result.frequency}`);
  }
});

test('a strong second or third harmonic does not hide an audible fundamental', () => {
  for (const frequency of [65.4064, 82.4069, 110, 196, 329.6276, 440]) for (const partials of [[0.1, 1], [0.2, 1], [0.1, 0.2, 1], [0, 1, 0.5]]) {
    const result = detect(frequency, { partials, phase: 0.43 });
    assert.ok(result, `missing ${frequency}, partials ${partials}`);
    assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 2, `${frequency}, partials ${partials}: ${result.frequency}`);
  }
});

test('live preset frequency bounds still recover upper partials and fractional short periods', () => {
  const cases = [
    { frequency: 329.6275569129, minimum: 82.4068892282 * 0.7, maximum: 329.6275569129 * 1.6 },
    { frequency: 471.580323516, minimum: 261.6255653006 * 0.7, maximum: 440 * 1.6 },
    { frequency: 529.331015876, minimum: 293.6647679174 * 0.7, maximum: 493.8833012561 * 1.6 },
  ];
  for (const { frequency, minimum, maximum } of cases) for (const sampleRate of [44100, 48000, 96000, 192000]) {
    const length = Math.min(32768, Math.max(2048, 2 ** Math.ceil(Math.log2(sampleRate * Math.max(0.085, 3 / minimum)))));
    const frame = signal(frequency, { sampleRate, length, partials: [0.1, 0.2, 1], phase: 0.73, noise: 0.0001 });
    const result = detectPitchYIN(frame, sampleRate, { minFrequency: minimum, maxFrequency: maximum, threshold: 0.12, minClarity: 0.7, minRms: 0.0005 });
    assert.ok(result, `missing ${frequency} Hz at ${sampleRate}`);
    assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 1, `${frequency} Hz at ${sampleRate}: ${result.frequency}`);
  }
  assert.equal(detectPitchYIN(signal(880, { partials: [1], decay: 0 }), 48000, { minFrequency: 57, maxFrequency: 530, threshold: 0.12 }), null);
});

test('pure tones do not become subharmonics when later YIN minima are deeper', () => {
  for (const frequency of [65.4064, 82.4069, 110, 196, 329.6276, 440, 987.7666, 2093.0045]) for (const phase of [0, 1.7, 4.3]) {
    const result = detect(frequency, { partials: [1], decay: 0, phase });
    assert.ok(result, `missing ${frequency}`);
    assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 1.5, `${frequency}: ${result.frequency}`);
  }
});

test('low and high custom notes are measurable with enough frame duration', () => {
  for (const sampleRate of [44100, 48000, 96000, 192000]) for (const frequency of [32.7032, 65.4064, 82.4069, 2093.0045]) {
    const length = 2 ** Math.ceil(Math.log2(sampleRate * 0.086));
    const result = detect(frequency, { sampleRate, length });
    assert.ok(result, `missing ${frequency} Hz at ${sampleRate}`);
    assert.ok(Math.abs(centsBetween(result.frequency, frequency)) < 2, `${frequency} Hz at ${sampleRate}: ${result.frequency}`);
  }
});

test('quiet decaying notes, DC offset, and a harder pluck remain accurate', () => {
  for (const amplitude of [0.0015, 0.01, 0.2]) for (const decay of [2.2, 10, 20]) {
    const result = detect(82.4069, { amplitude, decay, dc: 0.13, noise: 0.00001 });
    assert.ok(result);
    assert.ok(Math.abs(centsBetween(result.frequency, 82.4069)) < 2, `${amplitude}, ${decay}: ${result.frequency}`);
  }
});

test('silence, DC, broadband noise, malformed frames, and impossible ranges are rejected', () => {
  assert.equal(detectPitchYIN(new Float32Array(4096), 48000), null);
  assert.equal(detectPitchYIN(new Float32Array(4096).fill(0.2), 48000), null);
  assert.equal(detectPitchYIN(signal(110, { amplitude: 0, noise: 0.2 }), 48000), null);
  assert.equal(detectPitchYIN(new Float32Array(4096).fill(Number.NaN), 48000), null);
  assert.equal(detectPitchYIN(signal(110), 0), null);
  assert.equal(detectPitchYIN(signal(110), 48000, { minFrequency: 500, maxFrequency: 100 }), null);
  assert.ok(Number.isFinite(sensitivityRmsFloor(Number.NaN)));
});

test('detuned fundamentals stay on their nearest actual string without harmonic aliasing', () => {
  for (const target of guitar) for (const cents of [-170, -125, 0, 125, 170]) {
    const frequency = target.frequency * (2 ** (cents / 1200));
    const match = matchPitchToTargets(frequency, guitar);
    assert.equal(match.target.index, target.index, `string ${target.index}, ${cents} cents`);
    assert.ok(Math.abs(match.cents - cents) < 0.001);
    assert.equal(match.harmonic, 1);
  }
});

test('manual tuning reports an octave mismatch instead of a false in-tune result', () => {
  const high = comparePitchToTarget(220 * (2 ** (7 / 1200)), 110);
  assert.ok(Math.abs(high.cents - 1207) < 0.001);
  assert.equal(high.octaveMismatch, true);
  const normal = comparePitchToTarget(110 * (2 ** (-17 / 1200)), 110);
  assert.equal(normal.octaveMismatch, false);
  assert.ok(Math.abs(normal.cents + 17) < 0.001);
});

test('explicit harmonic matching remains possible without weakening direct defaults', () => {
  const targets = guitar.slice(0, 2);
  assert.equal(matchPitchToTargets(164.8137784564, targets), null);
  const match = matchPitchToTargets(164.8137784564, targets, { allowHarmonics: true });
  assert.equal(match.target.index, 0);
  assert.equal(match.harmonic, 2);
});

test('smoothing rejects isolated large errors and reaches a correction within 250 ms', () => {
  const smoother = new PitchSmoother();
  for (let time = 0; time <= 600; time += 50) smoother.update({ cents: 20, targetIndex: 0, time });
  smoother.update({ cents: 150, targetIndex: 0, time: 650 });
  assert.ok(Math.abs(smoother.value - 20) < 1);
  smoother.update({ cents: 20, targetIndex: 0, time: 700 });
  for (let time = 750; time <= 1000; time += 50) smoother.update({ cents: 0, targetIndex: 0, time });
  assert.ok(Math.abs(smoother.value) < 2, `${smoother.value} cents`);
});

test('smoothing uses elapsed time and resets on a new target or a long gap', () => {
  const finalAtRate = (interval) => {
    const smoother = new PitchSmoother({ maxSamples: 1 });
    smoother.update({ cents: 20, targetIndex: 0, time: 0 });
    for (let time = interval; time <= 200; time += interval) smoother.update({ cents: 0, targetIndex: 0, time });
    return smoother.value;
  };
  assert.ok(Math.abs(finalAtRate(20) - finalAtRate(50)) < 0.01);
  const smoother = new PitchSmoother();
  smoother.update({ cents: 100, targetIndex: 0, time: 0 });
  assert.equal(smoother.update({ cents: -20, targetIndex: 1, time: 50 }), -20);
  assert.equal(smoother.update({ cents: 10, targetIndex: 1, time: 500 }), 10);
});

test('continuous raw pitch stability cannot span silence, weak confidence, or a pitch excursion', () => {
  const tracker = new TuningStabilityTracker({ dwellMs: 300 });
  const frame = (time, extra = {}) => tracker.update({ targetIndex: 0, cents: 1, clarity: 0.9, time, ...extra });
  for (const time of [0, 60, 120, 180, 240]) assert.equal(frame(time).stable, false);
  assert.deepEqual(frame(300), { stable: true, justStable: true, progress: 1 });
  assert.deepEqual(frame(360), { stable: true, justStable: false, progress: 1 });
  assert.equal(frame(420, { valid: false }).stable, false);
  assert.equal(frame(480).stable, false);
  assert.equal(frame(900).stable, false);
  assert.equal(frame(960, { cents: 7 }).stable, false);
  assert.equal(frame(1020).stable, false);
  assert.equal(frame(1080, { clarity: 0.4 }).stable, false);
});

test('automatic target confirmation restarts after a missing-input gap', () => {
  const tracker = new AutoTargetTracker();
  const match = { target: { index: 1 }, cents: 0, margin: 400, score: 0 };
  assert.equal(tracker.update(match, 0, 0).accepted, false);
  assert.equal(tracker.update(match, 0, 300).accepted, false);
  assert.equal(tracker.update(match, 0, 360).accepted, true);
});

test('a long sustained pitch never trains the adaptive floor to treat music as noise', () => {
  let floor = 0.0006;
  for (let frame = 0; frame < 1000; frame += 1) floor = updateAdaptiveNoiseFloor(floor, 0.1, { pitched: true });
  assert.equal(floor, 0.0006);
});
