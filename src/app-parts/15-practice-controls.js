const FRETLINE_PRACTICE_SIMPLIFY_KEY = 'fretline:practice-simplify';
const FRETLINE_PRACTICE_TRANSPOSE_PREFIX = 'fretline:practice-transpose:';
const fretlinePracticeBaseSelectSong = selectSong;
const fretlinePracticeBaseUpdateGuide = updateFretlineLyricsGuide;
const fretlinePracticeBaseActiveLine = updateFretlineLyricsActiveLine;
let fretlinePracticeSimplified = loadFretlinePracticeSimplified();
let fretlinePracticeTranspose = 0;
let fretlinePracticeControls = null;
let fretlinePracticeSimplifyButton = null;
let fretlinePracticeTransposeDown = null;
let fretlinePracticeTransposeValue = null;
let fretlinePracticeTransposeUp = null;

function loadFretlinePracticeSimplified() {
  try { return localStorage.getItem(FRETLINE_PRACTICE_SIMPLIFY_KEY) === 'true'; }
  catch (_) { return false; }
}

function saveFretlinePracticeSimplified() {
  try { localStorage.setItem(FRETLINE_PRACTICE_SIMPLIFY_KEY, String(fretlinePracticeSimplified)); } catch (_) {}
}

function fretlinePracticeTransposeKey(videoId = selectedSong?.videoId) {
  return videoId ? `${FRETLINE_PRACTICE_TRANSPOSE_PREFIX}${videoId}` : '';
}

function loadFretlinePracticeTranspose(videoId = selectedSong?.videoId) {
  const key = fretlinePracticeTransposeKey(videoId);
  if (!key) return 0;
  try { return clampPracticeTranspose(localStorage.getItem(key) || 0); }
  catch (_) { return 0; }
}

function saveFretlinePracticeTranspose() {
  const key = fretlinePracticeTransposeKey();
  if (!key) return;
  try {
    if (fretlinePracticeTranspose) localStorage.setItem(key, String(fretlinePracticeTranspose));
    else localStorage.removeItem(key);
  } catch (_) {}
}

function fretlinePracticeStepButton(label, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lyrics-transpose-step';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  return button;
}

function ensureFretlinePracticeControls() {
  ensureFretlineLyricsUi();
  if (fretlinePracticeControls?.isConnected || !fretlineLyricsGuide) return;

  fretlinePracticeControls = document.createElement('div');
  fretlinePracticeControls.className = 'lyrics-practice-controls';

  fretlinePracticeSimplifyButton = document.createElement('button');
  fretlinePracticeSimplifyButton.type = 'button';
  fretlinePracticeSimplifyButton.className = 'lyrics-simplify-button';
  fretlinePracticeSimplifyButton.textContent = 'Simplify';
  fretlinePracticeSimplifyButton.addEventListener('click', () => {
    fretlinePracticeSimplified = !fretlinePracticeSimplified;
    saveFretlinePracticeSimplified();
    renderFretlinePracticeSheet();
  });

  const transpose = document.createElement('div');
  transpose.className = 'lyrics-transpose-control';
  transpose.setAttribute('role', 'group');
  transpose.setAttribute('aria-label', 'Transpose chords');
  fretlinePracticeTransposeDown = fretlinePracticeStepButton('Transpose down one semitone', '−');
  fretlinePracticeTransposeUp = fretlinePracticeStepButton('Transpose up one semitone', '+');
  fretlinePracticeTransposeValue = document.createElement('button');
  fretlinePracticeTransposeValue.type = 'button';
  fretlinePracticeTransposeValue.className = 'lyrics-transpose-value';
  fretlinePracticeTransposeValue.addEventListener('click', () => setFretlinePracticeTranspose(0));
  fretlinePracticeTransposeDown.addEventListener('click', () => setFretlinePracticeTranspose(fretlinePracticeTranspose - 1));
  fretlinePracticeTransposeUp.addEventListener('click', () => setFretlinePracticeTranspose(fretlinePracticeTranspose + 1));
  transpose.append(fretlinePracticeTransposeDown, fretlinePracticeTransposeValue, fretlinePracticeTransposeUp);
  fretlinePracticeControls.append(fretlinePracticeSimplifyButton, transpose);

  fretlineLyricsGuide.insertBefore(fretlinePracticeControls, fretlineLyricsKeyOutput);
  if (fretlineLyricsViewport && !fretlineLyricsViewport.dataset.practiceScrollListener) {
    fretlineLyricsViewport.dataset.practiceScrollListener = 'true';
    fretlineLyricsViewport.addEventListener('scroll', updateFretlineLyricsActiveLine, { passive: true });
  }
  updateFretlinePracticeControls();
}

