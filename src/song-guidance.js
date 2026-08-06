import { noteNameFromPitchClass, parseChordSymbol, transposeChordSymbol } from './chords.js';

const MAJOR_RULES = new Map([
  [0, { weight: 3.6, families: ['major'] }],
  [2, { weight: 2.1, families: ['minor'] }],
  [4, { weight: 1.5, families: ['minor'] }],
  [5, { weight: 2.7, families: ['major'] }],
  [7, { weight: 3.2, families: ['major', 'dominant'] }],
  [9, { weight: 2.6, families: ['minor'] }],
  [11, { weight: 1.3, families: ['diminished'] }],
]);

const MINOR_RULES = new Map([
  [0, { weight: 3.8, families: ['minor'] }],
  [2, { weight: 1.4, families: ['diminished'] }],
  [3, { weight: 2.6, families: ['major'] }],
  [5, { weight: 2.4, families: ['minor', 'major'] }],
  [7, { weight: 3.2, families: ['minor', 'major', 'dominant'] }],
  [8, { weight: 2.7, families: ['major'] }],
  [10, { weight: 2.4, families: ['major'] }],
]);

const GUITAR_BASE = Object.freeze({
  major: new Map([[0, .45], [2, .45], [4, .25], [5, 2.35], [7, .3], [9, .4], [11, 2.25]]),
  minor: new Map([[9, .25], [4, .2], [2, .6], [11, 2.05], [6, 2.2], [1, 2.35], [7, 2.45], [0, 2.55], [5, 2.5], [8, 2.55], [10, 2.55], [3, 2.6]]),
  dominant: new Map([[4, .35], [9, .4], [2, .45], [7, .55], [0, .75], [11, .9], [5, 1.5]]),
});

const UKULELE_BASE = Object.freeze({
  major: new Map([[0, .2], [5, .3], [7, .5], [9, .45], [2, .65], [4, 1.7], [11, 1.75]]),
  minor: new Map([[9, .2], [2, .35], [4, .75], [11, 1.25], [6, 1.55], [1, 1.6], [7, 1.7], [0, 1.75], [5, 1.6], [8, 1.7], [10, 1.7], [3, 1.75]]),
  dominant: new Map([[0, .35], [5, .45], [7, .55], [9, .55], [2, .65], [4, 1.25], [11, 1.35]]),
});

function mod(value, divisor = 12) {
  return ((value % divisor) + divisor) % divisor;
}

function cleanEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event, index, parsed: parseChordSymbol(event?.chord) }))
    .filter((item) => item.parsed && !item.parsed.rest);
}

function chordFamily(quality = 'major') {
  if (['minor', 'm6', 'm7', 'm9', 'm11', 'm13', 'madd9', 'mMaj7'].includes(quality)) return 'minor';
  if (quality === '7' || quality === '9' || quality === '11' || quality === '13' || quality.startsWith('7')) return 'dominant';
  if (quality.startsWith('dim') || quality === 'm7b5') return 'diminished';
  if (quality === 'aug' || quality === '7#5') return 'augmented';
  if (quality.includes('sus')) return 'suspended';
  if (quality === '5') return 'power';
  return 'major';
}

function qualityMatch(actual, expected) {
  if (expected.includes(actual)) return 1;
  if (actual === 'suspended' || actual === 'power') return .62;
  if (actual === 'dominant' && expected.includes('major')) return .78;
  if (actual === 'major' && expected.includes('dominant')) return .7;
  return .18;
}

