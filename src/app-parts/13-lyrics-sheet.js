const FRETLINE_LYRICS_SPEED_KEY = 'fretline:lyrics-scroll-speed:v1';
const fretlineLyricsBaseSelectSong = selectSong;
const fretlineLyricsBaseBackToLibrary = backToLibrary;
const fretlineLyricsBaseInitializeSongLibrary = initializeSongLibrary;
const fretlineLyricsBaseOnYouTubeStateChange = onYouTubeStateChange;

let fretlineLyricsStore = loadLyricsStore();
let fretlineLyricsViewport = null;
let fretlineLyricsSheet = null;
let fretlineLyricsEditor = null;
let fretlineLyricsEditorText = null;
let fretlineLyricsEditButton = null;
let fretlineLyricsSlowButton = null;
let fretlineLyricsFastButton = null;
let fretlineLyricsSpeedOutput = null;
let fretlineLyricsRenderKey = '';
let fretlineLyricsScrollSpeed = fretlineLyricsLoadSpeed();
let fretlineLyricsScrollActive = false;
let fretlineLyricsFollowPlayback = false;
let fretlineLyricsFrame = 0;
let fretlineLyricsLastFrame = 0;
let fretlineLyricsSaveTimer = 0;

function fretlineLyricsLoadSpeed() {
  try {
    const value = Number(localStorage.getItem(FRETLINE_LYRICS_SPEED_KEY));
    return Number.isFinite(value) ? clamp(Math.round(value * 10) / 10, .1, 1) : .5;
  } catch (_) {
    return .5;
  }
}

function fretlineLyricsSaveSpeed() {
  try { localStorage.setItem(FRETLINE_LYRICS_SPEED_KEY, String(fretlineLyricsScrollSpeed)); } catch (_) {}
}

function fretlineLyricsIcon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

function fretlineLyricsEnsureStyles() {
  if (document.querySelector('link[data-fretline-lyrics-sheet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './styles/lyrics-sheet.css';
  link.dataset.fretlineLyricsSheet = 'true';
  document.head.append(link);
}

function fretlineLyricsMakeButton(className, label, content) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = content;
  return button;
}

function fretlineLyricsEnsureEditor() {
  if (fretlineLyricsEditor) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet lyrics-editor-sheet';
  dialog.setAttribute('aria-labelledby', 'lyricsEditorTitle');
  dialog.innerHTML = `
    <div class="sheet-header">
      <h2 id="lyricsEditorTitle">Lyrics</h2>
      <button class="icon-button" type="button" aria-label="Close lyrics"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>
    <textarea class="lyrics-editor-text" spellcheck="true" placeholder="[C]Words [G]words"></textarea>`;
  document.body.append(dialog);
  fretlineLyricsEditor = dialog;
  fretlineLyricsEditorText = dialog.querySelector('textarea');
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', fretlineLyricsCommitEditor);
  fretlineLyricsEditorText.addEventListener('input', () => {
    clearTimeout(fretlineLyricsSaveTimer);
    fretlineLyricsSaveTimer = setTimeout(fretlineLyricsCommitEditor, 220);
  });
}

function fretlineLyricsEnsureUi() {
  if (fretlineLyricsViewport) return;
  fretlineLyricsEnsureStyles();
  fretlineLyricsEnsureEditor();
  dom.libraryDialog.classList.add('lyrics-library');

  const heading = dom.playAlongView.querySelector('.song-heading');
  let headingActions = heading?.querySelector('.lyrics-heading-actions');
  if (!headingActions && heading) {
    headingActions = document.createElement('div');
    headingActions.className = 'lyrics-heading-actions';
    fretlineLyricsEditButton = fretlineLyricsMakeButton(
      'icon-button lyrics-edit-button',
      'Edit lyrics',
      fretlineLyricsIcon('M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4'),
    );
    dom.openYouTubeButton.before(headingActions);
    headingActions.append(fretlineLyricsEditButton, dom.openYouTubeButton);
    fretlineLyricsEditButton.addEventListener('click', fretlineLyricsOpenEditor);
  }

  const playButton = dom.playAlongToggle;
  playButton.remove();
  playButton.className = 'lyrics-control lyrics-play-toggle';
  playButton.innerHTML = fretlineLyricsIcon('M8 5v14l11-7-11-7Z');
  playButton.setAttribute('aria-label', 'Play');
  playButton.title = 'Play';

  dom.playAlongView.querySelector('.playback-progress')?.remove();
  dom.playAlongView.querySelector('.playback-controls')?.remove();
  dom.playAlongView.querySelector('.loop-controls')?.remove();
  dom.playAlongCard?.remove();
  dom.upcomingChords?.remove();

  const viewport = document.createElement('div');
  viewport.className = 'lyrics-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', 'Chorded lyrics');
  const sheet = document.createElement('div');
  sheet.className = 'lyrics-sheet';
  viewport.append(sheet);

  const controls = document.createElement('div');
  controls.className = 'lyrics-scroll-controls';
  fretlineLyricsSlowButton = fretlineLyricsMakeButton('lyrics-control', 'Slower scrolling', '−');
  fretlineLyricsFastButton = fretlineLyricsMakeButton('lyrics-control', 'Faster scrolling', '+');
  fretlineLyricsSpeedOutput = document.createElement('output');
  fretlineLyricsSpeedOutput.className = 'lyrics-speed-output';
  fretlineLyricsSpeedOutput.setAttribute('aria-live', 'polite');
  controls.append(fretlineLyricsSlowButton, playButton, fretlineLyricsFastButton, fretlineLyricsSpeedOutput);

  dom.playAlongView.append(viewport, controls);
  fretlineLyricsViewport = viewport;
  fretlineLyricsSheet = sheet;
  fretlineLyricsSlowButton.addEventListener('click', () => fretlineLyricsSetSpeed(fretlineLyricsScrollSpeed - .1));
  fretlineLyricsFastButton.addEventListener('click', () => fretlineLyricsSetSpeed(fretlineLyricsScrollSpeed + .1));
  fretlineLyricsUpdateSpeedUi();
}

