const SONG_BATCH_SIZE = 100;
let youtubeApiPromise = null;
let youtubePlayer = null;
let youtubePlayerReady = false;
let selectedSong = null;
let editingSongVideoId = null;
let playAlongTimer = 0;
let playAlongTranspose = 0;
let playAlongCurrentVoicing = null;
let activePlayAlongKey = '';
let loopStart = null;
let loopEnd = null;
let loopEnabled = false;
let seekDragging = false;
let bundledPlaylistCatalog = null;
let filteredSongTracks = [];
let renderedSongCount = 0;
let songLoadMoreButton = null;
let songListObserver = null;

function youtubeState() { try { return youtubePlayer?.getPlayerState?.() ?? -1; } catch (_) { return -1; } }
function currentPlayerTime() { try { return Math.max(0, youtubePlayer?.getCurrentTime?.() || 0); } catch (_) { return 0; } }
function currentPlayerDuration() { try { return Math.max(0, youtubePlayer?.getDuration?.() || 0); } catch (_) { return 0; } }
function videoUrlForSong(song = selectedSong) { return song?.videoId ? youtubeVideoUrl(song.videoId) : '#'; }

function loadYouTubeIframeApi() {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = globalThis.onYouTubeIframeAPIReady;
    globalThis.onYouTubeIframeAPIReady = () => { try { previousReady?.(); } catch (_) {} resolve(globalThis.YT); };
    const existing = document.querySelector('script[data-fretline-youtube-api]');
    if (existing) { existing.addEventListener('error', () => reject(new Error('YouTube player could not be loaded.')), { once: true }); return; }
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.dataset.fretlineYoutubeApi = 'true'; script.onerror = () => reject(new Error('YouTube player could not be loaded.')); document.head.append(script);
  }).catch((error) => { youtubeApiPromise = null; throw error; });
  return youtubeApiPromise;
}

function waitForYouTubePlayerReady(timeout = 12000) {
  if (youtubePlayerReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      if (youtubePlayerReady) { resolve(); return; }
      if (performance.now() - started >= timeout) { reject(new Error('YouTube player took too long to respond.')); return; }
      setTimeout(poll, 100);
    };
    poll();
  });
}

function youtubeErrorMessage(code) {
  if (code === 2) return 'YouTube rejected this video link.';
  if (code === 5) return 'This song cannot play in the HTML5 player.';
  if (code === 100) return 'This song is private, removed, or unavailable.';
  if (code === 101 || code === 150) return 'The owner has disabled embedded playback for this song.';
  return 'YouTube could not play this item.';
}

function updatePlayButton() {
  const playing = globalThis.YT && youtubeState() === globalThis.YT.PlayerState.PLAYING;
  const label = dom.playAlongToggle.querySelector('span'); if (label) label.textContent = playing ? 'Pause' : 'Play';
  const path = dom.playAlongToggle.querySelector('path'); if (path) path.setAttribute('d', playing ? 'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z' : 'M8 5v14l11-7-11-7Z');
}

function captureCurrentMetadata() {
  if (!youtubePlayerReady || !youtubePlayer || !selectedSong) return null;
  let data = {};
  try { data = youtubePlayer.getVideoData?.() ?? {}; } catch (_) { data = {}; }
  const videoId = extractYouTubeVideoId(data.video_id);
  if (videoId && videoId !== selectedSong.videoId) return null;
  const trackIndex = settings.playlistTracks.findIndex((track) => track.catalogId === selectedSong.catalogId);
  if (trackIndex < 0) return null;
  const track = settings.playlistTracks[trackIndex];
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const artist = typeof data.author === 'string' ? data.author.replace(/\s+-\s+Topic$/i, '').trim() : '';
  const duration = currentPlayerDuration();
  let changed = false;
  if (title && (!track.title || /^Track \d+$/.test(track.title))) { track.title = title.slice(0, 200); changed = true; }
  if (artist && !track.artist) { track.artist = artist.slice(0, 160); changed = true; }
  if (duration > 0 && Math.abs(duration - track.duration) > .5) { track.duration = duration; changed = true; }
  if (changed) { saveSettings(); renderLibrarySummary(); }
  selectedSong = track;
  dom.playAlongTitle.textContent = trackDisplayTitle(track); dom.playAlongArtist.textContent = trackDisplayArtist(track); dom.playAlongDuration.textContent = formatTime(duration || track.duration);
  return track;
}