function updateFretlinePracticeControls() {
  if (!fretlinePracticeControls?.isConnected) return;
  fretlinePracticeSimplifyButton.setAttribute('aria-pressed', String(fretlinePracticeSimplified));
  fretlinePracticeSimplifyButton.title = fretlinePracticeSimplified ? 'Use full chords' : 'Simplify chords';
  fretlinePracticeTransposeDown.disabled = fretlinePracticeTranspose <= -11;
  fretlinePracticeTransposeUp.disabled = fretlinePracticeTranspose >= 11;
  fretlinePracticeTransposeValue.disabled = fretlinePracticeTranspose === 0;
  fretlinePracticeTransposeValue.textContent = fretlinePracticeTranspose > 0
    ? `+${fretlinePracticeTranspose}`
    : String(fretlinePracticeTranspose);
  fretlinePracticeTransposeValue.setAttribute('aria-label', fretlinePracticeTranspose
    ? `Transposed ${fretlinePracticeTranspose > 0 ? 'up' : 'down'} ${Math.abs(fretlinePracticeTranspose)} semitone${Math.abs(fretlinePracticeTranspose) === 1 ? '' : 's'}; reset`
    : 'No transposition');
  fretlinePracticeTransposeValue.title = fretlinePracticeTranspose ? 'Reset transposition' : 'No transposition';
}

function setFretlinePracticeTranspose(value) {
  const next = clampPracticeTranspose(value);
  if (next === fretlinePracticeTranspose) return;
  fretlinePracticeTranspose = next;
  saveFretlinePracticeTranspose();
  renderFretlinePracticeSheet();
}

function fretlinePracticeScrollRatio() {
  if (!fretlineLyricsViewport) return 0;
  const maximum = fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight;
  return maximum > 0 ? fretlineLyricsViewport.scrollTop / maximum : 0;
}

function renderFretlinePracticeSheet() {
  const ratio = fretlinePracticeScrollRatio();
  updateFretlineLyricsGuide();
  if (fretlineLyricsCurrentRecord && fretlineLyricsCurrentTrack) {
    renderFretlineLyrics(fretlineLyricsCurrentRecord, fretlineLyricsCurrentTrack, fretlineLyricsCurrentToken);
    requestAnimationFrame(() => {
      if (!fretlineLyricsViewport) return;
      const maximum = fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight;
      fretlineLyricsViewport.scrollTop = maximum * ratio;
      updateFretlineLyricsActiveLine();
    });
  }
  updateFretlinePracticeControls();
}

guidanceForTrack = function practiceGuidanceForTrack(track) {
  if (!track) return null;
  const chart = settings.songCharts?.[track.videoId] ?? {};
  const duration = currentPlayerDuration() || track.duration || 0;
  return buildPracticeGuidance({
    events: displayedChartEvents(),
    chart,
    instrument: fretlineLyricsInstrument,
    duration,
    accidentalMode: settings.accidentalMode,
    transpose: fretlinePracticeTranspose,
    simplify: fretlinePracticeSimplified,
  });
};

updateFretlineLyricsGuide = function updatePracticeGuide(guidance = guidanceForTrack(selectedSong)) {
  fretlinePracticeBaseUpdateGuide(guidance);
  ensureFretlinePracticeControls();
  updateFretlinePracticeControls();
};

selectSong = async function selectSongForIndependentPractice(catalogId) {
  const request = fretlinePracticeBaseSelectSong(catalogId, false);
  fretlinePracticeTranspose = loadFretlinePracticeTranspose(selectedSong?.videoId);
  ensureFretlinePracticeControls();
  updateFretlinePracticeControls();
  if (fretlineLyricsCurrentRecord && fretlineLyricsCurrentTrack) renderFretlinePracticeSheet();
  await request;
};

updatePlayButton = function keepAudioStateOutOfPracticeControls() {
  updateFretlineLyricsControls();
};

onYouTubePlayerReady = function readyOptionalYouTubePlayer() {
  youtubePlayerReady = true;
  updateFretlineLyricsControls();
  startPlayAlongTicker();
};

onYouTubeStateChange = function optionalAudioStateChange(event) {
  fretlineLyricsBaseYouTubeStateChange(event);
  updateFretlineLyricsControls();
  updateFretlineLyricsActiveLine();
};

togglePlayAlong = function toggleIndependentPracticeScroll() {
  setFretlineLyricsScrollPlaying(!fretlineLyricsScrollPlaying);
};

updateFretlineLyricsActiveLine = function updatePracticeReadingLine() {
  const audioPlaying = Boolean(globalThis.YT)
    && youtubeState() === globalThis.YT.PlayerState.PLAYING;
  if (audioPlaying) {
    fretlinePracticeBaseActiveLine();
    return;
  }
  if (!fretlineLyricsViewport || !fretlineLyricsLineElements.length) return;
  const viewport = fretlineLyricsViewport.getBoundingClientRect();
  const readingY = viewport.top + (viewport.height * .36);
  let active = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const item of fretlineLyricsLineElements) {
    const rectangle = item.node.getBoundingClientRect();
    const itemDistance = Math.abs((rectangle.top + Math.min(rectangle.height / 2, 28)) - readingY);
    if (itemDistance < distance) {
      active = item;
      distance = itemDistance;
    }
  }
  fretlineLyricsLineElements.forEach((item) => {
    if (item === active) item.node.setAttribute('aria-current', 'true');
    else item.node.removeAttribute('aria-current');
  });
};

ensureFretlinePracticeControls();
updateFretlineLyricsGuide();
updateFretlineLyricsControls();
