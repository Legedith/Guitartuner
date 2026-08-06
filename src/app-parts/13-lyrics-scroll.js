const fretlineLyricsBaseSelectSong = selectSong;
const fretlineLyricsBaseBackToLibrary = backToLibrary;
const fretlineLyricsBaseTogglePlayAlong = togglePlayAlong;
const fretlineLyricsBaseYouTubeStateChange = onYouTubeStateChange;
const fretlineLyricsCache = new Map();
const FRETLINE_LYRICS_SPEED_KEY = 'fretline:lyrics-scroll-speed';
const FRETLINE_LYRICS_INSTRUMENT_KEY = 'fretline:lyrics-instrument';
let fretlineLyricsRequestToken = 0;
let fretlineLyricsScrollFrame = 0;
let fretlineLyricsScrollPlaying = false;
let fretlineLyricsScrollLastTime = 0;
let fretlineLyricsScrollSpeed = loadFretlineLyricsSpeed();
let fretlineLyricsInstrument = loadFretlineLyricsInstrument();
let fretlineLyricsReader = null;
let fretlineLyricsGuide = null;
let fretlineLyricsViewport = null;
let fretlineLyricsContent = null;
let fretlineLyricsSpeedOutput = null;
let fretlineLyricsSlowerButton = null;
let fretlineLyricsFasterButton = null;
let fretlineLyricsInstrumentButtons = [];
let fretlineLyricsKeyOutput = null;
let fretlineLyricsCapoOutput = null;
let fretlineLyricsPatternOutput = null;
let fretlineLyricsCurrentRecord = null;
let fretlineLyricsCurrentTrack = null;
let fretlineLyricsCurrentToken = 0;
let fretlineLyricsLineElements = [];
let fretlineLyricsCurrentSynced = false;

function loadFretlineLyricsSpeed() {
  try { return clampLyricsScrollSpeed(localStorage.getItem(FRETLINE_LYRICS_SPEED_KEY) || .5); }
  catch (_) { return .5; }
}

function saveFretlineLyricsSpeed() {
  try { localStorage.setItem(FRETLINE_LYRICS_SPEED_KEY, String(fretlineLyricsScrollSpeed)); } catch (_) {}
}

function loadFretlineLyricsInstrument() {
  try {
    const stored = localStorage.getItem(FRETLINE_LYRICS_INSTRUMENT_KEY);
    if (stored === 'guitar' || stored === 'ukulele') return stored;
  } catch (_) {}
  return settings.instrument === 'ukulele' ? 'ukulele' : 'guitar';
}

function saveFretlineLyricsInstrument() {
  try { localStorage.setItem(FRETLINE_LYRICS_INSTRUMENT_KEY, fretlineLyricsInstrument); } catch (_) {}
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
  if (fretlineLyricsSlowerButton) fretlineLyricsSlowerButton.disabled = fretlineLyricsScrollSpeed <= .1;
  if (fretlineLyricsFasterButton) fretlineLyricsFasterButton.disabled = fretlineLyricsScrollSpeed >= 1;
  if (dom.playAlongToggle) {
    dom.playAlongToggle.className = 'lyrics-play-button';
    dom.playAlongToggle.setAttribute('aria-label', fretlineLyricsScrollPlaying ? 'Pause' : 'Play');
    dom.playAlongToggle.title = fretlineLyricsScrollPlaying ? 'Pause' : 'Play';
    const label = dom.playAlongToggle.querySelector('span');
    if (label) { label.textContent = fretlineLyricsScrollPlaying ? 'Pause' : 'Play'; label.className = 'visually-hidden'; }
    const path = dom.playAlongToggle.querySelector('path');
    if (path) path.setAttribute('d', fretlineLyricsScrollPlaying ? 'M7 5h4v14H7V5Zm6 0h4v14H7V5Z' : 'M8 5v14l11-7-11-7Z');
  }
}

function guidanceForTrack(track) {
  if (!track) return null;
  const chart = settings.songCharts?.[track.videoId] ?? {};
  const duration = currentPlayerDuration() || track.duration || 0;
  return buildSongGuidance({
    events: displayedChartEvents(),
    chart,
    instrument: fretlineLyricsInstrument,
    duration,
    accidentalMode: settings.accidentalMode,
  });
}

