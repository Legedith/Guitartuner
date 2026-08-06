const fretlineLyricsBaseSelectSong = selectSong;
const fretlineLyricsBaseBackToLibrary = backToLibrary;
const fretlineLyricsBaseTogglePlayAlong = togglePlayAlong;
const fretlineLyricsBaseYouTubeStateChange = onYouTubeStateChange;
const fretlineLyricsCache = new Map();
const FRETLINE_LYRICS_SPEED_KEY = 'fretline:lyrics-scroll-speed';
let fretlineLyricsRequestToken = 0;
let fretlineLyricsScrollFrame = 0;
let fretlineLyricsScrollPlaying = false;
let fretlineLyricsScrollLastTime = 0;
let fretlineLyricsScrollSpeed = loadFretlineLyricsSpeed();
let fretlineLyricsReader = null;
let fretlineLyricsViewport = null;
let fretlineLyricsContent = null;
let fretlineLyricsSpeedOutput = null;
let fretlineLyricsSlowerButton = null;
let fretlineLyricsFasterButton = null;

function loadFretlineLyricsSpeed() {
  try { return clampLyricsScrollSpeed(localStorage.getItem(FRETLINE_LYRICS_SPEED_KEY) || 0.5); }
  catch (_) { return 0.5; }
}

function saveFretlineLyricsSpeed() {
  try { localStorage.setItem(FRETLINE_LYRICS_SPEED_KEY, String(fretlineLyricsScrollSpeed)); } catch (_) {}
}

function fretlineLyricsIconButton(label, path) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lyrics-control-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return button;
}

function updateFretlineLyricsControls() {
  if (fretlineLyricsSpeedOutput) fretlineLyricsSpeedOutput.textContent = `${fretlineLyricsScrollSpeed.toFixed(1)}×`;
  if (fretlineLyricsSlowerButton) fretlineLyricsSlowerButton.disabled = fretlineLyricsScrollSpeed <= 0.1;
  if (fretlineLyricsFasterButton) fretlineLyricsFasterButton.disabled = fretlineLyricsScrollSpeed >= 1;
  if (dom.playAlongToggle) {
    dom.playAlongToggle.className = 'lyrics-play-button';
    dom.playAlongToggle.setAttribute('aria-label', fretlineLyricsScrollPlaying ? 'Pause' : 'Play');
    dom.playAlongToggle.title = fretlineLyricsScrollPlaying ? 'Pause' : 'Play';
    const label = dom.playAlongToggle.querySelector('span');
    if (label) { label.textContent = fretlineLyricsScrollPlaying ? 'Pause' : 'Play'; label.className = 'visually-hidden'; }
    const path = dom.playAlongToggle.querySelector('path');
    if (path) path.setAttribute('d', fretlineLyricsScrollPlaying ? 'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z' : 'M8 5v14l11-7-11-7Z');
  }
}

function ensureFretlineLyricsUi() {
  if (fretlineLyricsReader?.isConnected) return;
  if (!document.querySelector('link[data-fretline-lyrics]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './styles/lyrics.css';
    link.dataset.fretlineLyrics = 'true';
    document.head.append(link);
  }

  const progress = dom.playAlongSeek?.closest('.playback-progress');
  const playbackControls = dom.playAlongToggle?.closest('.playback-controls');
  const loopControls = dom.toggleLoopButton?.closest('.loop-controls');
  const oldCard = document.querySelector('#playAlongCard');
  const oldUpcoming = dom.upcomingChords;

  fretlineLyricsReader = document.createElement('section');
  fretlineLyricsReader.className = 'lyrics-reader';
  fretlineLyricsReader.setAttribute('aria-label', 'Lyrics and chords');

  fretlineLyricsViewport = document.createElement('div');
  fretlineLyricsViewport.className = 'lyrics-viewport';
  fretlineLyricsViewport.tabIndex = 0;
  fretlineLyricsContent = document.createElement('div');
  fretlineLyricsContent.className = 'lyrics-content';
  fretlineLyricsViewport.append(fretlineLyricsContent);

  const controls = document.createElement('div');
  controls.className = 'lyrics-controls';
  fretlineLyricsSlowerButton = fretlineLyricsIconButton('Slower', 'M6 12h12');
  fretlineLyricsFasterButton = fretlineLyricsIconButton('Faster', 'M12 5v14M5 12h14');
  fretlineLyricsSpeedOutput = document.createElement('output');
  fretlineLyricsSpeedOutput.className = 'lyrics-speed';
  fretlineLyricsSpeedOutput.setAttribute('aria-live', 'polite');

  if (dom.playAlongToggle) {
    dom.playAlongToggle.remove();
    controls.append(fretlineLyricsSlowerButton, dom.playAlongToggle, fretlineLyricsFasterButton, fretlineLyricsSpeedOutput);
  } else {
    controls.append(fretlineLyricsSlowerButton, fretlineLyricsFasterButton, fretlineLyricsSpeedOutput);
  }
  fretlineLyricsReader.append(fretlineLyricsViewport, controls);

  const insertionPoint = oldCard ?? oldUpcoming ?? dom.playAlongView.querySelector('.play-along-actions');
  if (insertionPoint) insertionPoint.before(fretlineLyricsReader);
  else dom.playAlongView.append(fretlineLyricsReader);

  progress?.remove();
  playbackControls?.remove();
  loopControls?.remove();
  oldCard?.remove();
  oldUpcoming?.remove();

  fretlineLyricsSlowerButton.addEventListener('click', () => changeFretlineLyricsSpeed(-0.1));
  fretlineLyricsFasterButton.addEventListener('click', () => changeFretlineLyricsSpeed(0.1));
  fretlineLyricsContent.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-chord]');
    if (!button) return;
    playFretlineLyricChord(button.dataset.chord);
  });
  updateFretlineLyricsControls();
}

