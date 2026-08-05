const REFERENCE_PROFILES = Object.freeze({
  guitar: Object.freeze({
    duration: 3.35,
    harmonics: 18,
    pluckPosition: 0.17,
    spectralSlope: 1.08,
    fundamentalDecay: 2.75,
    harmonicDecay: 0.54,
    inharmonicity: 0.000018,
    attack: 0.0028,
    pickNoise: 0.042,
    outputLevel: 0.68,
    lowpass: 6200,
    highpass: 38,
    bodyResonances: Object.freeze([
      Object.freeze({ frequency: 105, gain: 0.20, width: 0.60 }),
      Object.freeze({ frequency: 210, gain: 0.16, width: 0.52 }),
      Object.freeze({ frequency: 420, gain: 0.08, width: 0.50 }),
    ]),
  }),
  ukulele: Object.freeze({
    duration: 2.25,
    harmonics: 14,
    pluckPosition: 0.22,
    spectralSlope: 0.94,
    fundamentalDecay: 1.68,
    harmonicDecay: 0.62,
    inharmonicity: 0.000004,
    attack: 0.0022,
    pickNoise: 0.050,
    outputLevel: 0.70,
    lowpass: 7600,
    highpass: 68,
    bodyResonances: Object.freeze([
      Object.freeze({ frequency: 185, gain: 0.18, width: 0.64 }),
      Object.freeze({ frequency: 370, gain: 0.14, width: 0.55 }),
      Object.freeze({ frequency: 740, gain: 0.07, width: 0.50 }),
    ]),
  }),
});

export function referenceProfile(instrument = 'guitar') {
  return REFERENCE_PROFILES[instrument] ?? REFERENCE_PROFILES.guitar;
}

function makeRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bodyResponse(frequency, resonances) {
  let gain = 1;
  for (const resonance of resonances) {
    const distance = Math.log2(Math.max(1, frequency) / resonance.frequency);
    gain += resonance.gain * Math.exp(-0.5 * ((distance / resonance.width) ** 2));
  }
  return gain;
}

export function referenceStringDuration(frequency, instrument = 'guitar') {
  const profile = referenceProfile(instrument);
  const lowStringExtension = instrument === 'guitar' ? Math.max(0, 120 - frequency) / 500 : 0;
  return profile.duration * (1 + lowStringExtension);
}

export function generatePluckedStringSamples({ frequency, instrument = 'guitar', sampleRate = 48000, seed = 1 } = {}) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(sampleRate) || sampleRate < 8000) return new Float32Array();
  const profile = referenceProfile(instrument);
  const duration = referenceStringDuration(frequency, instrument);
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const output = new Float32Array(length);
  const random = makeRandom(seed);
  const phases = Array.from({ length: profile.harmonics }, () => (random() - 0.5) * 0.16);
  const nyquistLimit = sampleRate * 0.46;

  for (let harmonic = 1; harmonic <= profile.harmonics; harmonic += 1) {
    const stretchedRatio = Math.sqrt(1 + (profile.inharmonicity * ((harmonic * harmonic) - 1)));
    const partialFrequency = frequency * harmonic * stretchedRatio;
    if (partialFrequency >= nyquistLimit) break;
    const pluckWeight = Math.abs(Math.sin(Math.PI * harmonic * profile.pluckPosition));
    const amplitude = (pluckWeight / (harmonic ** profile.spectralSlope)) * bodyResponse(partialFrequency, profile.bodyResonances);
    const decay = profile.fundamentalDecay / (1 + (profile.harmonicDecay * (harmonic - 1)));
    const angularStep = (Math.PI * 2 * partialFrequency) / sampleRate;
    const decayStep = Math.exp(-1 / (sampleRate * decay));
    const sinStep = Math.sin(angularStep);
    const cosStep = Math.cos(angularStep);
    let sinValue = Math.sin(phases[harmonic - 1]);
    let cosValue = Math.cos(phases[harmonic - 1]);
    let envelope = 1;
    for (let index = 0; index < length; index += 1) {
      output[index] += amplitude * sinValue * envelope;
      const nextSin = (sinValue * cosStep) + (cosValue * sinStep);
      cosValue = (cosValue * cosStep) - (sinValue * sinStep);
      sinValue = nextSin;
      envelope *= decayStep;
    }
  }

  let smoothedNoise = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const attack = 1 - Math.exp(-time / profile.attack);
    const tailStart = duration - 0.12;
    const release = time < tailStart ? 1 : Math.cos(Math.min(1, (time - tailStart) / 0.12) * Math.PI * 0.5) ** 2;
    const noise = (random() * 2) - 1;
    smoothedNoise += 0.24 * (noise - smoothedNoise);
    const pickTransient = (noise - smoothedNoise) * Math.exp(-time / 0.009) * profile.pickNoise;
    output[index] = (output[index] * attack * release) + pickTransient;
  }

  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    output[index] = Math.tanh(output[index] * 1.08);
    peak = Math.max(peak, Math.abs(output[index]));
  }
  const scale = peak > 0 ? profile.outputLevel / peak : 0;
  for (let index = 0; index < length; index += 1) output[index] *= scale;
  return output;
}
