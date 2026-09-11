const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const finiteOption = (value, fallback, min, max) => Number.isFinite(value) ? clampNumber(value, min, max) : fallback;

/**
 * YIN with a short, low-pass-decimated search and full-resolution refinement.
 * Later period minima must be materially better before replacing the first
 * minimum: a strong second/third partial must not hide an audible fundamental.
 */
export function detectPitchYIN(buffer, sampleRate, options = {}) {
  if (!(buffer instanceof Float32Array) || buffer.length < 256 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const minFrequency = finiteOption(options.minFrequency, 45, 10, sampleRate / 4);
  const maxFrequency = finiteOption(options.maxFrequency, 1300, 10, sampleRate / 4);
  if (maxFrequency <= minFrequency) return null;
  const threshold = finiteOption(options.threshold, 0.16, 0.01, 0.5);
  const minClarity = finiteOption(options.minClarity, 0.72, 0, 1);
  const minRms = finiteOption(options.minRms, 0.00035, 0, 1);
  let mean = 0;
  for (let index = 0; index < buffer.length; index += 1) mean += buffer[index];
  mean /= buffer.length;
  let energy = 0;
  for (let index = 0; index < buffer.length; index += 1) energy += (buffer[index] - mean) ** 2;
  const rms = Math.sqrt(energy / buffer.length);
  if (!Number.isFinite(rms) || rms < minRms || rms === 0) return null;

  // Averaging adjacent samples attenuates high-frequency noise before reducing
  // the rate. Only the coarse search is decimated; final pitch uses raw audio.
  const stride = Math.max(1, Math.floor(sampleRate / Math.max(12000, maxFrequency * 8)));
  const rate = sampleRate / stride;
  const size = Math.floor(buffer.length / stride);
  const samples = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    let sum = 0;
    for (let offset = 0; offset < stride; offset += 1) sum += buffer[(index * stride) + offset] - mean;
    samples[index] = sum / stride;
  }
  // Inspect upper partials even when only their fundamental is in range.
  // The returned frequency is range-checked after harmonic recovery.
  const tauMin = 2;
  const tauMax = Math.min(Math.ceil(rate / minFrequency) + 1, Math.floor(size / 2));
  if (tauMax <= tauMin + 2) return null;
  const comparisonLength = size - tauMax;
  const difference = new Float64Array(tauMax + 1);
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = samples[index] - samples[index + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    difference[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }
  const interpolatedDepth = (tau) => {
    const left = difference[tau - 1];
    const center = difference[tau];
    const right = difference[tau + 1];
    const curvature = left - (2 * center) + right;
    return curvature > 0 ? Math.max(0, center - (((left - right) ** 2) / (8 * curvature))) : center;
  };
  let period = -1;
  for (let tau = tauMin; tau < tauMax; tau += 1) {
    const localMinimum = difference[tau] <= difference[tau - 1] && difference[tau] < difference[tau + 1];
    if (difference[tau] < threshold || (localMinimum && interpolatedDepth(tau) < threshold)) {
      while (tau + 1 < tauMax && difference[tau + 1] < difference[tau]) tau += 1;
      period = tau;
      break;
    }
  }
  if (period < 0) {
    let best = Number.POSITIVE_INFINITY;
    // Endpoints can be falling slopes of noise or out-of-range notes.
    for (let tau = tauMin + 1; tau < tauMax; tau += 1) {
      if (difference[tau] <= difference[tau - 1] && difference[tau] < difference[tau + 1] && difference[tau] < best) {
        best = difference[tau];
        period = tau;
      }
    }
  }
  if (period < 0 || period >= tauMax) return null;
  const firstPeriod = period;
  // Compare candidate minima at the original sample rate. Coarse integer-lag
  // depths alone can spuriously favor 2x/3x periods on high-frequency notes.
  const refinePeriod = (coarsePeriod) => {
    const rawCenter = coarsePeriod * stride;
    const radius = Math.max(stride + 1, Math.ceil(rawCenter * 0.012));
    const rawLow = Math.max(2, rawCenter - radius);
    const rawHigh = Math.min(Math.floor(buffer.length / 2), rawCenter + radius);
    const overlap = buffer.length - rawHigh;
    if (rawHigh <= rawLow + 1) return null;
    const differences = new Float64Array(rawHigh - rawLow + 1);
    let rawPeriod = rawCenter;
    let bestDifference = Number.POSITIVE_INFINITY;
    for (let tau = rawLow; tau <= rawHigh; tau += 1) {
      let sum = 0;
      for (let index = 0; index < overlap; index += 1) {
        const delta = buffer[index] - buffer[index + tau];
        sum += delta * delta;
      }
      differences[tau - rawLow] = sum;
      if (sum < bestDifference) { bestDifference = sum; rawPeriod = tau; }
    }
    if (rawPeriod <= rawLow || rawPeriod >= rawHigh) return null;
    const left = differences[rawPeriod - rawLow - 1];
    const center = differences[rawPeriod - rawLow];
    const right = differences[rawPeriod - rawLow + 1];
    const curvature = left - (2 * center) + right;
    const adjustment = curvature > 0 ? clampNumber((left - right) / (2 * curvature), -0.5, 0.5) : 0;
    const refinedTau = rawPeriod + adjustment;
    const depth = curvature > 0 ? Math.max(0, center - (((left - right) ** 2) / (8 * curvature))) : center;
    return { refinedTau, rawPeriod, depth: depth / Math.max(2 * rms * rms * overlap, 1e-24) };
  };
  let refined = refinePeriod(period);
  if (!refined) return null;
  // Allow slight bias in the short-period estimate from a weak fundamental.
  for (let multiple = 2; multiple <= 4; multiple += 1) {
    if (refined.depth <= 0.006) break;
    const center = firstPeriod * multiple;
    if (center >= tauMax) break;
    const radius = Math.max(2, Math.ceil(center * 0.035));
    let candidate = center;
    for (let tau = Math.max(tauMin + 1, center - radius); tau <= Math.min(tauMax - 1, center + radius); tau += 1) {
      if (difference[tau] < difference[candidate]) candidate = tau;
    }
    const candidateRefined = refinePeriod(candidate);
    if (candidateRefined && refined.depth - candidateRefined.depth > 0.006 && candidateRefined.depth < refined.depth * 0.45) {
      period = candidate;
      refined = candidateRefined;
    }
  }
  const { refinedTau, rawPeriod } = refined;
  const frequency = sampleRate / refinedTau;
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;
  let correlation = 0;
  let firstEnergy = 0;
  let secondEnergy = 0;
  for (let index = 0; index < buffer.length - rawPeriod; index += 1) {
    const first = buffer[index] - mean;
    const second = buffer[index + rawPeriod] - mean;
    correlation += first * second;
    firstEnergy += first * first;
    secondEnergy += second * second;
  }
  correlation /= Math.sqrt(Math.max(firstEnergy * secondEnergy, 1e-24));
  const yinClarity = clampNumber(1 - difference[period], 0, 1);
  const clarity = clampNumber((yinClarity * 0.78) + (Math.max(0, correlation) * 0.22), 0, 1);
  if (clarity < minClarity || correlation < Math.max(0.35, minClarity - 0.2)) return null;
  return { frequency, clarity, rms, correlation, period: refinedTau, harmonicCorrected: period !== firstPeriod };
}

export function median(values) {
  if (!Array.isArray(values) || !values.length) return Number.NaN;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function weightedMedian(values, weights = []) {
  if (!Array.isArray(values) || !values.length) return Number.NaN;
  const entries = values.map((value, index) => ({ value, weight: Number(weights[index]) }))
    .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((first, second) => first.value - second.value);
  if (!entries.length) return median(values);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cumulative = 0;
  for (const entry of entries) { cumulative += entry.weight; if (cumulative >= total / 2) return entry.value; }
  return entries.at(-1).value;
}

export function robustWeightedAverage(values, weights = [], outlierCents = 24) {
  const center = weightedMedian(values, weights);
  if (!Number.isFinite(center)) return Number.NaN;
  let sum = 0;
  let total = 0;
  values.forEach((value, index) => {
    const weight = Number(weights[index]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0 || Math.abs(value - center) > outlierCents) return;
    sum += value * weight; total += weight;
  });
  return total > 0 ? sum / total : center;
}

/** A short median rejects isolated bad frames; elapsed-time smoothing follows pegs. */
export class PitchSmoother {
  constructor(options = {}) {
    this.windowMs = finiteOption(options.windowMs, 180, 60, 600);
    this.maxSamples = Math.round(finiteOption(options.maxSamples, 3, 1, 5));
    this.outlierCents = finiteOption(options.outlierCents, 24, 1, 120);
    this.reset();
  }
  reset() { this.samples = []; this.value = Number.NaN; this.targetIndex = null; this.lastTime = null; }
  update({ cents, targetIndex, clarity = 1, time = 0 }) {
    if (!Number.isFinite(cents) || !Number.isFinite(time)) return this.value;
    if (this.targetIndex !== targetIndex || (this.lastTime !== null && (time < this.lastTime || time - this.lastTime > this.windowMs))) this.reset();
    const elapsed = this.lastTime === null ? 0 : time - this.lastTime;
    this.targetIndex = targetIndex; this.lastTime = time;
    this.samples = this.samples.filter((sample) => time - sample.time <= this.windowMs);
    this.samples.push({ cents, time });
    if (this.samples.length > this.maxSamples) this.samples.shift();
    let robust = median(this.samples.map((sample) => sample.cents));
    // On the second frame, do not average a solitary large outlier into a lock.
    if (this.samples.length === 2 && Math.abs(this.samples[1].cents - this.samples[0].cents) > this.outlierCents) robust = this.samples[0].cents;
    if (!Number.isFinite(this.value)) this.value = robust;
    else {
      const confidence = finiteOption(clarity, 1, 0, 1);
      const timeConstant = (Math.abs(robust) <= 6 ? 75 : 50) + ((1 - confidence) * 45);
      const alpha = 1 - Math.exp(-Math.max(0, elapsed) / timeConstant);
      this.value += (robust - this.value) * alpha;
    }
    if (Math.abs(this.value) < 0.08) this.value = 0;
    return this.value;
  }
}

/** Confirm automatic string changes without carrying candidates across gaps. */
export class AutoTargetTracker {
  constructor(options = {}) {
    this.strongConfirmMs = finiteOption(options.strongConfirmMs, 45, 0, 500);
    this.weakConfirmMs = finiteOption(options.weakConfirmMs, 115, 0, 1000);
    this.minimumMargin = finiteOption(options.minimumMargin, 18, 0, 300);
    this.reset();
  }
  reset() { this.pendingIndex = null; this.pendingSince = null; this.pendingFrames = 0; this.lastTime = null; }
  update(match, currentIndex, time) {
    const index = match?.target?.index;
    if (!Number.isInteger(index) || !Number.isFinite(time)) { this.reset(); return { accepted: false, changed: false, index: currentIndex }; }
    if (index === currentIndex) { this.reset(); return { accepted: true, changed: false, index }; }
    if (this.pendingIndex !== index || this.lastTime === null || time < this.lastTime || time - this.lastTime > 180) {
      this.pendingIndex = index; this.pendingSince = time; this.pendingFrames = 1; this.lastTime = time;
      return { accepted: false, changed: false, index: currentIndex };
    }
    this.lastTime = time; this.pendingFrames += 1;
    const strong = Math.abs(match.cents) <= 150 && (match.margin >= this.minimumMargin || match.score <= 55);
    if (this.pendingFrames < 2 || time - this.pendingSince < (strong ? this.strongConfirmMs : this.weakConfirmMs)) return { accepted: false, changed: false, index: currentIndex };
    this.reset(); return { accepted: true, changed: true, index };
  }
}

/** Stability must be earned by consecutive raw, confident observations. */
export class TuningStabilityTracker {
  constructor(options = {}) {
    this.thresholdCents = finiteOption(options.threshold ?? options.thresholdCents, 3, 0.1, 30);
    this.dwellMs = finiteOption(options.holdMs ?? options.dwellMs, 560, 100, 3000);
    this.minClarity = finiteOption(options.minClarity, 0.8, 0, 1);
    this.maxGapMs = finiteOption(options.maxGapMs, 180, 50, 1000);
    this.reset();
  }
  reset() { this.targetIndex = null; this.since = null; this.lastTime = null; this.stable = false; }
  update({ targetIndex, cents, clarity = 1, time, valid = true } = {}) {
    const usable = valid && Number.isInteger(targetIndex) && Number.isFinite(time) && Number.isFinite(cents) && Number.isFinite(clarity) && clarity >= this.minClarity && Math.abs(cents) <= this.thresholdCents;
    if (!usable) { this.reset(); return { stable: false, justStable: false, progress: 0 }; }
    if (this.targetIndex !== targetIndex || this.lastTime === null || time < this.lastTime || time - this.lastTime > this.maxGapMs) {
      this.reset(); this.targetIndex = targetIndex; this.since = time;
    }
    this.lastTime = time;
    const wasStable = this.stable;
    this.stable = time - this.since >= this.dwellMs;
    return { stable: this.stable, justStable: this.stable && !wasStable, progress: clampNumber((time - this.since) / this.dwellMs, 0, 1) };
  }
}

export function sensitivityRmsFloor(sensitivity = 55) {
  const normalized = finiteOption(Number(sensitivity), 55, 0, 100) / 100;
  return 0.00045 * (2 ** ((1 - normalized) * 3.7));
}
export function adaptiveRmsThreshold(sensitivity = 55, noiseFloor = 0.0006) {
  const normalized = finiteOption(Number(sensitivity), 55, 0, 100) / 100;
  return Math.max(sensitivityRmsFloor(normalized * 100), finiteOption(Number(noiseFloor), 0.0006, 0.00012, 0.04) * (1.35 + ((1 - normalized) * 1.15)));
}
export function pitchDetectionRmsFloor(sensitivity = 55, noiseFloor = 0.0006) {
  return Math.max(0.00018, Math.min(sensitivityRmsFloor(sensitivity) * 0.36, adaptiveRmsThreshold(sensitivity, noiseFloor) * 0.38));
}
export function updateAdaptiveNoiseFloor(currentNoiseFloor, rms, options = {}) {
  const current = finiteOption(Number(currentNoiseFloor), 0.0006, 0.00012, 0.04);
  if (!Number.isFinite(rms) || rms <= 0) return current;
  // Periodic notes are not background noise, even after a long sustain.
  if (options.pitched) return current;
  const rate = rms < current ? 0.14 : 0.012;
  return clampNumber(current + ((rms - current) * rate), 0.00012, 0.04);
}

/** Match fundamentals directly. Harmonic recovery is an explicit opt-in. */
export function matchPitchToTargets(frequency, targets, options = {}) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Array.isArray(targets) || !targets.length) return null;
  const maxCents = finiteOption(options.maxCents, 550, 0, 2400);
  const maxHarmonic = Math.round(finiteOption(options.maxHarmonic, 4, 1, 8));
  const harmonicPenalty = finiteOption(options.harmonicPenalty, 180, 0, 1200);
  const switchPenalty = finiteOption(options.switchPenalty, 0, 0, 300);
  const matches = [];
  for (const target of targets) {
    if (!target || !Number.isInteger(target.index) || !Number.isFinite(target.frequency) || target.frequency <= 0) continue;
    const candidates = [{ normalizedFrequency: frequency, harmonic: 1, penalty: 0 }];
    if (options.allowHarmonics === true) {
      for (let harmonic = 2; harmonic <= maxHarmonic; harmonic += 1) candidates.push({ normalizedFrequency: frequency / harmonic, harmonic, penalty: harmonicPenalty * (harmonic - 1) });
    }
    let best = null;
    for (const candidate of candidates) {
      const cents = 1200 * Math.log2(candidate.normalizedFrequency / target.frequency);
      if (Math.abs(cents) > maxCents) continue;
      const penalty = options.previousTargetIndex != null && target.index !== options.previousTargetIndex ? switchPenalty : 0;
      const score = Math.abs(cents) + candidate.penalty + penalty;
      if (!best || score < best.score) best = { target, cents, score, normalizedFrequency: candidate.normalizedFrequency, harmonic: candidate.harmonic, rawFrequency: frequency };
    }
    if (best) matches.push(best);
  }
  matches.sort((first, second) => first.score - second.score);
  if (!matches.length) return null;
  return { ...matches[0], margin: matches.length > 1 ? matches[1].score - matches[0].score : Number.POSITIVE_INFINITY, alternatives: matches };
}

/** Manual mode must show the pitch that was heard, including a wrong octave. */
export function comparePitchToTarget(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) return null;
  const cents = 1200 * Math.log2(frequency / targetFrequency);
  return { normalizedFrequency: frequency, cents, octaveMismatch: Math.abs(cents) >= 600, octaveShift: 0 };
}

/** Legacy utility for callers explicitly requesting octave folding. */
export function normalizePitchToTarget(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) return null;
  const octaveShift = Math.round(Math.log2(targetFrequency / frequency));
  const normalizedFrequency = frequency * (2 ** octaveShift);
  return { normalizedFrequency, cents: 1200 * Math.log2(normalizedFrequency / targetFrequency), octaveShift };
}
export function tuningDirection(cents, inTuneThreshold = 3) {
  if (!Number.isFinite(cents)) return 'waiting';
  if (Math.abs(cents) <= inTuneThreshold) return 'in-tune';
  return cents < 0 ? 'flat' : 'sharp';
}