function onYouTubePlayerReady() {
  youtubePlayerReady = true; updatePlayButton(); startPlayAlongTicker();
}

function onYouTubeStateChange() {
  updatePlayButton(); setTimeout(captureCurrentMetadata, 160);
}

async function ensureYouTubePlayer(videoId) {
  await loadYouTubeIframeApi(); dom.youtubePlayerShell.hidden = false;
  if (!youtubePlayer) {
    youtubePlayer = new globalThis.YT.Player('youtubePlayer', {
      width: '100%', height: '100%', videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: onYouTubePlayerReady,
        onStateChange: onYouTubeStateChange,
        onError: (event) => { const message = youtubeErrorMessage(event.data); dom.libraryStatus.textContent = message; showToast(message, 3800); },
      },
    });
  }
  await waitForYouTubePlayerReady();
}

function catalogStatusMessage() {
  const count = settings.playlistTracks.length;
  if (!count) return 'The bundled playlist catalog is not available.';
  const formattedCount = count.toLocaleString();
  const date = bundledPlaylistCatalog?.generatedAt ? new Date(bundledPlaylistCatalog.generatedAt) : null;
  const dateText = date && !Number.isNaN(date.valueOf()) ? ` · indexed ${date.toLocaleDateString()}` : '';
  const skipped = bundledPlaylistCatalog?.skippedEntries ? ` · ${bundledPlaylistCatalog.skippedEntries} unavailable entries skipped` : '';
  return `${formattedCount} playlist entries are included with Fretline${dateText}${skipped}. Select a song to connect YouTube playback.`;
}

function renderLibrarySummary() {
  const summary = librarySummary(settings.playlistTracks, settings.songCharts);
  dom.librarySummary.hidden = summary.trackCount === 0; dom.librarySummary.replaceChildren();
  if (!summary.trackCount) return;
  const stats = [
    [summary.trackCount.toLocaleString(), 'indexed playlist entries'],
    [summary.charted.toLocaleString(), 'with chord maps'],
    [summary.totalDuration ? formatTime(summary.totalDuration, true) : '—', 'total play time'],
    [summary.topArtists[0]?.name || '—', summary.topArtists[0] ? `${summary.topArtists[0].count} entries · top artist` : 'artist mix'],
  ];
  for (const [value, label] of stats) { const item = document.createElement('div'); item.className = 'summary-stat'; const strong = document.createElement('strong'); strong.textContent = value; const span = document.createElement('span'); span.textContent = label; item.append(strong, span); dom.librarySummary.append(item); }
}

function trackDisplayTitle(track) { return track.title || settings.songCharts[track.videoId]?.title || `Track ${track.index + 1}`; }
function trackDisplayArtist(track) { return track.artist || settings.songCharts[track.videoId]?.artist || 'YouTube Music'; }

function createSongRow(track) {
  const chart = settings.songCharts[track.videoId]; const button = document.createElement('button'); button.type = 'button'; button.className = 'song-row'; button.dataset.catalogId = track.catalogId;
  const thumbnail = document.createElement('span'); thumbnail.className = 'song-thumbnail'; const image = document.createElement('img'); image.src = track.thumbnail; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; thumbnail.append(image); if (track.duration) { const duration = document.createElement('span'); duration.textContent = formatTime(track.duration); thumbnail.append(duration); }
  const copy = document.createElement('span'); copy.className = 'song-copy'; const title = document.createElement('strong'); title.textContent = trackDisplayTitle(track); const artist = document.createElement('span'); artist.textContent = trackDisplayArtist(track); copy.append(title, artist);
  const status = document.createElement('span'); status.className = 'song-status'; const index = document.createElement('span'); index.className = 'song-index'; index.textContent = `#${track.index + 1}`; status.append(index); if (chart?.events?.length) { const badge = document.createElement('span'); badge.className = 'charted-badge'; badge.textContent = `${chart.events.length} changes`; status.append(badge); }
  button.append(thumbnail, copy, status); return button;
}

function disconnectSongListObserver() {
  songListObserver?.disconnect(); songListObserver = null; songLoadMoreButton = null;
}

