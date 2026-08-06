const fretlineSongChordBaseEnsureLyricsUi = ensureFretlineLyricsUi;
const fretlineSongChordBaseResetLyricsReader = resetFretlineLyricsReader;
const fretlineSongChordBaseRenderLyrics = renderFretlineLyrics;
const fretlineSongChordBaseRenderLyricsUnavailable = renderFretlineLyricsUnavailable;
const fretlineSongChordBaseRenderPracticeSheet = renderFretlinePracticeSheet;
const fretlineSongChordBaseSetInstrument = setFretlineLyricsInstrument;
let fretlineSongChordTray = null;
let fretlineSongChordList = null;
let fretlineSongChordPanel = null;
let fretlineSongChordTitle = null;
let fretlineSongChordFret = null;
let fretlineSongChordCounter = null;
let fretlineSongChordDiagram = null;
let fretlineSongChordPrevious = null;
let fretlineSongChordNext = null;
let fretlineSongChordPlay = null;
let fretlineSongChordClose = null;
let fretlineSongChordActive = null;
let fretlineSongChordVoicings = [];
let fretlineSongChordVariationIndex = 0;
const fretlineSongChordVariationMemory = new Map();

function fretlineSongChordIconButton(label, path) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'song-chord-icon-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return button;
}

function fretlineSongChordInstrument() {
  return fretlineLyricsInstrument === 'ukulele' ? 'ukulele' : 'guitar';
}

function fretlineSongChordTuning() {
  const instrument = fretlineSongChordInstrument();
  if (settings.instrument === instrument && Array.isArray(currentTuning?.midi)) return currentTuning.midi;
  const defaultId = instrument === 'ukulele' ? 'ukulele-standard' : 'guitar-standard';
  const defaultTuning = getTuningById(defaultId, settings.customTunings);
  if (Array.isArray(defaultTuning?.midi)) return defaultTuning.midi;
  return instrument === 'ukulele' ? [67, 60, 64, 69] : [40, 45, 50, 55, 59, 64];
}

function fretlineSongChordKey(symbol) {
  return `${fretlineSongChordInstrument()}:${fretlineSongChordTuning().join(',')}:${symbol}`;
}

function fretlineSongChordEvents() {
  return collectUniqueSongChords(guidanceForTrack(selectedSong)?.events ?? []);
}

