const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

/** Estimate the fundamental frequency of a mono audio frame with amplitude-normalized YIN. */
export function detectPitchYIN(buffer, sampleRate, options = {}) {
  const {
    minFrequency = 50,
    maxFrequency = 1200,
    threshold = 0.16,
    minClarity = 0.58,
    minRms = 0.00035,
  } = options;
  if (!(buffer instanceof Float32Array) || buffer.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  const frameSize = buffer.length;
  let mean = 0;
  for (let index = 0; index < frameSize; index += 1) mean += buffer[index];
  mean /= frameSize;

  let energy = 0;
  for (let index = 0; index < frameSize; index += 1) {
    const centered = buffer[index] - mean;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / frameSize);
  if (!Number.isFinite(rms) || rms < minRms) return null;

  const inverseRms = 1 / Math.max(rms, 1e-12);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(frameSize / 2) - 1);
  if (tauMin >= tauMax) return null;

  const comparisonLength = frameSize - tauMax;
  const difference = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = (buffer[index] - buffer[index + tau]) * inverseRms;
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  difference[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    runningSum += difference[tau];
    difference[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
  }

  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if (difference[tau] < threshold) {
      while (tau + 1 <= tauMax && difference[tau + 1] < difference[tau]) tau += 1;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) {
    let bestValue = Number.POSITIVE_INFINITY;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      if (difference[tau] < bestValue) {
        bestValue = difference[tau];
        tauEstimate = tau;
      }
    }
  }
  if (tauEstimate <= tauMin || tauEstimate >= tauMax) return null;

  const left = difference[tauEstimate - 1];
  const center = difference[tauEstimate];
  const right = difference[tauEstimate + 1];
  const denominator = (2 * center) - left - right;
  const adjustment = Math.abs(denominator) > 1e-12 ? 0.5 * (right - left) / denominator : 0;
  const refinedTau = tauEstimate + clampNumber(adjustment, -1, 1);
  const frequency = sampleRate / refinedTau;
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;

  let correlation = 0;
  let firstEnergy = 0;
  let secondEnergy = 0;
  const overlap = frameSize - tauEstimate;
  for (let index = 0; index < overlap; index += 1) {
    const first = (buffer[index] - mean) * inverseRms;
    const second = (buffer[index + tauEstimate] - mean) * inverseRms;
    correlation += first * second;
    firstEnergy += first * first;
    secondEnergy += second * second;
  }
  correlation /= Math.sqrt(Math.max(firstEnergy * secondEnergy, 1e-12));

  const yinClarity = clampNumber(1 - difference[tauEstimate], 0, 1);
  const clarity = clampNumber((yinClarity * 0.78) + (Math.max(0, correlation) * 0.22), 0, 1);
  if (clarity < minClarity) return null;

  return { frequency, clarity, rms, correlation, period: refinedTau };
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function weightedMedian(values, weights = []) {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const entries = values
    .map((value, index) => ({ value, weight: Number(weights[index]) }))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!entries.length) return median(values);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (cumulative >= totalWeight / 2) return entry.value;
  }
  return entries.at(-1).value;
}

export function robustWeightedAverage(values, weights = [], outlierCents = 24) {
  const center = weightedMedian(values, weights);
  if (!Number.isFinite(center)) return Number.NaN;
  let weightedSum = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    const weight = Number(weights[index]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0 || Math.abs(value - center) > outlierCents) return;
    weightedSum += value * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : center;
}

/** Smooth pitch in cents, where averaging is perceptually linear and octave-safe. */
export class PitchSmoother {
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? 480;
    this.maxSamples = options.maxSamples ?? 9;
    this.outlierCents = options.outlierCents ?? 24;
    this.reset();
  }

  reset() {
    this.samples = [];
    this.value = Number.NaN;
    this.targetIndex = null;
    this.lastTime = 0;
  }

  update({ cents, targetIndex, clarity = 1, time = 0 }) {
    if (!Number.isFinite(cents) || !Number.isFinite(time)) return this.value;
    if (this.targetIndex !== targetIndex || (this.lastTime && time - this.lastTime > this.windowMs)) {
      this.samples = [];
      this.value = Number.NaN;
      this.targetIndex = targetIndex;
    }
    this.lastTime = time;
    this.samples = this.samples.filter((sample) => time - sample.time <= this.windowMs);
    this.samples.push({ cents, clarity: clampNumber(clarity, 0.05, 1), time });
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);

    const values = this.samples.map((sample) => sample.cents);
    const weights = this.samples.map((sample) => {
      const age = clampNumber((time - sample.time) / this.windowMs, 0, 1);
      return (0.18 + ((1 - age) * 0.82)) * (sample.clarity ** 2);
    });
    const robust = robustWeightedAverage(values, weights, this.outlierCents);
    if (!Number.isFinite(robust)) return this.value;

    if (!Number.isFinite(this.value)) this.value = robust;
    else {
      const delta = robust - this.value;
      let alpha = clampNumber(0.24 + (Math.abs(delta) / 105), 0.24, 0.72);
      if (Math.abs(robust) <= 6) alpha *= 0.68;
      this.value += delta * alpha;
    }
    if (Math.abs(this.value) < 0.12) this.value = 0;
    return this.value;
  }
}

/** Confirm target changes across frames so automatic mode is fast without flickering. */
export class AutoTargetTracker {
  constructor(options = {}) {
    this.strongConfirmMs = options.strongConfirmMs ?? 45;
    this.weakConfirmMs = options.weakConfirmMs ?? 115;
    this.minimumMargin = options.minimumMargin ?? 18;
    this.reset();
  }

