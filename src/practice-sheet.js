import { formatChordSymbol, parseChordSymbol, transposeChordSymbol } from './chords.js';
import { buildSongGuidance } from './song-guidance.js';

const MINOR_QUALITIES = new Set(['minor', 'm6', 'm7', 'm9', 'm11', 'm13', 'madd9', 'mMaj7']);
const DIMINISHED_QUALITIES = new Set(['dim', 'dim7', 'm7b5']);
const AUGMENTED_QUALITIES = new Set(['aug', '7#5']);

export function clampPracticeTranspose(value) {
  const number = Math.round(Number(value) || 0);
  return Math.min(11, Math.max(-11, number));
}

function namingMode(parsed, accidentalMode) {
  if (accidentalMode === 'flats' || accidentalMode === 'sharps') return accidentalMode;
  return parsed.preferFlats ? 'flats' : 'sharps';
}

export function simplifyChordSymbol(value, accidentalMode = 'auto') {
  const parsed = parseChordSymbol(value);
  if (!parsed) return String(value ?? '');
  if (parsed.rest) return '—';

  let quality = 'major';
  if (MINOR_QUALITIES.has(parsed.quality)) quality = 'minor';
  else if (DIMINISHED_QUALITIES.has(parsed.quality)) quality = 'dim';
  else if (AUGMENTED_QUALITIES.has(parsed.quality)) quality = 'aug';

  return formatChordSymbol(parsed.root, quality, namingMode(parsed, accidentalMode));
}

export function transformPracticeEvents(events, { transpose = 0, simplify = false, accidentalMode = 'auto' } = {}) {
  const semitones = clampPracticeTranspose(transpose);
  return (Array.isArray(events) ? events : []).map((event) => {
    const originalChord = String(event?.chord ?? '');
    const transposedChord = originalChord === '—'
      ? '—'
      : transposeChordSymbol(originalChord, semitones, accidentalMode);
    return {
      ...event,
      originalChord,
      chord: simplify ? simplifyChordSymbol(transposedChord, accidentalMode) : transposedChord,
    };
  });
}

export function buildPracticeGuidance({
  events = [],
  chart = {},
  instrument = 'guitar',
  duration = 0,
  accidentalMode = 'auto',
  transpose = 0,
  simplify = false,
} = {}) {
  const semitones = clampPracticeTranspose(transpose);
  const practiceEvents = transformPracticeEvents(events, {
    transpose: semitones,
    simplify,
    accidentalMode,
  });
  return {
    ...buildSongGuidance({
      events: practiceEvents,
      chart,
      instrument,
      duration,
      accidentalMode,
    }),
    transpose: semitones,
    simplified: Boolean(simplify),
  };
}