function updateFretlineLyricsGuide(guidance = guidanceForTrack(selectedSong)) {
  if (!fretlineLyricsGuide) return;
  fretlineLyricsInstrumentButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.instrument === fretlineLyricsInstrument)));
  const hasGuidance = Boolean(guidance?.events?.length);
  fretlineLyricsGuide.hidden = !hasGuidance;
  if (!hasGuidance) return;
  fretlineLyricsKeyOutput.textContent = `Key ${guidance.key.name}`;
  fretlineLyricsKeyOutput.title = `Estimated key ${guidance.key.name}`;
  fretlineLyricsCapoOutput.textContent = guidance.capo.capo
    ? `Capo ${guidance.capo.capo} · ${guidance.capo.shapeName}`
    : 'Open';
  fretlineLyricsCapoOutput.title = guidance.capo.capo
    ? `Capo ${guidance.capo.capo}; play ${guidance.capo.shapeName} shapes`
    : 'No capo';
  fretlineLyricsPatternOutput.textContent = guidance.pattern;
  fretlineLyricsPatternOutput.title = 'Suggested strumming pattern';
  fretlineLyricsPatternOutput.setAttribute('aria-label', `Suggested strumming pattern ${guidance.pattern}`);
}

function setFretlineLyricsInstrument(instrument) {
  if (!['guitar', 'ukulele'].includes(instrument) || instrument === fretlineLyricsInstrument) return;
  fretlineLyricsInstrument = instrument;
  saveFretlineLyricsInstrument();
  updateFretlineLyricsGuide();
  if (fretlineLyricsCurrentRecord && fretlineLyricsCurrentTrack) {
    renderFretlineLyrics(fretlineLyricsCurrentRecord, fretlineLyricsCurrentTrack, fretlineLyricsCurrentToken);
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

  fretlineLyricsGuide = document.createElement('div');
  fretlineLyricsGuide.className = 'lyrics-guide';
  const instrumentSwitch = document.createElement('div');
  instrumentSwitch.className = 'lyrics-instrument-switch';
  instrumentSwitch.setAttribute('role', 'group');
  instrumentSwitch.setAttribute('aria-label', 'Chord shapes for instrument');
  fretlineLyricsInstrumentButtons = ['guitar', 'ukulele'].map((instrument) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.instrument = instrument;
    button.textContent = instrument === 'guitar' ? 'Guitar' : 'Ukulele';
    button.addEventListener('click', () => setFretlineLyricsInstrument(instrument));
    instrumentSwitch.append(button);
    return button;
  });
  fretlineLyricsKeyOutput = document.createElement('span');
  fretlineLyricsKeyOutput.className = 'lyrics-guide-chip';
  fretlineLyricsCapoOutput = document.createElement('span');
  fretlineLyricsCapoOutput.className = 'lyrics-guide-chip';
  fretlineLyricsPatternOutput = document.createElement('span');
  fretlineLyricsPatternOutput.className = 'lyrics-pattern';
  fretlineLyricsGuide.append(instrumentSwitch, fretlineLyricsKeyOutput, fretlineLyricsCapoOutput, fretlineLyricsPatternOutput);

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
  fretlineLyricsReader.append(fretlineLyricsGuide, fretlineLyricsViewport, controls);

  const insertionPoint = oldCard ?? oldUpcoming ?? dom.playAlongView.querySelector('.play-along-actions');
  if (insertionPoint) insertionPoint.before(fretlineLyricsReader);
  else dom.playAlongView.append(fretlineLyricsReader);

  progress?.remove();
  playbackControls?.remove();
  loopControls?.remove();
  oldCard?.remove();
  oldUpcoming?.remove();

  fretlineLyricsSlowerButton.addEventListener('click', () => changeFretlineLyricsSpeed(-.1));
  fretlineLyricsFasterButton.addEventListener('click', () => changeFretlineLyricsSpeed(.1));
  fretlineLyricsContent.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sound-chord]');
    if (!button) return;
    playFretlineLyricChord(button.dataset.soundChord);
  });
  updateFretlineLyricsControls();
  updateFretlineLyricsGuide();
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
  const elapsed = Math.min(.1, Math.max(0, (now - fretlineLyricsScrollLastTime) / 1000));
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
  fretlineLyricsCurrentRecord = null;
  fretlineLyricsCurrentTrack = null;
  fretlineLyricsLineElements = [];
  fretlineLyricsCurrentSynced = false;
  fretlineLyricsViewport.scrollTop = 0;
  fretlineLyricsContent.replaceChildren();
  const loading = document.createElement('span');
  loading.className = 'lyrics-loading';
  loading.textContent = '•••';
  fretlineLyricsContent.append(loading);
  updateFretlineLyricsGuide();
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
    seen.add(key);
    return true;
  });
}