function appendSongBatch() {
  songLoadMoreButton?.remove(); songLoadMoreButton = null;
  const end = Math.min(filteredSongTracks.length, renderedSongCount + SONG_BATCH_SIZE);
  const fragment = document.createDocumentFragment();
  for (let index = renderedSongCount; index < end; index += 1) fragment.append(createSongRow(filteredSongTracks[index]));
  dom.songList.append(fragment); renderedSongCount = end;
  if (renderedSongCount >= filteredSongTracks.length) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'small-action-button full-width'; button.textContent = `Showing ${renderedSongCount.toLocaleString()} of ${filteredSongTracks.length.toLocaleString()} · continue scrolling`;
  button.addEventListener('click', appendSongBatch); dom.songList.append(button); songLoadMoreButton = button;
  if ('IntersectionObserver' in window) {
    songListObserver?.disconnect();
    songListObserver = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) appendSongBatch(); }, { root: dom.libraryDialog, rootMargin: '300px 0px' });
    songListObserver.observe(button);
  }
}

function renderSongList() {
  disconnectSongListObserver();
  const query = dom.songSearch.value.trim().toLowerCase();
  filteredSongTracks = settings.playlistTracks.filter((track) => `${trackDisplayTitle(track)} ${trackDisplayArtist(track)} ${track.album || ''}`.toLowerCase().includes(query));
  renderedSongCount = 0; dom.songList.replaceChildren(); dom.libraryEmpty.hidden = filteredSongTracks.length > 0;
  if (!settings.playlistTracks.length) { dom.libraryEmpty.hidden = false; dom.libraryEmpty.querySelector('strong').textContent = 'Playlist catalog unavailable'; return; }
  if (!filteredSongTracks.length) { dom.libraryEmpty.hidden = false; dom.libraryEmpty.querySelector('strong').textContent = 'No matching songs'; return; }
  appendSongBatch();
}

function openSongLibrary() {
  dom.playlistForm.hidden = true; dom.indexPlaylistButton.hidden = true; dom.libraryListView.hidden = false; dom.playAlongView.hidden = true; dom.youtubePlayerShell.hidden = true;
  renderLibrarySummary(); renderSongList(); dom.libraryStatus.textContent = catalogStatusMessage(); dom.libraryDialog.showModal();
}

function songByCatalogId(catalogId) { return settings.playlistTracks.find((track) => track.catalogId === catalogId) ?? null; }

async function selectSong(catalogId, play = true) {
  const track = songByCatalogId(catalogId); if (!track) return;
  selectedSong = track; playAlongTranspose = 0; activePlayAlongKey = ''; loopStart = null; loopEnd = null; loopEnabled = false; updateLoopControls(); updateTransposeControl();
  dom.libraryListView.hidden = true; dom.playAlongView.hidden = false; dom.youtubePlayerShell.hidden = false; dom.playAlongTitle.textContent = trackDisplayTitle(track); dom.playAlongArtist.textContent = trackDisplayArtist(track); dom.openYouTubeButton.href = youtubeVideoUrl(track.videoId); dom.playAlongDuration.textContent = formatTime(track.duration); dom.playAlongSeek.value = '0';
  renderPlayAlongAtCurrentTime(true); startPlayAlongTicker(); dom.libraryStatus.textContent = 'Connecting YouTube playback…';
  try {
    await ensureYouTubePlayer(track.videoId);
    if (play) youtubePlayer.loadVideoById({ videoId: track.videoId, startSeconds: 0 }); else youtubePlayer.cueVideoById({ videoId: track.videoId, startSeconds: 0 });
    dom.libraryStatus.textContent = `${trackDisplayTitle(track)} · playback supplied by YouTube.`;
  } catch (error) { dom.libraryStatus.textContent = error.message; showToast(error.message, 3600); }
}

function displayedChartEvents() {
  const chart = selectedSong ? settings.songCharts[selectedSong.videoId] : null;
  return chart?.events?.length ? transposeChordEvents(chart.events, playAlongTranspose, chordAccidentalMode()) : [];
}

function renderUpcomingChords(events, activeIndex) {
  dom.upcomingChords.replaceChildren();
  const start = Math.max(0, activeIndex); const end = Math.min(events.length, start + 7);
  for (let index = start; index < end; index += 1) {
    const event = events[index]; const button = document.createElement('button'); button.type = 'button'; button.className = 'upcoming-chord'; button.dataset.time = String(event.time); button.setAttribute('aria-current', String(index === activeIndex));
    const chord = document.createElement('strong'); chord.textContent = event.chord; const timing = document.createElement('span'); timing.textContent = index === activeIndex ? 'Now' : formatTime(event.time); button.append(chord, timing); dom.upcomingChords.append(button);
  }
}