function ensureFretlineSongChordTray() {
  if (fretlineSongChordTray?.isConnected || !fretlineLyricsReader || !fretlineLyricsViewport) return;
  if (!document.querySelector('link[data-fretline-song-chords]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './styles/song-chord-tray.css';
    link.dataset.fretlineSongChords = 'true';
    document.head.append(link);
  }

  fretlineSongChordTray = document.createElement('section');
  fretlineSongChordTray.className = 'song-chord-tray';
  fretlineSongChordTray.setAttribute('aria-label', 'Chords used in this song');
  fretlineSongChordList = document.createElement('div');
  fretlineSongChordList.className = 'song-chord-list';
  fretlineSongChordList.setAttribute('role', 'list');

  fretlineSongChordPanel = document.createElement('div');
  fretlineSongChordPanel.className = 'song-chord-panel';
  fretlineSongChordPanel.hidden = true;
  fretlineSongChordPanel.setAttribute('aria-live', 'polite');

  const heading = document.createElement('div');
  heading.className = 'song-chord-panel-heading';
  const identity = document.createElement('div');
  identity.className = 'song-chord-panel-identity';
  fretlineSongChordTitle = document.createElement('strong');
  fretlineSongChordFret = document.createElement('span');
  identity.append(fretlineSongChordTitle, fretlineSongChordFret);
  fretlineSongChordClose = fretlineSongChordIconButton('Close chord chart', 'M6 6l12 12M18 6 6 18');
  heading.append(identity, fretlineSongChordClose);

  const stage = document.createElement('div');
  stage.className = 'song-chord-panel-stage';
  fretlineSongChordPrevious = fretlineSongChordIconButton('Previous variation', 'm15 18-6-6 6-6');
  fretlineSongChordDiagram = document.createElement('div');
  fretlineSongChordDiagram.className = 'song-chord-mini-diagram';
  fretlineSongChordNext = fretlineSongChordIconButton('Next variation', 'm9 6 6 6-6 6');
  stage.append(fretlineSongChordPrevious, fretlineSongChordDiagram, fretlineSongChordNext);

  const footer = document.createElement('div');
  footer.className = 'song-chord-panel-footer';
  fretlineSongChordCounter = document.createElement('span');
  fretlineSongChordCounter.className = 'song-chord-variation-counter';
  fretlineSongChordPlay = fretlineSongChordIconButton('Play chord', 'M8 5v14l11-7-11-7Z');
  footer.append(fretlineSongChordCounter, fretlineSongChordPlay);

  fretlineSongChordPanel.append(heading, stage, footer);
  fretlineSongChordTray.append(fretlineSongChordList, fretlineSongChordPanel);
  fretlineLyricsReader.insertBefore(fretlineSongChordTray, fretlineLyricsViewport);

  fretlineSongChordList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-display-chord]');
    if (!button) return;
    const selection = { displayChord: button.dataset.displayChord, soundChord: button.dataset.soundChord || button.dataset.displayChord };
    const sameSelection = fretlineSongChordActive?.displayChord === selection.displayChord;
    if (sameSelection && !fretlineSongChordPanel.hidden) closeFretlineSongChordPanel();
    else openFretlineSongChordPanel(selection);
  });
  fretlineSongChordPrevious.addEventListener('click', () => changeFretlineSongChordVariation(-1));
  fretlineSongChordNext.addEventListener('click', () => changeFretlineSongChordVariation(1));
  fretlineSongChordClose.addEventListener('click', closeFretlineSongChordPanel);
  fretlineSongChordPlay.addEventListener('click', () => {
    if (fretlineSongChordActive?.soundChord) playFretlineLyricChord(fretlineSongChordActive.soundChord);
  });

  if (fretlineLyricsContent && !fretlineLyricsContent.dataset.chordChartListener) {
    fretlineLyricsContent.dataset.chordChartListener = 'true';
    fretlineLyricsContent.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-sound-chord]');
      if (!button || !fretlineLyricsContent.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openFretlineSongChordPanel({
        displayChord: String(button.textContent ?? '').trim(),
        soundChord: button.dataset.soundChord || String(button.textContent ?? '').trim(),
      });
    }, true);
  }
}

function closeFretlineSongChordPanel() {
  if (!fretlineSongChordPanel) return;
  fretlineSongChordPanel.hidden = true;
  fretlineSongChordActive = null;
  fretlineSongChordVoicings = [];
  fretlineSongChordList?.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', 'false'));
}

function openFretlineSongChordPanel(selection) {
  ensureFretlineSongChordTray();
  if (!selection?.displayChord || !fretlineSongChordPanel) return;
  fretlineSongChordActive = selection;
  const parsed = parseChordSymbol(selection.displayChord);
  const tuning = fretlineSongChordTuning();
  fretlineSongChordVoicings = parsed && !parsed.rest
    ? generateChordVoicings(tuning, parsed.root, parsed.quality, {
        limit: 8,
        maxFret: 15,
        maxSpan: 4,
        minStrings: fretlineSongChordInstrument() === 'ukulele' ? 3 : 4,
        bassPitchClass: parsed.slashBass,
      })
    : [];
  const memoryKey = fretlineSongChordKey(selection.displayChord);
  fretlineSongChordVariationIndex = Math.min(
    Math.max(0, fretlineSongChordVariationMemory.get(memoryKey) ?? 0),
    Math.max(0, fretlineSongChordVoicings.length - 1),
  );
  fretlineSongChordPanel.hidden = false;
  fretlineSongChordList?.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.displayChord === selection.displayChord));
  });
  renderFretlineSongChordVariation();
}

function changeFretlineSongChordVariation(delta) {
  if (!fretlineSongChordActive || !fretlineSongChordVoicings.length) return;
  fretlineSongChordVariationIndex = nextChordVariationIndex(
    fretlineSongChordVariationIndex,
    fretlineSongChordVoicings.length,
    delta,
  );
  fretlineSongChordVariationMemory.set(
    fretlineSongChordKey(fretlineSongChordActive.displayChord),
    fretlineSongChordVariationIndex,
  );
  renderFretlineSongChordVariation();
}