function fretlineLyricsSetSpeed(value) {
  fretlineLyricsScrollSpeed = clamp(Math.round(Number(value) * 10) / 10, .1, 1);
  fretlineLyricsSaveSpeed();
  fretlineLyricsUpdateSpeedUi();
}

function fretlineLyricsUpdateSpeedUi() {
  if (!fretlineLyricsSpeedOutput) return;
  fretlineLyricsSpeedOutput.value = `${fretlineLyricsScrollSpeed.toFixed(1)}×`;
  fretlineLyricsSpeedOutput.textContent = `${fretlineLyricsScrollSpeed.toFixed(1)}×`;
  fretlineLyricsSlowButton.disabled = fretlineLyricsScrollSpeed <= .1;
  fretlineLyricsFastButton.disabled = fretlineLyricsScrollSpeed >= 1;
}

function fretlineLyricsRaw() {
  if (!selectedSong?.videoId) return '';
  return fretlineLyricsStore[selectedSong.videoId] || settings.songCharts[selectedSong.videoId]?.raw || '';
}

function fretlineLyricsRenderChord(chord) {
  return displayChord(chord, playAlongTranspose, chordAccidentalMode());
}

function fretlineLyricsLine(entries) {
  const line = document.createElement('div');
  line.className = 'lyrics-line';
  for (const entry of entries) {
    const segment = document.createElement('span');
    segment.className = 'lyrics-segment';
    const chord = document.createElement('span');
    chord.className = 'lyrics-chord';
    chord.textContent = fretlineLyricsRenderChord(entry.chord) || '\u00a0';
    const text = document.createElement('span');
    text.className = 'lyrics-text';
    text.textContent = entry.text || '\u00a0';
    segment.append(chord, text);
    line.append(segment);
  }
  return line;
}