function renderPlayAlongAtCurrentTime(force = false) {
  if (!selectedSong || dom.playAlongView.hidden) return;
  const time = currentPlayerTime(); const duration = currentPlayerDuration() || selectedSong.duration || 0;
  if (!seekDragging) dom.playAlongSeek.value = duration > 0 ? String(Math.round((time / duration) * 1000)) : '0';
  dom.playAlongTime.textContent = formatTime(time); dom.playAlongDuration.textContent = formatTime(duration); dom.markChordTime.textContent = formatTime(time);
  const events = displayedChartEvents(); const { event, index } = getActiveChordEvent(events, time); const next = events[index + 1] ?? null;
  dom.noChartMessage.hidden = events.length > 0; dom.upcomingChords.hidden = events.length === 0;
  if (!event) {
    dom.currentSection.textContent = events.length ? 'Get ready' : 'Current chord'; dom.currentChordName.textContent = '—'; dom.nextChordName.textContent = events[0] ? `${events[0].chord} at ${formatTime(events[0].time)}` : 'Add a chord map to start'; dom.playAlongDiagram.replaceChildren(); playAlongCurrentVoicing = null; renderUpcomingChords(events, 0); activePlayAlongKey = ''; return;
  }
  const key = `${selectedSong.videoId}:${index}:${playAlongTranspose}:${settings.instrument}:${currentTuning.id}`;
  dom.currentSection.textContent = event.section || 'Current chord'; dom.currentChordName.textContent = event.chord;
  dom.nextChordName.textContent = next ? `Next ${next.chord} in ${formatTime(Math.max(0, next.time - time))}` : 'Final chord';
  if (force || key !== activePlayAlongKey) { playAlongCurrentVoicing = renderChordDiagramForSymbol(dom.playAlongDiagram, event.chord, { compact: true, limit: 4, tuningMidi: currentTuning.midi }); activePlayAlongKey = key; }
  renderUpcomingChords(events, index);
}

function startPlayAlongTicker() {
  if (playAlongTimer) return;
  playAlongTimer = setInterval(() => {
    if (youtubePlayerReady) { captureCurrentMetadata(); updatePlayButton(); }
    const time = currentPlayerTime();
    if (loopEnabled && Number.isFinite(loopStart) && Number.isFinite(loopEnd) && loopEnd > loopStart && time >= loopEnd) { try { youtubePlayer.seekTo(loopStart, true); } catch (_) {} }
    renderPlayAlongAtCurrentTime();
  }, 250);
}

function stopPlayAlongTicker() { clearInterval(playAlongTimer); playAlongTimer = 0; }

function updateTransposeControl() {
  dom.transposeValue.textContent = playAlongTranspose === 0 ? 'Original key' : `${playAlongTranspose > 0 ? '+' : '−'}${Math.abs(playAlongTranspose)} semitone${Math.abs(playAlongTranspose) === 1 ? '' : 's'}`;
}

function transposePlayAlong(delta) { playAlongTranspose = clamp(playAlongTranspose + delta, -12, 12); activePlayAlongKey = ''; updateTransposeControl(); renderPlayAlongAtCurrentTime(true); }

function updateLoopControls() {
  dom.loopRange.textContent = `A ${Number.isFinite(loopStart) ? formatTime(loopStart) : '—'} · B ${Number.isFinite(loopEnd) ? formatTime(loopEnd) : '—'}`;
  dom.toggleLoopButton.setAttribute('aria-pressed', String(loopEnabled)); dom.toggleLoopButton.textContent = loopEnabled ? 'Loop on' : 'Loop off';
}

async function togglePlayAlong() {
  if (!youtubePlayerReady) { showToast('Select a song first.'); return; }
  try { if (globalThis.YT && youtubeState() === globalThis.YT.PlayerState.PLAYING) youtubePlayer.pauseVideo(); else youtubePlayer.playVideo(); } catch (_) {}
  updatePlayButton();
}

function seekPlayAlong() {
  const duration = currentPlayerDuration() || selectedSong?.duration || 0; if (!duration || !youtubePlayerReady) return;
  const destination = (Number(dom.playAlongSeek.value) / 1000) * duration; try { youtubePlayer.seekTo(destination, true); } catch (_) {} renderPlayAlongAtCurrentTime(true);
}