function changeFretlineLyricsSpeed(delta) {
  fretlineLyricsScrollSpeed = clampLyricsScrollSpeed(fretlineLyricsScrollSpeed + delta);
  saveFretlineLyricsSpeed();
  updateFretlineLyricsControls();
}

function setFretlineLyricsScrollPlaying(playing) {
  fretlineLyricsScrollPlaying = Boolean(playing) && Boolean(fretlineLyricsViewport?.isConnected);
  cancelAnimationFrame(fretlineLyricsScrollFrame);
  fretlineLyricsScrollFrame = 0;
  fretlineLyricsScrollLastTime = 0;
  updateFretlineLyricsControls();
  if (fretlineLyricsScrollPlaying) {
    if (fretlineLyricsViewport.scrollTop >= fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight - 3) fretlineLyricsViewport.scrollTop = 0;
    fretlineLyricsScrollFrame = requestAnimationFrame(fretlineLyricsScrollStep);
  }
}

function fretlineLyricsScrollStep(now) {
  if (!fretlineLyricsScrollPlaying || !fretlineLyricsViewport) return;
  if (!fretlineLyricsScrollLastTime) fretlineLyricsScrollLastTime = now;
  const elapsed = Math.min(0.1, Math.max(0, (now - fretlineLyricsScrollLastTime) / 1000));
  fretlineLyricsScrollLastTime = now;
  const duration = currentPlayerDuration() || selectedSong?.duration || 0;
  const rate = lyricsScrollRate(fretlineLyricsViewport.scrollHeight, fretlineLyricsViewport.clientHeight, duration, fretlineLyricsScrollSpeed);
  fretlineLyricsViewport.scrollTop += rate * elapsed;
  const finished = fretlineLyricsViewport.scrollTop >= fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight - 1;
  if (finished) { setFretlineLyricsScrollPlaying(false); return; }
  fretlineLyricsScrollFrame = requestAnimationFrame(fretlineLyricsScrollStep);
}

function resetFretlineLyricsReader() {
  ensureFretlineLyricsUi();
  setFretlineLyricsScrollPlaying(false);
  fretlineLyricsViewport.scrollTop = 0;
  fretlineLyricsContent.replaceChildren();
  const loading = document.createElement('span');
  loading.className = 'lyrics-loading';
  loading.textContent = '•••';
  fretlineLyricsContent.append(loading);
}