function fretlineLyricsRender(force = false) {
  fretlineLyricsEnsureUi();
  const raw = fretlineLyricsRaw();
  const key = `${selectedSong?.videoId || ''}:${playAlongTranspose}:${settings.accidentalMode}:${raw}`;
  if (!force && key === fretlineLyricsRenderKey) return;
  fretlineLyricsRenderKey = key;
  fretlineLyricsSheet.replaceChildren();

  const entries = parseChordedLyrics(raw);
  if (!entries.length) {
    const add = fretlineLyricsMakeButton(
      'lyrics-empty-button',
      'Add lyrics',
      fretlineLyricsIcon('M12 5v14M5 12h14'),
    );
    add.addEventListener('click', fretlineLyricsOpenEditor);
    fretlineLyricsSheet.append(add);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    if (entry.type === 'section') {
      const section = document.createElement('h4');
      section.className = 'lyrics-section';
      section.textContent = entry.text;
      fragment.append(section);
    } else if (entry.type === 'spacer') {
      const spacer = document.createElement('div');
      spacer.className = 'lyrics-spacer';
      fragment.append(spacer);
    } else if (entry.type === 'chords') {
      const row = document.createElement('div');
      row.className = 'lyrics-chords-only';
      for (const value of entry.chords) {
        const chord = document.createElement('span');
        chord.textContent = fretlineLyricsRenderChord(value);
        row.append(chord);
      }
      fragment.append(row);
    } else if (entry.type === 'line') {
      fragment.append(fretlineLyricsLine(entry.segments));
    }
  }
  fretlineLyricsSheet.append(fragment);
}

function fretlineLyricsOpenEditor() {
  if (!selectedSong?.videoId) return;
  fretlineLyricsPause();
  fretlineLyricsEnsureEditor();
  fretlineLyricsEditorText.value = fretlineLyricsStore[selectedSong.videoId] || '';
  if (!fretlineLyricsEditor.open) fretlineLyricsEditor.showModal();
  requestAnimationFrame(() => fretlineLyricsEditorText.focus());
}

function fretlineLyricsCommitEditor() {
  clearTimeout(fretlineLyricsSaveTimer);
  if (!selectedSong?.videoId || !fretlineLyricsEditorText) return;
  fretlineLyricsStore = setSongLyrics(fretlineLyricsStore, selectedSong.videoId, fretlineLyricsEditorText.value);
  if (!saveLyricsStore(fretlineLyricsStore)) showToast('Lyrics could not be stored on this device.');
  fretlineLyricsRenderKey = '';
  fretlineLyricsRender(true);
}

function fretlineLyricsMaxScroll() {
  if (!fretlineLyricsViewport) return 0;
  return Math.max(0, fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight);
}

function fretlineLyricsBaseRate() {
  const maximum = fretlineLyricsMaxScroll();
  if (!maximum) return 0;
  const duration = currentPlayerDuration() || selectedSong?.duration || 240;
  return maximum / Math.max(60, duration - 8);
}

function fretlineLyricsFrameStep(timestamp) {
  if (!fretlineLyricsScrollActive || !fretlineLyricsViewport) return;
  if (!fretlineLyricsLastFrame) fretlineLyricsLastFrame = timestamp;
  const elapsed = Math.min(120, timestamp - fretlineLyricsLastFrame);
  fretlineLyricsLastFrame = timestamp;
  fretlineLyricsViewport.scrollTop += fretlineLyricsBaseRate() * fretlineLyricsScrollSpeed * (elapsed / 1000);
  if (fretlineLyricsViewport.scrollTop >= fretlineLyricsMaxScroll() - 1) {
    fretlineLyricsStopScroll();
    return;
  }
  fretlineLyricsFrame = requestAnimationFrame(fretlineLyricsFrameStep);
}

function fretlineLyricsStartScroll() {
  fretlineLyricsEnsureUi();
  if (fretlineLyricsViewport.scrollTop >= fretlineLyricsMaxScroll() - 1) fretlineLyricsViewport.scrollTop = 0;
  if (fretlineLyricsScrollActive) return;
  fretlineLyricsScrollActive = true;
  fretlineLyricsLastFrame = 0;
  cancelAnimationFrame(fretlineLyricsFrame);
  fretlineLyricsFrame = requestAnimationFrame(fretlineLyricsFrameStep);
  updatePlayButton();
}

function fretlineLyricsStopScroll() {
  fretlineLyricsScrollActive = false;
  fretlineLyricsLastFrame = 0;
  cancelAnimationFrame(fretlineLyricsFrame);
  fretlineLyricsFrame = 0;
  updatePlayButton();
}

