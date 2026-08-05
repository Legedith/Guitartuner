const STORAGE_KEY = 'fretline:tuner:v1';
const ANALYSIS_INTERVAL_MS = 58;
const PITCH_TIMEOUT_MS = 480;
const IN_TUNE_CENTS = 3;
const STABLE_TUNE_MS = 560;
const PITCH_CLASSES = ['C', 'C♯ / D♭', 'D', 'D♯ / E♭', 'E', 'F', 'F♯ / G♭', 'G', 'G♯ / A♭', 'A', 'A♯ / B♭', 'B'];

function makeDefaults(customTunings = []) {
  return {
    instrument: 'guitar',
    tuningSelections: { guitar: INSTRUMENTS.guitar.defaultTuningId, ukulele: INSTRUMENTS.ukulele.defaultTuningId },
    mode: 'auto', referenceA: 440, sensitivity: 55, accidentalMode: 'auto', theme: 'system', vibration: true, wakeLock: true,
    chordRoot: 0, chordQuality: 'major', playlistUrl: DEFAULT_PLAYLIST_URL, playlistTracks: [], songCharts: {}, customTunings,
  };
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function loadSettings() {
  let parsed = {};
  try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { parsed = {}; }
  const customTunings = sanitizeCustomTunings(parsed.customTunings);
  const defaults = makeDefaults(customTunings);
  const instrument = Object.hasOwn(INSTRUMENTS, parsed.instrument) ? parsed.instrument : defaults.instrument;
  const tuningSelections = { ...defaults.tuningSelections, ...(parsed.tuningSelections || {}) };
  for (const instrumentId of Object.keys(INSTRUMENTS)) {
    const selected = getTuningById(tuningSelections[instrumentId], customTunings);
    if (!selected || selected.instrument !== instrumentId) tuningSelections[instrumentId] = INSTRUMENTS[instrumentId].defaultTuningId;
  }
  return {
    ...defaults, instrument, tuningSelections,
    mode: parsed.mode === 'manual' ? 'manual' : 'auto',
    referenceA: clamp(Number(parsed.referenceA) || 440, 430, 450),
    sensitivity: clamp(Number(parsed.sensitivity) || 55, 0, 100),
    accidentalMode: ['auto', 'sharps', 'flats'].includes(parsed.accidentalMode) ? parsed.accidentalMode : 'auto',
    theme: ['system', 'light', 'dark'].includes(parsed.theme) ? parsed.theme : 'system',
    vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : true,
    wakeLock: typeof parsed.wakeLock === 'boolean' ? parsed.wakeLock : true,
    chordRoot: clamp(Math.round(Number(parsed.chordRoot) || 0), 0, 11),
    chordQuality: CHORD_QUALITIES.some((quality) => quality.id === parsed.chordQuality) ? parsed.chordQuality : 'major',
    playlistUrl: typeof parsed.playlistUrl === 'string' && extractYouTubePlaylistId(parsed.playlistUrl) ? parsed.playlistUrl : DEFAULT_PLAYLIST_URL,
    playlistTracks: sanitizePlaylistTracks(parsed.playlistTracks),
    songCharts: sanitizeSongCharts(parsed.songCharts),
    customTunings,
  };
}
const settings = loadSettings();

const dom = {
  themeColor: document.querySelector('#themeColor'), instrumentSwitch: document.querySelector('#instrumentSwitch'), tuningButton: document.querySelector('#tuningButton'), tuningName: document.querySelector('#tuningName'), tuningNotes: document.querySelector('#tuningNotes'),
  tunerCard: document.querySelector('#tunerCard'), listenStatus: document.querySelector('#listenStatus'), pitchNote: document.querySelector('#pitchNote'), pitchOctave: document.querySelector('#pitchOctave'), pitchInstruction: document.querySelector('#pitchInstruction'), pitchFrequency: document.querySelector('#pitchFrequency'), pitchCents: document.querySelector('#pitchCents'), meterNeedle: document.querySelector('#meterNeedle'), meterTicks: document.querySelector('#meterTicks'), signalLevel: document.querySelector('#signalLevel'), microphoneButton: document.querySelector('#microphoneButton'), toneButton: document.querySelector('#toneButton'),
  stringsContainer: document.querySelector('#stringsContainer'), modeSwitch: document.querySelector('#modeSwitch'), tunedProgress: document.querySelector('#tunedProgress'), resetProgressButton: document.querySelector('#resetProgressButton'), readyCard: document.querySelector('#readyCard'), readyChordsButton: document.querySelector('#readyChordsButton'), readyLibraryButton: document.querySelector('#readyLibraryButton'),
  chordsButton: document.querySelector('#chordsButton'), libraryButton: document.querySelector('#libraryButton'), settingsButton: document.querySelector('#settingsButton'),
  tuningDialog: document.querySelector('#tuningDialog'), tuningInstrumentLabel: document.querySelector('#tuningInstrumentLabel'), tuningList: document.querySelector('#tuningList'), newCustomTuningButton: document.querySelector('#newCustomTuningButton'),
  customTuningDialog: document.querySelector('#customTuningDialog'), customTuningForm: document.querySelector('#customTuningForm'), customTuningTitle: document.querySelector('#customTuningTitle'), customInstrumentLabel: document.querySelector('#customInstrumentLabel'), customTuningName: document.querySelector('#customTuningName'), customStringRows: document.querySelector('#customStringRows'),
  chordDialog: document.querySelector('#chordDialog'), chordInstrumentLabel: document.querySelector('#chordInstrumentLabel'), chordRootSelect: document.querySelector('#chordRootSelect'), chordQualitySelect: document.querySelector('#chordQualitySelect'), chordName: document.querySelector('#chordName'), chordVoicingLabel: document.querySelector('#chordVoicingLabel'), chordVoicingCount: document.querySelector('#chordVoicingCount'), chordDiagram: document.querySelector('#chordDiagram'), chordNotes: document.querySelector('#chordNotes'), previousVoicingButton: document.querySelector('#previousVoicingButton'), nextVoicingButton: document.querySelector('#nextVoicingButton'), playChordButton: document.querySelector('#playChordButton'), essentialChordList: document.querySelector('#essentialChordList'),
  libraryDialog: document.querySelector('#libraryDialog'), playlistForm: document.querySelector('#playlistForm'), playlistUrl: document.querySelector('#playlistUrl'), loadPlaylistButton: document.querySelector('#loadPlaylistButton'), librarySummary: document.querySelector('#librarySummary'), youtubePlayerShell: document.querySelector('#youtubePlayerShell'), libraryStatus: document.querySelector('#libraryStatus'), libraryListView: document.querySelector('#libraryListView'), songSearch: document.querySelector('#songSearch'), indexPlaylistButton: document.querySelector('#indexPlaylistButton'), exportChartsButton: document.querySelector('#exportChartsButton'), importChartsInput: document.querySelector('#importChartsInput'), songList: document.querySelector('#songList'), libraryEmpty: document.querySelector('#libraryEmpty'),
  playAlongView: document.querySelector('#playAlongView'), backToLibraryButton: document.querySelector('#backToLibraryButton'), playAlongTitle: document.querySelector('#playAlongTitle'), playAlongArtist: document.querySelector('#playAlongArtist'), openYouTubeButton: document.querySelector('#openYouTubeButton'), playAlongSeek: document.querySelector('#playAlongSeek'), playAlongTime: document.querySelector('#playAlongTime'), playAlongDuration: document.querySelector('#playAlongDuration'), playAlongToggle: document.querySelector('#playAlongToggle'), playbackRate: document.querySelector('#playbackRate'), transposeDown: document.querySelector('#transposeDown'), transposeUp: document.querySelector('#transposeUp'), transposeValue: document.querySelector('#transposeValue'), setLoopStartButton: document.querySelector('#setLoopStartButton'), setLoopEndButton: document.querySelector('#setLoopEndButton'), toggleLoopButton: document.querySelector('#toggleLoopButton'), loopRange: document.querySelector('#loopRange'), currentSection: document.querySelector('#currentSection'), currentChordName: document.querySelector('#currentChordName'), nextChordName: document.querySelector('#nextChordName'), playAlongDiagram: document.querySelector('#playAlongDiagram'), upcomingChords: document.querySelector('#upcomingChords'), noChartMessage: document.querySelector('#noChartMessage'), findChordsButton: document.querySelector('#findChordsButton'), editSongChartButton: document.querySelector('#editSongChartButton'),
  songChartDialog: document.querySelector('#songChartDialog'), songChartForm: document.querySelector('#songChartForm'), songChartTitle: document.querySelector('#songChartTitle'), songChartArtist: document.querySelector('#songChartArtist'), songChartBpm: document.querySelector('#songChartBpm'), beatsPerChord: document.querySelector('#beatsPerChord'), songChartSource: document.querySelector('#songChartSource'), chartChordSymbol: document.querySelector('#chartChordSymbol'), markChordButton: document.querySelector('#markChordButton'), markChordTime: document.querySelector('#markChordTime'), songChartText: document.querySelector('#songChartText'),
  settingsDialog: document.querySelector('#settingsDialog'), referencePitch: document.querySelector('#referencePitch'), referencePitchValue: document.querySelector('#referencePitchValue'), referenceDown: document.querySelector('#referenceDown'), referenceUp: document.querySelector('#referenceUp'), sensitivity: document.querySelector('#sensitivity'), sensitivityValue: document.querySelector('#sensitivityValue'), accidentalSwitch: document.querySelector('#accidentalSwitch'), themeSwitch: document.querySelector('#themeSwitch'), vibrationToggle: document.querySelector('#vibrationToggle'), wakeLockToggle: document.querySelector('#wakeLockToggle'), installAppButton: document.querySelector('#installAppButton'), resetSettingsButton: document.querySelector('#resetSettingsButton'), toast: document.querySelector('#toast'),
};

let currentTuning = null;
let targets = [];
let selectedTargetIndex = 0;
let tunedStrings = new Set();
let pitchHistory = [];
let lastPitchAt = 0;
let lastAnalysisAt = 0;
let stableTargetIndex = null;
let stableSince = 0;
let pendingAutoTarget = null;
let pendingAutoFrames = 0;
let quietSignalSince = 0;
let unclearSignalSince = 0;
let animationFrame = 0;
let microphoneBusy = false;
let listening = false;
let mediaStream = null;
let microphoneContext = null;
let microphoneSource = null;
let analyser = null;
let analysisBuffer = null;
let wakeLockSentinel = null;
let referenceContext = null;
let referenceToneNodes = [];
let referenceToneTimer = 0;
let referenceTonePlayId = 0;
let referenceBufferCache = new Map();
let tonePlaying = false;
let chordVoicings = [];
let chordVoicingIndex = 0;
let chordSoundPlayback = null;
let chordSoundTimer = 0;
let chordSoundPlayId = 0;
let chordSoundPlaying = false;
let deferredInstallPrompt = null;
let editingCustomId = null;
let toastTimer = 0;