function fretlineLyricsSearchTracks(track) {
  const output = [track];
  const chart = settings.songCharts?.[track.videoId];
  const provenance = chart?.provenance;
  if (provenance?.spotifyTitle) {
    output.push({
      title: provenance.spotifyTitle,
      artist: provenance.spotifyArtist || track.artist,
      album: provenance.spotifyAlbum || '',
      duration: track.duration,
    });
  }
  const strippedTitle = String(track.title ?? '').replace(/\s*[\[(](?:live|acoustic|remix|remastered|official|version|cover|slowed|sped up)[^\])]*[\])]\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (strippedTitle && strippedTitle !== track.title) output.push({ ...track, title: strippedTitle });
  const seen = new Set();
  return output.filter((item) => {
    const key = `${item.title}|${item.artist}`.toLocaleLowerCase();
    if (!item.title || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function fetchFretlineLyricsRecords(track) {
  const response = await fetch(lyricsSearchUrl(track), {
    mode: 'cors',
    cache: 'force-cache',
    headers: { 'Lrclib-Client': 'Fretline/1.7 (https://github.com/Legedith/Guitartuner)' },
  });
  if (!response.ok) throw new Error(`Lyrics request failed with ${response.status}.`);
  return response.json();
}

async function loadFretlineLyrics(track, token) {
  if (!track) return;
  const cached = fretlineLyricsCache.get(track.videoId);
  if (cached) { renderFretlineLyrics(cached, track, token); return; }

  let selected = null;
  for (const query of fretlineLyricsSearchTracks(track)) {
    try {
      const records = await fetchFretlineLyricsRecords(query);
      selected = selectLyricsRecord(records, query);
      if (selected) break;
    } catch (_) {}
  }
  if (token !== fretlineLyricsRequestToken || selectedSong?.videoId !== track.videoId) return;
  if (!selected) { renderFretlineLyricsUnavailable(); return; }
  fretlineLyricsCache.set(track.videoId, selected);
  renderFretlineLyrics(selected, track, token);
}

function renderFretlineLyricsUnavailable() {
  ensureFretlineLyricsUi();
  fretlineLyricsContent.replaceChildren();
  const message = document.createElement('p');
  message.className = 'lyrics-unavailable';
  message.textContent = 'Lyrics unavailable';
  fretlineLyricsContent.append(message);
}

function renderFretlineLyrics(record, track, token) {
  if (token !== fretlineLyricsRequestToken || selectedSong?.videoId !== track.videoId) return;
  ensureFretlineLyricsUi();
  const parsed = lyricsLinesFromRecord(record);
  const lines = placeChordsAboveLyrics(parsed.lines, displayedChartEvents(), currentPlayerDuration() || track.duration || record.duration || 0);
  fretlineLyricsContent.replaceChildren();
  if (!lines.length) { renderFretlineLyricsUnavailable(); return; }

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const row = document.createElement('article');
    row.className = 'lyrics-line';
    if (Number.isFinite(line.time)) row.dataset.time = String(line.time);
    if (line.chords.length) {
      const chordRow = document.createElement('div');
      chordRow.className = 'lyrics-chords';
      for (const chord of line.chords) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.chord = chord;
        button.textContent = chord;
        button.setAttribute('aria-label', `Play ${chord}`);
        chordRow.append(button);
      }
      row.append(chordRow);
    }
    const text = document.createElement('p');
    text.textContent = line.text;
    row.append(text);
    fragment.append(row);
  }
  fretlineLyricsContent.append(fragment);
  fretlineLyricsViewport.scrollTop = 0;
}

async function playFretlineLyricChord(symbol) {
  const parsed = parseChordSymbol(symbol);
  if (!parsed || parsed.rest || !currentTuning?.midi) return;
  const voicing = generateChordVoicings(currentTuning.midi, parsed.root, parsed.quality, {
    limit: 1,
    maxFret: 12,
    bassPitchClass: parsed.slashBass,
  })[0];
  if (voicing) await playChordVoicingSound(voicing, currentTuning.midi, settings.instrument);
}

selectSong = async function selectSongWithLyrics(catalogId, play = true) {
  resetFretlineLyricsReader();
  const request = fretlineLyricsBaseSelectSong(catalogId, play);
  const track = selectedSong;
  const token = ++fretlineLyricsRequestToken;
  if (track) loadFretlineLyrics(track, token);
  await request;
};

backToLibrary = function backFromLyrics() {
  fretlineLyricsRequestToken += 1;
  setFretlineLyricsScrollPlaying(false);
  fretlineLyricsBaseBackToLibrary();
};

togglePlayAlong = async function toggleLyricsAndSong() {
  if (!youtubePlayerReady) { showToast('Select a song first.'); return; }
  const currentlyPlaying = globalThis.YT && youtubeState() === globalThis.YT.PlayerState.PLAYING;
  await fretlineLyricsBaseTogglePlayAlong();
  setFretlineLyricsScrollPlaying(!currentlyPlaying);
};

onYouTubeStateChange = function syncLyricsScrollToPlayback(event) {
  fretlineLyricsBaseYouTubeStateChange(event);
  if (!globalThis.YT) return;
  if (event.data === globalThis.YT.PlayerState.PLAYING) setFretlineLyricsScrollPlaying(true);
  if (event.data === globalThis.YT.PlayerState.PAUSED || event.data === globalThis.YT.PlayerState.ENDED || event.data === globalThis.YT.PlayerState.CUED) setFretlineLyricsScrollPlaying(false);
};

renderPlayAlongAtCurrentTime = function renderLyricsPlayAlong() {};

ensureFretlineLyricsUi();