function fretlineLyricsYoutubePlaying() {
  return Boolean(globalThis.YT && youtubeState() === globalThis.YT.PlayerState.PLAYING);
}

function fretlineLyricsPause() {
  fretlineLyricsFollowPlayback = false;
  fretlineLyricsStopScroll();
  try { youtubePlayer?.pauseVideo?.(); } catch (_) {}
  updatePlayButton();
}

updatePlayButton = function updateLyricsPlayButton() {
  const playing = fretlineLyricsScrollActive || fretlineLyricsYoutubePlaying();
  dom.playAlongToggle.innerHTML = playing
    ? fretlineLyricsIcon('M7 5h4v14H7V5Zm6 0h4v14h-4V5Z')
    : fretlineLyricsIcon('M8 5v14l11-7-11-7Z');
  dom.playAlongToggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  dom.playAlongToggle.title = playing ? 'Pause' : 'Play';
  dom.playAlongToggle.setAttribute('aria-pressed', String(playing));
};

togglePlayAlong = async function toggleLyricsPlayback() {
  if (!selectedSong) return;
  if (fretlineLyricsScrollActive || fretlineLyricsYoutubePlaying()) {
    fretlineLyricsPause();
    return;
  }
  fretlineLyricsFollowPlayback = true;
  fretlineLyricsStartScroll();
  try {
    if (!youtubePlayerReady) await ensureYouTubePlayer(selectedSong.videoId);
    youtubePlayer?.playVideo?.();
  } catch (_) {}
  updatePlayButton();
};

onYouTubeStateChange = function onLyricsYouTubeStateChange(event) {
  fretlineLyricsBaseOnYouTubeStateChange(event);
  if (event.data === globalThis.YT?.PlayerState?.PLAYING && fretlineLyricsFollowPlayback) fretlineLyricsStartScroll();
  if (event.data === globalThis.YT?.PlayerState?.PAUSED || event.data === globalThis.YT?.PlayerState?.ENDED) {
    fretlineLyricsFollowPlayback = false;
    fretlineLyricsStopScroll();
  }
  updatePlayButton();
};

ensureYouTubePlayer = async function ensureMinimalLyricsPlayer(videoId) {
  await loadYouTubeIframeApi();
  dom.youtubePlayerShell.hidden = false;
  if (!youtubePlayer) {
    youtubePlayer = new globalThis.YT.Player('youtubePlayer', {
      width: '100%',
      height: '100%',
      videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1, fs: 0, origin: location.origin },
      events: {
        onReady: onYouTubePlayerReady,
        onStateChange: onYouTubeStateChange,
        onError: (event) => { const message = youtubeErrorMessage(event.data); showToast(message, 3800); },
      },
    });
  }
  await waitForYouTubePlayerReady();
};

renderPlayAlongAtCurrentTime = function renderLyricsPlayAlong(force = false) {
  if (!selectedSong || dom.playAlongView.hidden) return;
  fretlineLyricsRender(force);
  updatePlayButton();
};

selectSong = async function selectLyricsSong(catalogId) {
  fretlineLyricsFollowPlayback = false;
  fretlineLyricsStopScroll();
  fretlineLyricsRenderKey = '';
  await fretlineLyricsBaseSelectSong(catalogId, false);
  fretlineLyricsEnsureUi();
  fretlineLyricsViewport.scrollTop = 0;
  fretlineLyricsRender(true);
  updatePlayButton();
};

backToLibrary = function backFromLyrics() {
  fretlineLyricsPause();
  fretlineLyricsRenderKey = '';
  fretlineLyricsBaseBackToLibrary();
};

initializeSongLibrary = function initializeLyricsLibrary() {
  fretlineLyricsEnsureUi();
  return Promise.resolve(fretlineLyricsBaseInitializeSongLibrary()).then(() => {
    fretlineLyricsRenderKey = '';
    fretlineLyricsRender();
  });
};

dom.libraryDialog.addEventListener('close', fretlineLyricsPause);
fretlineLyricsEnsureUi();