function accidentalPreference(events, mode) {
  if (mode === 'flats' || mode === 'sharps') return mode;
  let flats = 0;
  let sharps = 0;
  for (const event of Array.isArray(events) ? events : []) {
    flats += (String(event?.chord ?? '').match(/[b♭]/g) ?? []).length;
    sharps += (String(event?.chord ?? '').match(/[#♯]/g) ?? []).length;
  }
  return flats > sharps ? 'flats' : 'sharps';
}

function eventWeight(valid, index, duration) {
  const current = Number(valid[index].event?.time) || 0;
  const next = index + 1 < valid.length ? Number(valid[index + 1].event?.time) : Number(duration);
  const gap = Number.isFinite(next) && next > current ? next - current : 4;
  return 1 + Math.min(2.5, Math.sqrt(Math.max(.25, gap)) / 2);
}

function scoreKeyCandidate(valid, tonic, mode, duration) {
  const rules = mode === 'minor' ? MINOR_RULES : MAJOR_RULES;
  const roots = new Map();
  let score = 0;
  let totalWeight = 0;

  valid.forEach((item, index) => {
    const weight = eventWeight(valid, index, duration);
    const degree = mod(item.parsed.root - tonic);
    const rule = rules.get(degree);
    const family = chordFamily(item.parsed.quality);
    score += weight * (rule ? rule.weight * (.7 + qualityMatch(family, rule.families)) : -.8);
    totalWeight += weight;
    roots.set(item.parsed.root, (roots.get(item.parsed.root) ?? 0) + weight);
  });

  if (!totalWeight) return Number.NEGATIVE_INFINITY;
  const first = valid[0]?.parsed;
  const last = valid.at(-1)?.parsed;
  if (first?.root === tonic) score += 4;
  if (last?.root === tonic) score += 5;
  const mostFrequentRoot = [...roots.entries()].sort((left, right) => right[1] - left[1])[0];
  if (mostFrequentRoot?.[0] === tonic) score += 3;
  const tonicFamily = mode === 'minor' ? 'minor' : 'major';
  if (first?.root === tonic && qualityMatch(chordFamily(first.quality), [tonicFamily]) > .9) score += 1.5;
  if (last?.root === tonic && qualityMatch(chordFamily(last.quality), [tonicFamily]) > .9) score += 1.5;
  return score / totalWeight;
}

export function inferSongKey(events, accidentalMode = 'auto', duration = 0) {
  const valid = cleanEvents(events);
  const namingMode = accidentalPreference(events, accidentalMode);
  if (!valid.length) return { tonic: 0, mode: 'major', name: 'C', confidence: 0, accidentalMode: namingMode };

  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ['major', 'minor']) candidates.push({ tonic, mode, score: scoreKeyCandidate(valid, tonic, mode, duration) });
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const second = candidates[1];
  const note = noteNameFromPitchClass(best.tonic, namingMode);
  return {
    ...best,
    name: `${note}${best.mode === 'minor' ? 'm' : ''}`,
    confidence: Math.max(0, Math.min(1, (best.score - second.score) / 3)),
    accidentalMode: namingMode,
  };
}

function chordDifficulty(parsed, instrument) {
  const family = chordFamily(parsed.quality);
  const tables = instrument === 'ukulele' ? UKULELE_BASE : GUITAR_BASE;
  const table = tables[family] ?? tables.major;
  let value = table.get(parsed.root);
  if (!Number.isFinite(value)) value = instrument === 'ukulele' ? 2 : 3;
  const extension = /9|11|13/.test(parsed.quality) ? .65 : /7|6|add/.test(parsed.quality) ? .25 : 0;
  const special = family === 'diminished' || family === 'augmented' ? .75 : 0;
  const slash = Number.isFinite(parsed.slashBass) ? .45 : 0;
  return value + extension + special + slash;
}

function shapeKeyPenalty(root, mode, instrument) {
  const preferred = instrument === 'ukulele'
    ? mode === 'minor'
      ? new Map([[9, 0], [4, .15], [2, .25], [11, .7]])
      : new Map([[0, 0], [5, .08], [7, .12], [2, .28], [9, .3]])
    : mode === 'minor'
      ? new Map([[4, 0], [9, .08], [2, .25], [11, .65], [6, .72]])
      : new Map([[7, 0], [0, .05], [2, .12], [9, .2], [4, .28], [5, .8]]);
  return preferred.get(root) ?? 1.1;
}

function progressionDifficulty(valid, capo, instrument, key) {
  if (!valid.length) return Number.POSITIVE_INFINITY;
  let score = 0;
  let totalWeight = 0;
  valid.forEach((item, index) => {
    const symbol = transposeChordSymbol(item.event.chord, -capo, key.accidentalMode);
    const parsed = parseChordSymbol(symbol);
    const weight = 1 + Math.min(2, (Number(item.event?.time) || index) / 180);
    score += chordDifficulty(parsed, instrument) * weight;
    totalWeight += weight;
  });
  const shapeRoot = mod(key.tonic - capo);
  const capoPenalty = (instrument === 'ukulele' ? .19 : .075) * capo + Math.max(0, capo - 5) * .12;
  return (score / totalWeight) + shapeKeyPenalty(shapeRoot, key.mode, instrument) + capoPenalty;
}

export function recommendCapo(events, key, instrument = 'guitar') {
  const valid = cleanEvents(events);
  const maximumCapo = instrument === 'ukulele' ? 5 : 7;
  const candidates = [];
  for (let capo = 0; capo <= maximumCapo; capo += 1) candidates.push({ capo, score: progressionDifficulty(valid, capo, instrument, key) });
  candidates.sort((left, right) => left.score - right.score || left.capo - right.capo);
  const open = candidates.find((candidate) => candidate.capo === 0);
  let best = candidates[0];
  const minimumImprovement = instrument === 'ukulele' ? .55 : .38;
  if (best.capo && open.score - best.score < minimumImprovement) best = open;
  const shapeRoot = mod(key.tonic - best.capo);
  return {
    ...best,
    shapeRoot,
    shapeName: `${noteNameFromPitchClass(shapeRoot, key.accidentalMode)}${key.mode === 'minor' ? 'm' : ''}`,
  };
}

export function suggestStrummingPattern({ bpm = 90, instrument = 'guitar' } = {}) {
  const tempo = Number(bpm) || 90;
  if (instrument === 'ukulele') {
    if (tempo < 70) return '↓ · ↓↑ ·';
    if (tempo < 122) return '↓ ↓↑ ↑↓↑';
    return '↓↑ ↓↑ ↓↑ ↓↑';
  }
  if (tempo < 68) return '↓ · ↓ · ↓↑';
  if (tempo < 108) return '↓ ↓↑ ↑↓↑';
  if (tempo < 145) return '↓ ↓ ↑↓↑';
  return '↓↑ ↓↑ ↓↑ ↓↑';
}

export function transposeEventsForCapo(events, capo = 0, accidentalMode = 'sharps') {
  return (Array.isArray(events) ? events : []).map((event) => ({
    ...event,
    soundChord: event.chord,
    displayChord: event.chord === '—' ? '—' : transposeChordSymbol(event.chord, -capo, accidentalMode),
  }));
}

export function buildSongGuidance({ events = [], chart = {}, instrument = 'guitar', duration = 0, accidentalMode = 'auto' } = {}) {
  const key = inferSongKey(events, accidentalMode, duration);
  const capo = recommendCapo(events, key, instrument);
  return {
    instrument,
    key,
    capo,
    pattern: suggestStrummingPattern({ bpm: chart?.bpm, instrument }),
    events: transposeEventsForCapo(events, capo.capo, key.accidentalMode),
  };
}