async function fetchFretlineLyricsRecords(track) {
  const response = await fetch(lyricsSearchUrl(track), {
    mode: 'cors',
    cache: 'force-cache',
    headers: { 'Lrclib-Client': 'Fretline/1.8 (https://github.com/Legedith/Guitartuner)' },
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
  if (!selected) { renderFretlineLyricsUnavailable(track); return; }
  fretlineLyricsCache.set(track.videoId, selected);
  renderFretlineLyrics(selected, track, token);
}

function renderFretlineLyricsUnavailable(track = selectedSong) {
  ensureFretlineLyricsUi();
  fretlineLyricsCurrentTrack = track;
  fretlineLyricsContent.replaceChildren();
  const message = document.createElement('p');
  message.className = 'lyrics-unavailable';
  message.textContent = 'Lyrics unavailable';
  fretlineLyricsContent.append(message);
  updateFretlineLyricsGuide(guidanceForTrack(track));
}

function renderFretlineLyrics(record, track, token) {
  if (token !== fretlineLyricsRequestToken || selectedSong?.videoId !== track.videoId) return;
  ensureFretlineLyricsUi();
  fretlineLyricsCurrentRecord = record;
  fretlineLyricsCurrentTrack = track;
  fretlineLyricsCurrentToken = token;
  const parsed = lyricsLinesFromRecord(record);
  const guidance = guidanceForTrack(track);
  const duration = currentPlayerDuration() || track.duration || record.duration || 0;
  const lines = placeChordsAboveWords(parsed.lines, guidance?.events ?? displayedChartEvents(), duration);
  fretlineLyricsCurrentSynced = parsed.synced;
  fretlineLyricsContent.dataset.synced = String(parsed.synced);
  fretlineLyricsContent.replaceChildren();
  fretlineLyricsLineElements = [];
  updateFretlineLyricsGuide(guidance);
  if (!lines.length) { renderFretlineLyricsUnavailable(track); return; }

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const row = document.createElement('article');
    row.className = 'lyrics-line';
    if (Number.isFinite(line.time)) row.dataset.time = String(line.time);
    if (Number.isFinite(line.endTime)) row.dataset.endTime = String(line.endTime);

    const text = document.createElement('p');
    text.className = 'lyrics-line-text';
    for (const word of line.words) {
      const wordNode = document.createElement('span');
      wordNode.className = 'lyrics-word';
      const chordSlot = document.createElement('span');
      chordSlot.className = 'lyrics-word-chords';
      for (const placement of word.chords) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.chord = placement.chord;
        button.dataset.soundChord = placement.soundChord;
        button.textContent = placement.chord;
        button.setAttribute('aria-label', `Play ${placement.soundChord}`);
        chordSlot.append(button);
      }
      const wordText = document.createElement('span');
      wordText.className = 'lyrics-word-text';
      wordText.textContent = word.text;
      wordNode.append(chordSlot, wordText);
      text.append(wordNode);
    }
    row.append(text);
    fragment.append(row);
    fretlineLyricsLineElements.push({ node: row, start: line.time, end: line.endTime });
  }
  fretlineLyricsContent.append(fragment);
  fretlineLyricsViewport.scrollTop = 0;
  updateFretlineLyricsActiveLine();
}

function updateFretlineLyricsActiveLine() {
  if (!fretlineLyricsCurrentSynced || !fretlineLyricsLineElements.length) return;
  const time = currentPlayerTime();
  let active = null;
  for (const item of fretlineLyricsLineElements) {
    if (!Number.isFinite(item.start)) continue;
    if (item.start <= time && (!Number.isFinite(item.end) || time < item.end)) active = item;
    if (item.start > time) break;
  }
  fretlineLyricsLineElements.forEach((item) => {
    if (item === active) item.node.setAttribute('aria-current', 'true');
    else item.node.removeAttribute('aria-current');
  });
}

async function playFretlineLyricChord(symbol) {
  const parsed = parseChordSymbol(symbol);
  const tuning = getTuningById(fretlineLyricsInstrument === 'ukulele' ? 'ukulele-standard' : 'guitar-standard');
  if (!parsed || parsed.rest || !tuning?.midi) return;
  const voicing = generateChordVoicings(tuning.midi, parsed.root, parsed.quality, {
    limit: 1,
    maxFret: 12,
    bassPitchClass: parsed.slashBass,
  })[0];
  if (voicing) await playChordVoicingSound(voicing, tuning.midi, fretlineLyricsInstrument);
}

selectSong = async function selectSongWithLyrics(catalogId, play = true) {
  resetFretlineLyricsReader();
  const request = fretlineLyricsBaseSelectSong(catalogId, play);
  const track = selectedSong;
  const token = ++fretlineLyricsRequestToken;
  fretlineLyricsCurrentToken = token;
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

renderPlayAlongAtCurrentTime = function renderLyricsPlayAlong() {
  updateFretlineLyricsActiveLine();
};

ensureFretlineLyricsUi();