function openSongChartEditor() {
  if (!selectedSong) return; editingSongVideoId = selectedSong.videoId; const chart = settings.songCharts[selectedSong.videoId];
  dom.songChartTitle.value = chart?.title || selectedSong.title || `Track ${selectedSong.index + 1}`; dom.songChartArtist.value = chart?.artist || selectedSong.artist || ''; dom.songChartBpm.value = String(chart?.bpm || 90); dom.beatsPerChord.value = String(chart?.beatsPerChord || 4); dom.songChartSource.value = chart?.sourceUrl || ''; dom.songChartText.value = chart?.raw || ''; dom.chartChordSymbol.value = 'C'; dom.markChordTime.textContent = formatTime(currentPlayerTime()); dom.songChartDialog.showModal();
}

function markChordAtCurrentTime() {
  const symbol = dom.chartChordSymbol.value.trim(); if (!parseChordSymbol(symbol)) { showToast('Enter a supported chord such as C, Am, G7, Cadd9, or Fmaj7.'); return; }
  const time = currentPlayerTime(); const line = `${formatTime(time, time >= 3600)} ${symbol}`; const existing = dom.songChartText.value.trim(); dom.songChartText.value = existing ? `${existing}\n${line}` : line; dom.songChartText.focus(); dom.songChartText.setSelectionRange(dom.songChartText.value.length, dom.songChartText.value.length);
}

function saveSongChart(event) {
  event.preventDefault(); if (!editingSongVideoId) return;
  const bpm = clamp(Number(dom.songChartBpm.value) || 90, 20, 300); const beatsPerChord = clamp(Number(dom.beatsPerChord.value) || 4, .25, 32); const raw = dom.songChartText.value.trim(); const events = parseChordChart(raw, { bpm, beatsPerChord }); const sourceInput = dom.songChartSource.value.trim(); const sourceUrl = sanitizeExternalUrl(sourceInput);
  if (raw && !events.length) { showToast('No supported chord changes were found. Check the examples below the editor.'); return; }
  if (sourceInput && !sourceUrl) { showToast('The chord source must be an http or https link.'); return; }
  settings.songCharts[editingSongVideoId] = { videoId: editingSongVideoId, title: dom.songChartTitle.value.trim(), artist: dom.songChartArtist.value.trim(), bpm, beatsPerChord, raw, sourceUrl, events, updatedAt: Date.now() };
  const tracks = settings.playlistTracks.filter((track) => track.videoId === editingSongVideoId); for (const track of tracks) { if (settings.songCharts[editingSongVideoId].title) track.title = settings.songCharts[editingSongVideoId].title; if (settings.songCharts[editingSongVideoId].artist) track.artist = settings.songCharts[editingSongVideoId].artist; }
  saveSettings(); dom.songChartDialog.close(); activePlayAlongKey = ''; renderLibrarySummary(); renderSongList(); renderPlayAlongAtCurrentTime(true); showToast(events.length ? `Saved ${events.length} chord changes` : 'Chord map cleared');
}

async function findSongChords() {
  if (!selectedSong) return; const chart = settings.songCharts[selectedSong.videoId]; const sourceUrl = sanitizeExternalUrl(chart?.sourceUrl);
  if (sourceUrl) { window.open(sourceUrl, '_blank', 'noopener'); return; }
  const chordifyWindow = window.open('https://chordify.net/', '_blank', 'noopener'); const url = videoUrlForSong();
  try { await navigator.clipboard.writeText(url); showToast('YouTube link copied. Paste it into a licensed chord service, then save its source or import your chart.', 5200); }
  catch (_) { showToast('A chord service opened. Paste this song’s YouTube link there.', 3600); }
  if (!chordifyWindow) showToast('Your browser blocked the new tab. Open a licensed chord service and paste this song’s YouTube link.', 4400);
}