  reset() {
    this.pendingIndex = null;
    this.pendingSince = 0;
    this.pendingFrames = 0;
  }

  update(match, currentIndex, time) {
    const index = match?.target?.index;
    if (!Number.isInteger(index) || !Number.isFinite(time)) {
      this.reset();
      return { accepted: false, changed: false, index: currentIndex };
    }
    if (index === currentIndex) {
      this.reset();
      return { accepted: true, changed: false, index };
    }
    if (this.pendingIndex !== index || time - this.pendingSince > 260) {
      this.pendingIndex = index;
      this.pendingSince = time;
      this.pendingFrames = 1;
      return { accepted: false, changed: false, index: currentIndex };
    }

    this.pendingFrames += 1;
    const strong = Math.abs(match.cents) <= 150 && (match.margin >= this.minimumMargin || match.score <= 55);
    const confirmMs = strong ? this.strongConfirmMs : this.weakConfirmMs;
    if (this.pendingFrames < 2 || time - this.pendingSince < confirmMs) {
      return { accepted: false, changed: false, index: currentIndex };
    }

    this.reset();
    return { accepted: true, changed: true, index };
  }
}

export function sensitivityRmsFloor(sensitivity = 55) {
  const normalized = clampNumber(Number(sensitivity) / 100, 0, 1);
  return 0.00045 * (2 ** ((1 - normalized) * 3.7));
}

export function adaptiveRmsThreshold(sensitivity = 55, noiseFloor = 0.0006) {
  const normalized = clampNumber(Number(sensitivity) / 100, 0, 1);
  const baseFloor = sensitivityRmsFloor(normalized * 100);
  const noiseMultiplier = 1.35 + ((1 - normalized) * 1.15);
  return Math.max(baseFloor, Math.max(0.00012, Number(noiseFloor) || 0) * noiseMultiplier);
}

/** The expensive pitch detector can run below the UI's signal threshold when periodicity is clear. */
export function pitchDetectionRmsFloor(sensitivity = 55, noiseFloor = 0.0006) {
  const baseFloor = sensitivityRmsFloor(sensitivity);
  const adaptiveFloor = adaptiveRmsThreshold(sensitivity, noiseFloor);
  return Math.max(0.00018, Math.min(baseFloor * 0.36, adaptiveFloor * 0.38));
}

export function updateAdaptiveNoiseFloor(currentNoiseFloor, rms, options = {}) {
  if (!Number.isFinite(rms) || rms <= 0) return Number.isFinite(currentNoiseFloor) ? currentNoiseFloor : 0.0006;
  const current = clampNumber(Number(currentNoiseFloor) || 0.0006, 0.00012, 0.04);
  const pitched = Boolean(options.pitched);
  const rate = rms < current ? 0.14 : pitched ? 0.0008 : 0.012;
  return clampNumber(current + ((rms - current) * rate), 0.00012, 0.04);
}

export function matchPitchToTargets(frequency, targets, options = {}) {
  const {
    maxCents = 550,
    maxHarmonic = 4,
    harmonicPenalty = 34,
    subharmonicPenalty = 90,
    previousTargetIndex = null,
    switchPenalty = 0,
  } = options;
  if (!Number.isFinite(frequency) || frequency <= 0 || !Array.isArray(targets) || !targets.length) return null;

  const targetMatches = [];
  for (const target of targets) {
    const candidates = [{ normalizedFrequency: frequency, harmonic: 1, penalty: 0 }];
    for (let harmonic = 2; harmonic <= maxHarmonic; harmonic += 1) {
      candidates.push({ normalizedFrequency: frequency / harmonic, harmonic, penalty: harmonicPenalty * (harmonic - 1) });
    }
    candidates.push({ normalizedFrequency: frequency * 2, harmonic: 0.5, penalty: subharmonicPenalty });

    let bestForTarget = null;
    for (const candidate of candidates) {
      const cents = 1200 * Math.log2(candidate.normalizedFrequency / target.frequency);
      const targetSwitchPenalty = previousTargetIndex !== null && target.index !== previousTargetIndex ? switchPenalty : 0;
      const score = Math.abs(cents) + candidate.penalty + targetSwitchPenalty;
      if (!bestForTarget || score < bestForTarget.score) {
        bestForTarget = {
          target,
          cents,
          score,
          normalizedFrequency: candidate.normalizedFrequency,
          harmonic: candidate.harmonic,
          rawFrequency: frequency,
        };
      }
    }
    if (bestForTarget) targetMatches.push(bestForTarget);
  }

  targetMatches.sort((first, second) => first.score - second.score);
  const best = targetMatches[0];
  if (!best || Math.abs(best.cents) > maxCents) return null;
  const second = targetMatches.find((candidate) => candidate.target !== best.target);
  return {
    ...best,
    margin: second ? second.score - best.score : Number.POSITIVE_INFINITY,
    alternatives: targetMatches,
  };
}

export function normalizePitchToTarget(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) return null;
  const octaveShift = Math.round(Math.log2(targetFrequency / frequency));
  const normalizedFrequency = frequency * (2 ** octaveShift);
  const cents = 1200 * Math.log2(normalizedFrequency / targetFrequency);
  return { normalizedFrequency, cents, octaveShift };
}

export function tuningDirection(cents, inTuneThreshold = 3) {
  if (!Number.isFinite(cents)) return 'waiting';
  if (Math.abs(cents) <= inTuneThreshold) return 'in-tune';
  return cents < 0 ? 'flat' : 'sharp';
}
