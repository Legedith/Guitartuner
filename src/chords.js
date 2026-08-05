const SHARP_ROOTS = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
const FLAT_ROOTS = Object.freeze(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']);

export const CHORD_QUALITIES = Object.freeze([
  Object.freeze({ id: 'major', label: 'Major', symbol: '', intervals: Object.freeze([0, 4, 7]), essential: Object.freeze([0, 4, 7]) }),
  Object.freeze({ id: 'minor', label: 'Minor', symbol: 'm', intervals: Object.freeze([0, 3, 7]), essential: Object.freeze([0, 3, 7]) }),
  Object.freeze({ id: '7', label: 'Dominant 7', symbol: '7', intervals: Object.freeze([0, 4, 7, 10]), essential: Object.freeze([0, 4, 10]) }),
  Object.freeze({ id: 'maj7', label: 'Major 7', symbol: 'maj7', intervals: Object.freeze([0, 4, 7, 11]), essential: Object.freeze([0, 4, 11]) }),
  Object.freeze({ id: 'm7', label: 'Minor 7', symbol: 'm7', intervals: Object.freeze([0, 3, 7, 10]), essential: Object.freeze([0, 3, 10]) }),
  Object.freeze({ id: '6', label: 'Major 6', symbol: '6', intervals: Object.freeze([0, 4, 7, 9]), essential: Object.freeze([0, 4, 9]) }),
  Object.freeze({ id: 'm6', label: 'Minor 6', symbol: 'm6', intervals: Object.freeze([0, 3, 7, 9]), essential: Object.freeze([0, 3, 9]) }),
  Object.freeze({ id: 'add9', label: 'Add 9', symbol: 'add9', intervals: Object.freeze([0, 4, 7, 14]), essential: Object.freeze([0, 4, 14]) }),
  Object.freeze({ id: 'madd9', label: 'Minor add 9', symbol: 'madd9', intervals: Object.freeze([0, 3, 7, 14]), essential: Object.freeze([0, 3, 14]) }),
  Object.freeze({ id: '9', label: 'Dominant 9', symbol: '9', intervals: Object.freeze([0, 4, 7, 10, 14]), essential: Object.freeze([0, 4, 10, 14]) }),
  Object.freeze({ id: 'maj9', label: 'Major 9', symbol: 'maj9', intervals: Object.freeze([0, 4, 7, 11, 14]), essential: Object.freeze([0, 4, 11, 14]) }),
  Object.freeze({ id: 'm9', label: 'Minor 9', symbol: 'm9', intervals: Object.freeze([0, 3, 7, 10, 14]), essential: Object.freeze([0, 3, 10, 14]) }),
  Object.freeze({ id: '11', label: 'Dominant 11', symbol: '11', intervals: Object.freeze([0, 4, 7, 10, 14, 17]), essential: Object.freeze([0, 4, 10, 17]) }),
  Object.freeze({ id: 'm11', label: 'Minor 11', symbol: 'm11', intervals: Object.freeze([0, 3, 7, 10, 14, 17]), essential: Object.freeze([0, 3, 10, 17]) }),
  Object.freeze({ id: '13', label: 'Dominant 13', symbol: '13', intervals: Object.freeze([0, 4, 7, 10, 14, 17, 21]), essential: Object.freeze([0, 4, 10, 21]) }),
  Object.freeze({ id: 'maj13', label: 'Major 13', symbol: 'maj13', intervals: Object.freeze([0, 4, 7, 11, 14, 21]), essential: Object.freeze([0, 4, 11, 21]) }),
  Object.freeze({ id: 'm13', label: 'Minor 13', symbol: 'm13', intervals: Object.freeze([0, 3, 7, 10, 14, 21]), essential: Object.freeze([0, 3, 10, 21]) }),
  Object.freeze({ id: 'sus2', label: 'Suspended 2', symbol: 'sus2', intervals: Object.freeze([0, 2, 7]), essential: Object.freeze([0, 2, 7]) }),
  Object.freeze({ id: 'sus4', label: 'Suspended 4', symbol: 'sus4', intervals: Object.freeze([0, 5, 7]), essential: Object.freeze([0, 5, 7]) }),
  Object.freeze({ id: '7sus4', label: 'Dominant 7 sus4', symbol: '7sus4', intervals: Object.freeze([0, 5, 7, 10]), essential: Object.freeze([0, 5, 10]) }),
  Object.freeze({ id: 'dim', label: 'Diminished', symbol: 'dim', intervals: Object.freeze([0, 3, 6]), essential: Object.freeze([0, 3, 6]) }),
  Object.freeze({ id: 'dim7', label: 'Diminished 7', symbol: 'dim7', intervals: Object.freeze([0, 3, 6, 9]), essential: Object.freeze([0, 3, 6, 9]) }),
  Object.freeze({ id: 'm7b5', label: 'Half-diminished', symbol: 'm7♭5', intervals: Object.freeze([0, 3, 6, 10]), essential: Object.freeze([0, 3, 6, 10]) }),
  Object.freeze({ id: 'mMaj7', label: 'Minor major 7', symbol: 'mMaj7', intervals: Object.freeze([0, 3, 7, 11]), essential: Object.freeze([0, 3, 11]) }),
  Object.freeze({ id: 'aug', label: 'Augmented', symbol: 'aug', intervals: Object.freeze([0, 4, 8]), essential: Object.freeze([0, 4, 8]) }),
  Object.freeze({ id: '7b5', label: 'Dominant 7 flat 5', symbol: '7♭5', intervals: Object.freeze([0, 4, 6, 10]), essential: Object.freeze([0, 4, 6, 10]) }),
  Object.freeze({ id: '7#5', label: 'Dominant 7 sharp 5', symbol: '7♯5', intervals: Object.freeze([0, 4, 8, 10]), essential: Object.freeze([0, 4, 8, 10]) }),
  Object.freeze({ id: '7b9', label: 'Dominant 7 flat 9', symbol: '7♭9', intervals: Object.freeze([0, 4, 7, 10, 13]), essential: Object.freeze([0, 4, 10, 13]) }),
  Object.freeze({ id: '7#9', label: 'Dominant 7 sharp 9', symbol: '7♯9', intervals: Object.freeze([0, 4, 7, 10, 15]), essential: Object.freeze([0, 4, 10, 15]) }),
  Object.freeze({ id: 'add11', label: 'Add 11', symbol: 'add11', intervals: Object.freeze([0, 4, 7, 17]), essential: Object.freeze([0, 4, 17]) }),
  Object.freeze({ id: '6add9', label: 'Six add nine', symbol: '6add9', intervals: Object.freeze([0, 4, 7, 9, 14]), essential: Object.freeze([0, 4, 9, 14]) }),
  Object.freeze({ id: '5', label: 'Power chord', symbol: '5', intervals: Object.freeze([0, 7]), essential: Object.freeze([0, 7]) }),
]);

const QUALITY_BY_ID = new Map(CHORD_QUALITIES.map((quality) => [quality.id, quality]));
const QUALITY_ALIASES = new Map([
  ['', 'major'], ['maj', 'major'], ['major', 'major'], ['M', 'major'],
  ['m', 'minor'], ['min', 'minor'], ['minor', 'minor'], ['-', 'minor'],
  ['7', '7'], ['dom7', '7'],
  ['maj7', 'maj7'], ['M7', 'maj7'], ['Δ7', 'maj7'], ['major7', 'maj7'],
  ['m7', 'm7'], ['min7', 'm7'], ['minor7', 'm7'], ['-7', 'm7'],
  ['6', '6'], ['maj6', '6'], ['major6', '6'],
  ['m6', 'm6'], ['min6', 'm6'], ['minor6', 'm6'],
  ['add9', 'add9'], ['add2', 'add9'],
  ['madd9', 'madd9'], ['minadd9', 'madd9'],
  ['9', '9'], ['dom9', '9'],
  ['maj9', 'maj9'], ['M9', 'maj9'], ['major9', 'maj9'],
  ['m9', 'm9'], ['min9', 'm9'], ['minor9', 'm9'], ['-9', 'm9'],
  ['11', '11'], ['dom11', '11'],
  ['m11', 'm11'], ['min11', 'm11'], ['minor11', 'm11'],
  ['13', '13'], ['dom13', '13'],
  ['maj13', 'maj13'], ['M13', 'maj13'], ['major13', 'maj13'],
  ['m13', 'm13'], ['min13', 'm13'], ['minor13', 'm13'],
  ['sus2', 'sus2'], ['2', 'sus2'],
  ['sus4', 'sus4'], ['sus', 'sus4'], ['4', 'sus4'],
  ['7sus4', '7sus4'], ['7sus', '7sus4'],
  ['dim', 'dim'], ['°', 'dim'], ['o', 'dim'],
  ['dim7', 'dim7'], ['°7', 'dim7'], ['o7', 'dim7'],
  ['m7b5', 'm7b5'], ['m7♭5', 'm7b5'], ['min7b5', 'm7b5'], ['ø7', 'm7b5'],
  ['mMaj7', 'mMaj7'], ['mmaj7', 'mMaj7'], ['minmaj7', 'mMaj7'],
  ['aug', 'aug'], ['+', 'aug'],
  ['7b5', '7b5'], ['7♭5', '7b5'], ['7#5', '7#5'], ['7♯5', '7#5'],
  ['7b9', '7b9'], ['7♭9', '7b9'], ['7#9', '7#9'], ['7♯9', '7#9'],
  ['add11', 'add11'], ['add4', 'add11'],
  ['6add9', '6add9'], ['69', '6add9'],
  ['5', '5'], ['power', '5'],
]);

function mod(value, divisor = 12) { return ((value % divisor) + divisor) % divisor; }
function normalizeAccidental(value = '') { return value.replace('♯', '#').replace('♭', 'b'); }

export function pitchClassFromName(value) {
  const match = String(value ?? '').trim().match(/^([A-Ga-g])([#b♯♭]?)$/);
  if (!match) return Number.NaN;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = normalizeAccidental(match[2]);
  return mod(natural + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

export function noteNameFromPitchClass(pitchClass, accidentalMode = 'sharps') {
  const names = accidentalMode === 'flats' ? FLAT_ROOTS : SHARP_ROOTS;
  return names[mod(Math.round(pitchClass))];
}

export function getChordQuality(id = 'major') { return QUALITY_BY_ID.get(id) ?? QUALITY_BY_ID.get('major'); }

function normalizeQualityToken(value) {
  const raw = String(value ?? '').trim();
  if (QUALITY_ALIASES.has(raw)) return QUALITY_ALIASES.get(raw);
  const lowered = raw.toLowerCase().replace(/\s+/g, '');
  return QUALITY_ALIASES.get(lowered) ?? null;
}

export function parseChordSymbol(value) {
  const source = String(value ?? '').trim();
  if (!source || source === '~' || source === '—' || /^n\.?c\.?$/i.test(source)) return source ? { rest: true, symbol: '—' } : null;
  const match = source.match(/^([A-Ga-g])([#b♯♭]?)([^/]*)?(?:\/([A-Ga-g])([#b♯♭]?))?$/);
  if (!match) return null;
  const rootText = `${match[1]}${match[2] ?? ''}`;
  const root = pitchClassFromName(rootText);
  const quality = normalizeQualityToken(match[3] ?? '');
  if (!Number.isFinite(root) || !quality) return null;
  const slashBass = match[4] ? pitchClassFromName(`${match[4]}${match[5] ?? ''}`) : null;
  const preferFlats = /[b♭]/.test(source);
  return { root, quality, slashBass: Number.isFinite(slashBass) ? slashBass : null, preferFlats, rest: false };
}

export function formatChordSymbol(root, quality = 'major', accidentalMode = 'sharps', slashBass = null) {
  const definition = getChordQuality(quality);
  const rootName = noteNameFromPitchClass(root, accidentalMode);
  const bass = Number.isFinite(slashBass) ? `/${noteNameFromPitchClass(slashBass, accidentalMode)}` : '';
  return `${rootName}${definition.symbol}${bass}`;
}

export function transposeChordSymbol(value, semitones = 0, accidentalMode = 'sharps') {
  const parsed = parseChordSymbol(value);
  if (!parsed) return String(value ?? '');
  if (parsed.rest) return '—';
  const mode = accidentalMode === 'auto' ? (parsed.preferFlats ? 'flats' : 'sharps') : accidentalMode;
  return formatChordSymbol(parsed.root + semitones, parsed.quality, mode, Number.isFinite(parsed.slashBass) ? parsed.slashBass + semitones : null);
}

export function chordPitchClasses(root, quality = 'major') {
  return [...new Set(getChordQuality(quality).intervals.map((interval) => mod(root + interval)))];
}

export function voicingNoteMidis(tuningMidi, frets) {
  if (!Array.isArray(tuningMidi) || !Array.isArray(frets) || tuningMidi.length !== frets.length) return [];
  return tuningMidi.map((midi, index) => (frets[index] >= 0 ? midi + frets[index] : null));
}

function voicingCompleteness(root, quality, noteMidis) {
  const definition = getChordQuality(quality);
  const present = new Set(noteMidis.filter(Number.isFinite).map((midi) => mod(midi)));
  const essential = definition.essential.map((interval) => mod(root + interval));
  if (!essential.every((pitchClass) => present.has(pitchClass))) return 0;
  const target = [...new Set(definition.intervals.map((interval) => mod(root + interval)))];
  return target.filter((pitchClass) => present.has(pitchClass)).length / target.length;
}

function internalMuteCount(frets) {
  const sounding = frets.map((fret, index) => (fret >= 0 ? index : -1)).filter((index) => index >= 0);
  if (sounding.length < 2) return 0;
  const first = Math.min(...sounding); const last = Math.max(...sounding);
  let count = 0;
  for (let index = first + 1; index < last; index += 1) if (frets[index] < 0) count += 1;
  return count;
}

function deriveFingering(frets) {
  const positive = [...new Set(frets.filter((fret) => fret > 0))].sort((a, b) => a - b);
  const fingerForFret = new Map(positive.map((fret, index) => [fret, Math.min(4, index + 1)]));
  const fingers = frets.map((fret) => (fret > 0 ? fingerForFret.get(fret) : null));
  const barres = [];
  for (const fret of positive) {
    const strings = frets.map((value, index) => (value === fret ? index : -1)).filter((index) => index >= 0);
    if (strings.length >= 2) barres.push({ fret, fromString: Math.min(...strings), toString: Math.max(...strings) });
  }
  return { fingers, barres };
}

function describePosition(frets) {
  const positive = frets.filter((fret) => fret > 0);
  if (!positive.length || Math.max(...positive) <= 4) return 'Open position';
  return `Position ${Math.min(...positive)}`;
}

function scoreVoicing({ frets, noteMidis, root, quality, completeness, requestedBass }) {
  const positive = frets.filter((fret) => fret > 0);
  const sounded = noteMidis.filter(Number.isFinite);
  const maxFret = positive.length ? Math.max(...positive) : 0;
  const minFret = positive.length ? Math.min(...positive) : 0;
  const span = positive.length ? maxFret - minFret : 0;
  const muted = frets.filter((fret) => fret < 0).length;
  const opens = frets.filter((fret) => fret === 0).length;
  const bassMidi = sounded.length ? Math.min(...sounded) : Number.NaN;
  const bassPitchClass = Number.isFinite(bassMidi) ? mod(bassMidi) : Number.NaN;
  const preferredBass = Number.isFinite(requestedBass) ? mod(requestedBass) : mod(root);
  const preferredBassPresent = bassPitchClass === preferredBass;
  const positionBonus = maxFret <= 4 ? 12 : Math.max(0, 7 - minFret) * 0.7;
  const qualityBonus = getChordQuality(quality).intervals.length > 3 ? completeness * 8 : 0;
  return (completeness * 100) + (preferredBassPresent ? 22 : 0) + (opens * 4) + (sounded.length * 1.7)
    + positionBonus + qualityBonus - (maxFret * 1.18) - (span * 3.2) - (muted * 1.25) - (internalMuteCount(frets) * 4);
}

function candidateFretsForString(openMidi, targetPitchClasses, windowStart, windowEnd, includeOpen) {
  const values = [-1];
  if (includeOpen && targetPitchClasses.has(mod(openMidi))) values.push(0);
  const firstFret = Math.max(1, windowStart);
  for (let fret = firstFret; fret <= windowEnd; fret += 1) if (targetPitchClasses.has(mod(openMidi + fret))) values.push(fret);
  return values;
}

export function generateChordVoicings(tuningMidi, root, quality = 'major', options = {}) {
  if (!Array.isArray(tuningMidi) || !tuningMidi.length || !tuningMidi.every(Number.isFinite)) return [];
  const maxFret = Math.max(4, Math.min(18, Number(options.maxFret) || 12));
  const maxSpan = Math.max(3, Math.min(5, Number(options.maxSpan) || 4));
  const limit = Math.max(1, Math.min(12, Number(options.limit) || 8));
  const minStrings = Math.max(2, Math.min(tuningMidi.length, Number(options.minStrings) || (tuningMidi.length >= 6 ? 4 : 3)));
  const requestedBass = Number.isFinite(options.bassPitchClass) ? mod(options.bassPitchClass) : null;
  const targetPitchClasses = new Set(chordPitchClasses(root, quality));
  if (requestedBass !== null) targetPitchClasses.add(requestedBass);
  const results = new Map();

  for (let windowStart = 0; windowStart <= maxFret; windowStart += 1) {
    const windowEnd = Math.min(maxFret, windowStart + maxSpan);
    const candidates = tuningMidi.map((midi) => candidateFretsForString(midi, targetPitchClasses, windowStart, windowEnd, windowStart === 0));
    const frets = new Array(tuningMidi.length).fill(-1);

    function visit(stringIndex, sounded, minPositive, maxPositive) {
      if (sounded + (tuningMidi.length - stringIndex) < minStrings) return;
      if (stringIndex === tuningMidi.length) {
        if (sounded < minStrings) return;
        const noteMidis = voicingNoteMidis(tuningMidi, frets);
        const soundedMidis = noteMidis.filter(Number.isFinite);
        const bassMidi = soundedMidis.length ? Math.min(...soundedMidis) : Number.NaN;
        if (requestedBass !== null && (!Number.isFinite(bassMidi) || mod(bassMidi) !== requestedBass)) return;
        const completeness = voicingCompleteness(root, quality, noteMidis);
        if (!completeness) return;
        const key = frets.join(',');
        if (results.has(key)) return;
        const { fingers, barres } = deriveFingering(frets);
        const positive = frets.filter((fret) => fret > 0);
        const baseFret = positive.length && Math.max(...positive) > 4 ? Math.min(...positive) : 1;
        results.set(key, {
          frets: [...frets],
          fingers,
          barres,
          baseFret,
          noteMidis,
          score: scoreVoicing({ frets, noteMidis, root, quality, completeness, requestedBass }),
          completeness,
          position: describePosition(frets),
        });
        return;
      }

      for (const fret of candidates[stringIndex]) {
        let nextMin = minPositive; let nextMax = maxPositive;
        if (fret > 0) {
          nextMin = Number.isFinite(nextMin) ? Math.min(nextMin, fret) : fret;
          nextMax = Number.isFinite(nextMax) ? Math.max(nextMax, fret) : fret;
          if (nextMax - nextMin > maxSpan) continue;
        }
        frets[stringIndex] = fret;
        visit(stringIndex + 1, sounded + (fret >= 0 ? 1 : 0), nextMin, nextMax);
      }
    }

    visit(0, 0, Number.NaN, Number.NaN);
  }

  const sorted = [...results.values()].sort((left, right) => right.score - left.score);
  const selected = [];
  const positionCounts = new Map();
  for (const voicing of sorted) {
    const bucket = voicing.baseFret <= 4 ? 'open' : Math.floor(voicing.baseFret / 3);
    const count = positionCounts.get(bucket) ?? 0;
    if (count >= 3 && selected.length < Math.ceil(limit / 2)) continue;
    selected.push(voicing); positionCounts.set(bucket, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function isChordVoicingValid(tuningMidi, frets, root, quality = 'major', options = {}) {
  const noteMidis = voicingNoteMidis(tuningMidi, frets);
  const sounded = noteMidis.filter(Number.isFinite);
  if (sounded.length < 2 || !voicingCompleteness(root, quality, noteMidis)) return false;
  if (Number.isFinite(options.bassPitchClass)) return mod(Math.min(...sounded)) === mod(options.bassPitchClass);
  return true;
}