function renderFretlineSongChordVariation() {
  if (!fretlineSongChordActive || !fretlineSongChordPanel) return;
  const voicing = fretlineSongChordVoicings[fretlineSongChordVariationIndex] ?? null;
  fretlineSongChordTitle.textContent = fretlineSongChordActive.displayChord;
  fretlineSongChordDiagram.replaceChildren();
  fretlineSongChordCounter.textContent = chordVariationCounter(fretlineSongChordVariationIndex, fretlineSongChordVoicings.length);
  fretlineSongChordPrevious.disabled = fretlineSongChordVoicings.length <= 1;
  fretlineSongChordNext.disabled = fretlineSongChordVoicings.length <= 1;
  fretlineSongChordPlay.disabled = !fretlineSongChordActive.soundChord;
  if (!voicing) {
    fretlineSongChordFret.textContent = '';
    const empty = document.createElement('span');
    empty.className = 'song-chord-no-shape';
    empty.textContent = 'No shape';
    fretlineSongChordDiagram.append(empty);
    return;
  }
  fretlineSongChordFret.textContent = voicingFretLabel(voicing);
  fretlineSongChordDiagram.append(createChordDiagramElement(voicing, fretlineSongChordTuning(), {
    compact: true,
    symbol: fretlineSongChordActive.displayChord,
  }));
}

function renderFretlineSongChordTray({ resetSelection = false } = {}) {
  ensureFretlineSongChordTray();
  if (!fretlineSongChordTray || !fretlineSongChordList) return;
  const chords = fretlineSongChordEvents();
  fretlineSongChordTray.hidden = !chords.length;
  fretlineSongChordList.replaceChildren();
  if (!chords.length) {
    closeFretlineSongChordPanel();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const chord of chords) {
    const item = document.createElement('span');
    item.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'song-chord-chip';
    button.dataset.displayChord = chord.displayChord;
    button.dataset.soundChord = chord.soundChord;
    button.textContent = chord.displayChord;
    button.setAttribute('aria-pressed', String(fretlineSongChordActive?.displayChord === chord.displayChord));
    button.setAttribute('aria-label', `${chord.displayChord} chord chart`);
    item.append(button);
    fragment.append(item);
  }
  fretlineSongChordList.append(fragment);

  const activeStillExists = chords.some((chord) => chord.displayChord === fretlineSongChordActive?.displayChord);
  if (resetSelection || !activeStillExists) closeFretlineSongChordPanel();
  else if (fretlineSongChordActive) openFretlineSongChordPanel(fretlineSongChordActive);
}

ensureFretlineLyricsUi = function ensureLyricsWithSongChordTray() {
  fretlineSongChordBaseEnsureLyricsUi();
  ensureFretlineSongChordTray();
};

resetFretlineLyricsReader = function resetLyricsWithSongChordTray() {
  const result = fretlineSongChordBaseResetLyricsReader();
  renderFretlineSongChordTray({ resetSelection: true });
  return result;
};

renderFretlineLyrics = function renderLyricsWithSongChordTray(...args) {
  const result = fretlineSongChordBaseRenderLyrics(...args);
  renderFretlineSongChordTray();
  return result;
};

renderFretlineLyricsUnavailable = function renderUnavailableWithSongChordTray(...args) {
  const result = fretlineSongChordBaseRenderLyricsUnavailable(...args);
  renderFretlineSongChordTray();
  return result;
};

renderFretlinePracticeSheet = function renderPracticeWithSongChordTray(...args) {
  const result = fretlineSongChordBaseRenderPracticeSheet(...args);
  renderFretlineSongChordTray();
  return result;
};

setFretlineLyricsInstrument = function setInstrumentWithSongChordTray(...args) {
  const result = fretlineSongChordBaseSetInstrument(...args);
  renderFretlineSongChordTray({ resetSelection: true });
  return result;
};

ensureFretlineLyricsUi();
renderFretlineSongChordTray();
