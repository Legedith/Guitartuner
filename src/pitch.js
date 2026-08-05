/** Estimate the fundamental frequency of a mono audio frame using YIN. */
export function detectPitchYIN(buffer, sampleRate, options = {}) {
  const { minFrequency = 50, maxFrequency = 1200, threshold = 0.14, minClarity = 0.66, minRms = 0.008 } = options;
  if (!(buffer instanceof Float32Array) || buffer.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  const frameSize = buffer.length;
  let mean = 0;
  for (let i = 0; i < frameSize; i += 1) mean += buffer[i];
  mean /= frameSize;

  let energy = 0;
  for (let i = 0; i < frameSize; i += 1) {
    const centered = buffer[i] - mean;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / frameSize);
  if (rms < minRms) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(frameSize / 2) - 1);
  if (tauMin >= tauMax) return null;

  const comparisonLength = frameSize - tauMax;
  const difference = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let i = 0; i < comparisonLength; i += 1) {
      const delta = (buffer[i] - mean) - (buffer[i + tau] - mean);
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
      if (difference[tau] < bestValue) { bestValue = difference[tau]; tauEstimate = tau; }
    }
  }
  if (tauEstimate <= tauMin || tauEstimate >= tauMax) return null;
  const clarity = 1 - difference[tauEstimate];
  if (clarity < minClarity) return null;

  const left = difference[tauEstimate - 1];
  const center = difference[tauEstimate];
  const right = difference[tauEstimate + 1];
  const denominator = (2 * center) - left - right;
  const adjustment = Math.abs(denominator) > 1e-12 ? 0.5 * (right - left) / denominator : 0;
  const refinedTau = tauEstimate + Math.max(-1, Math.min(1, adjustment));
  const frequency = sampleRate / refinedTau;
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;
  return { frequency, clarity, rms };
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function matchPitchToTargets(frequency, targets, options = {}) {
  const { maxCents = 550, maxHarmonic = 4, harmonicPenalty = 34, subharmonicPenalty = 90 } = options;
  if (!Number.isFinite(frequency) || frequency <= 0 || !Array.isArray(targets) || !targets.length) return null;
  let best = null;
  for (const target of targets) {
    const candidates = [{ normalizedFrequency: frequency, harmonic: 1, penalty: 0 }];
    for (let harmonic = 2; harmonic <= maxHarmonic; harmonic += 1) {
      candidates.push({ normalizedFrequency: frequency / harmonic, harmonic, penalty: harmonicPenalty * (harmonic - 1) });
    }
    candidates.push({ normalizedFrequency: frequency * 2, harmonic: 0.5, penalty: subharmonicPenalty });
    for (const candidate of candidates) {
      const cents = 1200 * Math.log2(candidate.normalizedFrequency / target.frequency);
      const score = Math.abs(cents) + candidate.penalty;
      if (!best || score < best.score) best = { target, cents, score, normalizedFrequency: candidate.normalizedFrequency, harmonic: candidate.harmonic, rawFrequency: frequency };
    }
  }
  return best && Math.abs(best.cents) <= maxCents ? best : null;
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
