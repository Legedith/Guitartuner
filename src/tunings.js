const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export const INSTRUMENTS = Object.freeze({
  guitar: Object.freeze({ id: 'guitar', name: 'Guitar', stringCount: 6, defaultTuningId: 'guitar-standard' }),
  ukulele: Object.freeze({ id: 'ukulele', name: 'Ukulele', stringCount: 4, defaultTuningId: 'ukulele-standard' }),
});

// Notes are ordered by physical string number: guitar 6 → 1, ukulele 4 → 1.
export const PRESET_TUNINGS = Object.freeze([
  Object.freeze({ id: 'guitar-standard', instrument: 'guitar', name: 'Standard', description: 'E A D G B E', midi: Object.freeze([40, 45, 50, 55, 59, 64]) }),
  Object.freeze({ id: 'guitar-drop-d', instrument: 'guitar', name: 'Drop D', description: 'D A D G B E', midi: Object.freeze([38, 45, 50, 55, 59, 64]) }),
  Object.freeze({ id: 'guitar-eb-standard', instrument: 'guitar', name: 'Half step down', description: 'E♭ A♭ D♭ G♭ B♭ E♭', midi: Object.freeze([39, 44, 49, 54, 58, 63]), preferFlats: true }),
  Object.freeze({ id: 'guitar-d-standard', instrument: 'guitar', name: 'D standard', description: 'D G C F A D', midi: Object.freeze([38, 43, 48, 53, 57, 62]) }),
  Object.freeze({ id: 'guitar-drop-c', instrument: 'guitar', name: 'Drop C', description: 'C G C F A D', midi: Object.freeze([36, 43, 48, 53, 57, 62]) }),
  Object.freeze({ id: 'guitar-dadgad', instrument: 'guitar', name: 'DADGAD', description: 'D A D G A D', midi: Object.freeze([38, 45, 50, 55, 57, 62]) }),
  Object.freeze({ id: 'guitar-open-g', instrument: 'guitar', name: 'Open G', description: 'D G D G B D', midi: Object.freeze([38, 43, 50, 55, 59, 62]) }),
  Object.freeze({ id: 'guitar-open-d', instrument: 'guitar', name: 'Open D', description: 'D A D F♯ A D', midi: Object.freeze([38, 45, 50, 54, 57, 62]) }),
  Object.freeze({ id: 'guitar-open-e', instrument: 'guitar', name: 'Open E', description: 'E B E G♯ B E', midi: Object.freeze([40, 47, 52, 56, 59, 64]) }),
  Object.freeze({ id: 'ukulele-standard', instrument: 'ukulele', name: 'Standard · high G', description: 'G C E A', midi: Object.freeze([67, 60, 64, 69]) }),
  Object.freeze({ id: 'ukulele-low-g', instrument: 'ukulele', name: 'Low G', description: 'G C E A', midi: Object.freeze([55, 60, 64, 69]) }),
  Object.freeze({ id: 'ukulele-d-tuning', instrument: 'ukulele', name: 'D tuning', description: 'A D F♯ B', midi: Object.freeze([69, 62, 66, 71]) }),
  Object.freeze({ id: 'ukulele-baritone', instrument: 'ukulele', name: 'Baritone', description: 'D G B E', midi: Object.freeze([50, 55, 59, 64]) }),
]);

export function getTuningsForInstrument(instrument, customTunings = []) {
  return [...PRESET_TUNINGS.filter((item) => item.instrument === instrument), ...customTunings.filter((item) => item.instrument === instrument)];
}

export function getTuningById(id, customTunings = []) {
  return PRESET_TUNINGS.find((item) => item.id === id) ?? customTunings.find((item) => item.id === id) ?? null;
}

export function midiToFrequency(midi, referenceA = 440) {
  return referenceA * (2 ** ((midi - 69) / 12));
}

export function frequencyToMidi(frequency, referenceA = 440) {
  if (!Number.isFinite(frequency) || frequency <= 0) return Number.NaN;
  return 69 + (12 * Math.log2(frequency / referenceA));
}

export function centsBetween(frequency, targetFrequency) {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(targetFrequency) || targetFrequency <= 0) return Number.NaN;
  return 1200 * Math.log2(frequency / targetFrequency);
}

export function noteNameFromMidi(midi, accidentalMode = 'sharps', preferFlats = false) {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const names = accidentalMode === 'flats' || (accidentalMode === 'auto' && preferFlats) ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClass];
}

export function octaveFromMidi(midi) {
  return Math.floor(Math.round(midi) / 12) - 1;
}

export function formatMidiNote(midi, accidentalMode = 'sharps', preferFlats = false) {
  return `${noteNameFromMidi(midi, accidentalMode, preferFlats)}${octaveFromMidi(midi)}`;
}

export function formatTuningNotes(tuning, accidentalMode = 'auto') {
  return tuning.midi.map((midi) => noteNameFromMidi(midi, accidentalMode, Boolean(tuning.preferFlats))).join(' · ');
}

export function buildTargetStrings(tuning, referenceA = 440, accidentalMode = 'auto') {
  return tuning.midi.map((midi, index) => ({
    index,
    number: tuning.midi.length - index,
    midi,
    frequency: midiToFrequency(midi, referenceA),
    note: noteNameFromMidi(midi, accidentalMode, Boolean(tuning.preferFlats)),
    octave: octaveFromMidi(midi),
  }));
}

export function isValidCustomTuning(tuning) {
  const instrument = INSTRUMENTS[tuning?.instrument];
  return Boolean(tuning && typeof tuning.id === 'string' && typeof tuning.name === 'string' && tuning.name.trim()
    && instrument && Array.isArray(tuning.midi) && tuning.midi.length === instrument.stringCount
    && tuning.midi.every((value) => Number.isInteger(value) && value >= 24 && value <= 96));
}

export function sanitizeCustomTunings(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidCustomTuning).map((tuning) => ({
    id: tuning.id,
    instrument: tuning.instrument,
    name: tuning.name.trim().slice(0, 36),
    description: typeof tuning.description === 'string' ? tuning.description.slice(0, 80) : '',
    midi: [...tuning.midi],
    custom: true,
  }));
}