function exportSongCharts() {
  const payload = { schema: 'fretline-song-charts', version: 1, exportedAt: new Date().toISOString(), playlistUrl: settings.playlistUrl, playlistTracks: settings.playlistTracks, songCharts: settings.songCharts };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `fretline-chords-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importSongCharts(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try {
    const payload = JSON.parse(await file.text()); const importedCharts = sanitizeSongCharts(payload.songCharts ?? payload.charts ?? payload); const importedTracks = sanitizePlaylistTracks(payload.playlistTracks ?? []);
    settings.songCharts = { ...settings.songCharts, ...importedCharts }; settings.playlistTracks = mergePlaylistTracks(settings.playlistTracks, importedTracks);
    saveSettings(); renderLibrarySummary(); renderSongList(); renderPlayAlongAtCurrentTime(true); showToast(`Imported ${Object.keys(importedCharts).length} chord maps`);
  } catch (_) { showToast('That file is not a valid Fretline chord export.'); }
}

function backToLibrary() { try { youtubePlayer?.pauseVideo?.(); } catch (_) {} dom.youtubePlayerShell.hidden = true; dom.playAlongView.hidden = true; dom.libraryListView.hidden = false; selectedSong = null; activePlayAlongKey = ''; stopChordSound(); renderSongList(); dom.libraryStatus.textContent = catalogStatusMessage(); }

async function initializeSongLibrary() {
  dom.playlistForm.hidden = true; dom.indexPlaylistButton.hidden = true; dom.playlistUrl.value = DEFAULT_PLAYLIST_URL; dom.libraryStatus.textContent = 'Loading the bundled playlist catalog…';
  renderLibrarySummary(); renderSongList(); updateTransposeControl(); updateLoopControls(); startPlayAlongTicker();
  try {
    bundledPlaylistCatalog = await loadBundledPlaylistCatalog();
    settings.playlistUrl = bundledPlaylistCatalog.sourceUrl;
    settings.playlistTracks = mergePlaylistTracks(bundledPlaylistCatalog.tracks, settings.playlistTracks);
    saveSettings(); renderLibrarySummary(); renderSongList(); dom.libraryStatus.textContent = catalogStatusMessage();
  } catch (error) {
    dom.libraryStatus.textContent = settings.playlistTracks.length ? `${settings.playlistTracks.length.toLocaleString()} locally saved entries are available; the bundled catalog could not be refreshed.` : error.message;
  }
}

function bindLibraryEvents() {
  dom.libraryButton.addEventListener('click', openSongLibrary); dom.readyLibraryButton.addEventListener('click', openSongLibrary); dom.playlistForm.addEventListener('submit', (event) => event.preventDefault()); dom.songSearch.addEventListener('input', renderSongList); dom.exportChartsButton.addEventListener('click', exportSongCharts); dom.importChartsInput.addEventListener('change', importSongCharts);
  dom.songList.addEventListener('click', (event) => { const row = event.target.closest('button[data-catalog-id]'); if (row) selectSong(row.dataset.catalogId, true); }); dom.backToLibraryButton.addEventListener('click', backToLibrary);
  dom.playAlongToggle.addEventListener('click', togglePlayAlong); dom.playAlongSeek.addEventListener('pointerdown', () => { seekDragging = true; }); dom.playAlongSeek.addEventListener('pointerup', () => { seekDragging = false; seekPlayAlong(); }); dom.playAlongSeek.addEventListener('change', () => { seekDragging = false; seekPlayAlong(); });
  dom.playbackRate.addEventListener('change', () => { try { youtubePlayer?.setPlaybackRate?.(Number(dom.playbackRate.value)); } catch (_) {} }); dom.transposeDown.addEventListener('click', () => transposePlayAlong(-1)); dom.transposeUp.addEventListener('click', () => transposePlayAlong(1));
  dom.setLoopStartButton.addEventListener('click', () => { loopStart = currentPlayerTime(); if (Number.isFinite(loopEnd) && loopEnd <= loopStart) loopEnd = null; updateLoopControls(); }); dom.setLoopEndButton.addEventListener('click', () => { const time = currentPlayerTime(); if (Number.isFinite(loopStart) && time > loopStart + .25) loopEnd = time; else showToast('Set A first, then move later in the song to set B.'); updateLoopControls(); }); dom.toggleLoopButton.addEventListener('click', () => { if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd) || loopEnd <= loopStart) { showToast('Set both A and B before turning the loop on.'); return; } loopEnabled = !loopEnabled; updateLoopControls(); });
  dom.upcomingChords.addEventListener('click', (event) => { const button = event.target.closest('button[data-time]'); if (!button || !youtubePlayerReady) return; youtubePlayer.seekTo(Number(button.dataset.time), true); renderPlayAlongAtCurrentTime(true); }); dom.playAlongDiagram.addEventListener('click', () => { if (playAlongCurrentVoicing) playChordVoicingSound(playAlongCurrentVoicing, currentTuning.midi, settings.instrument); });
  dom.editSongChartButton.addEventListener('click', openSongChartEditor); dom.findChordsButton.addEventListener('click', findSongChords); dom.songChartForm.addEventListener('submit', saveSongChart); dom.markChordButton.addEventListener('click', markChordAtCurrentTime);
  dom.libraryDialog.addEventListener('close', () => { try { youtubePlayer?.pauseVideo?.(); } catch (_) {} disconnectSongListObserver(); stopChordSound(); });
}
