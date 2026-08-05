let youtubeApiPromise = null;
let youtubePlayer = null;
let youtubePlayerReady = false;
let loadedPlaylistId = null;
let playlistSyncTimer = 0;
let playlistSyncAttempts = 0;
let libraryIndexing = false;
let libraryIndexToken = 0;
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
  });
  return youtubeApiPromise;
}

function youtubeErrorMessage(code) {
  if (code === 2) return 'YouTube rejected this playlist or video link.';
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
  if (!youtubePlayerReady || !youtubePlayer) return null;
  let data = {};
  try { data = youtubePlayer.getVideoData?.() ?? {}; } catch (_) { data = {}; }
  let videoId = extractYouTubeVideoId(data.video_id);
  let index = -1;
  try { index = youtubePlayer.getPlaylistIndex?.() ?? -1; } catch (_) { index = -1; }
  if (!videoId && index >= 0) videoId = settings.playlistTracks[index]?.videoId ?? null;
  if (!videoId) return null;
  let track = settings.playlistTracks.find((item) => item.videoId === videoId);
  if (!track) {
    track = { videoId, index: index >= 0 ? index : settings.playlistTracks.length, title: '', artist: '', duration: 0, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
    settings.playlistTracks.push(track);
  }
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const artist = typeof data.author === 'string' ? data.author.trim() : '';
  const duration = currentPlayerDuration();
  let changed = false;
  if (title && title !== track.title) { track.title = title.slice(0, 160); changed = true; }
  if (artist && artist !== track.artist) { track.artist = artist.slice(0, 120); changed = true; }
  if (duration > 0 && Math.abs(duration - track.duration) > .5) { track.duration = duration; changed = true; }
  if (index >= 0 && track.index !== index) { track.index = index; changed = true; }
  if (changed) { settings.playlistTracks = sanitizePlaylistTracks(settings.playlistTracks); saveSettings(); renderLibrarySummary(); renderSongList(); }
  if (selectedSong?.videoId === track.videoId) {
    selectedSong = track; dom.playAlongTitle.textContent = track.title || `Track ${track.index + 1}`; dom.playAlongArtist.textContent = track.artist || 'YouTube playlist'; dom.playAlongDuration.textContent = formatTime(duration || track.duration);
  }
  return track;
}

function syncPlaylistFromPlayer() {
  clearTimeout(playlistSyncTimer);
  if (!youtubePlayerReady || !youtubePlayer) return;
  let videoIds = [];
  try { videoIds = youtubePlayer.getPlaylist?.() ?? []; } catch (_) { videoIds = []; }
  videoIds = videoIds.map(extractYouTubeVideoId).filter(Boolean);
  if (!videoIds.length && playlistSyncAttempts < 20) {
    playlistSyncAttempts += 1; playlistSyncTimer = setTimeout(syncPlaylistFromPlayer, 350); return;
  }
  playlistSyncAttempts = 0;
  if (!videoIds.length) { dom.libraryStatus.textContent = 'This playlist is empty, private, or unavailable for embedding.'; return; }
  const existing = new Map(settings.playlistTracks.map((track) => [track.videoId, track]));
  settings.playlistTracks = sanitizePlaylistTracks(videoIds.map((videoId, index) => ({ ...existing.get(videoId), videoId, index })));
  saveSettings(); renderLibrarySummary(); renderSongList(); captureCurrentMetadata(); dom.indexPlaylistButton.disabled = false;
  dom.libraryStatus.textContent = `${videoIds.length} songs loaded. Titles appear as songs are opened, or use Read titles.`;
}

function onYouTubePlayerReady() {
  youtubePlayerReady = true; dom.indexPlaylistButton.disabled = false;
  if (loadedPlaylistId) youtubePlayer.cuePlaylist({ listType: 'playlist', list: loadedPlaylistId, index: 0, startSeconds: 0 });
  playlistSyncAttempts = 0; syncPlaylistFromPlayer(); updatePlayButton(); startPlayAlongTicker();
}

function onYouTubeStateChange(event) {
  updatePlayButton();
  if (event.data === globalThis.YT?.PlayerState?.CUED || event.data === globalThis.YT?.PlayerState?.PLAYING || event.data === globalThis.YT?.PlayerState?.PAUSED) {
    syncPlaylistFromPlayer(); setTimeout(captureCurrentMetadata, 180);
  }
}

async function ensureYouTubePlayer(playlistId) {
  await loadYouTubeIframeApi(); loadedPlaylistId = playlistId; dom.youtubePlayerShell.hidden = false;
  if (youtubePlayer) {
    youtubePlayer.cuePlaylist({ listType: 'playlist', list: playlistId, index: 0, startSeconds: 0 }); playlistSyncAttempts = 0; syncPlaylistFromPlayer(); return;
  }
  youtubePlayer = new globalThis.YT.Player('youtubePlayer', {
    width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
    events: {
      onReady: onYouTubePlayerReady,
      onStateChange: onYouTubeStateChange,
      onError: (event) => { dom.libraryStatus.textContent = youtubeErrorMessage(event.data); showToast(youtubeErrorMessage(event.data), 3800); },
    },
  });
}

async function loadPlaylist(event) {
  event?.preventDefault(); const playlistId = extractYouTubePlaylistId(dom.playlistUrl.value);
  if (!playlistId) { showToast('Paste a valid YouTube or YouTube Music playlist link.'); return; }
  settings.playlistUrl = dom.playlistUrl.value.trim(); settings.playlistTracks = loadedPlaylistId === playlistId ? settings.playlistTracks : []; saveSettings(); renderSongList(); renderLibrarySummary();
  dom.loadPlaylistButton.disabled = true; dom.libraryStatus.textContent = 'Loading YouTube playlist…';
  try { await ensureYouTubePlayer(playlistId); dom.libraryStatus.textContent = 'Playlist connected. Reading its song list…'; }
  catch (error) { dom.libraryStatus.textContent = error.message; showToast(error.message, 4200); }
  finally { dom.loadPlaylistButton.disabled = false; }
}

function renderLibrarySummary() {
  const summary = librarySummary(settings.playlistTracks, settings.songCharts);
  dom.librarySummary.hidden = summary.trackCount === 0; dom.librarySummary.replaceChildren();
  if (!summary.trackCount) return;
  const stats = [
    [String(summary.trackCount), 'songs'],
    [String(summary.charted), 'with chord maps'],
    [summary.totalDuration ? formatTime(summary.totalDuration, true) : (summary.topArtists[0]?.name || 'Personal'), summary.totalDuration ? 'total play time' : 'local practice library'],
  ];
  for (const [value, label] of stats) { const item = document.createElement('div'); item.className = 'summary-stat'; const strong = document.createElement('strong'); strong.textContent = value; const span = document.createElement('span'); span.textContent = label; item.append(strong, span); dom.librarySummary.append(item); }
}

function trackDisplayTitle(track) { return track.title || settings.songCharts[track.videoId]?.title || `Track ${track.index + 1}`; }
function trackDisplayArtist(track) { return track.artist || settings.songCharts[track.videoId]?.artist || 'YouTube playlist'; }

function renderSongList() {
  const query = dom.songSearch.value.trim().toLowerCase(); const tracks = settings.playlistTracks.filter((track) => `${trackDisplayTitle(track)} ${trackDisplayArtist(track)}`.toLowerCase().includes(query));
  dom.songList.replaceChildren(); dom.libraryEmpty.hidden = settings.playlistTracks.length > 0;
  if (!settings.playlistTracks.length) { dom.libraryEmpty.querySelector('strong').textContent = 'No songs loaded'; return; }
  if (!tracks.length) { dom.libraryEmpty.hidden = false; dom.libraryEmpty.querySelector('strong').textContent = 'No matching songs'; return; }
  for (const track of tracks) {
    const chart = settings.songCharts[track.videoId]; const button = document.createElement('button'); button.type = 'button'; button.className = 'song-row'; button.dataset.videoId = track.videoId;
    const thumbnail = document.createElement('span'); thumbnail.className = 'song-thumbnail'; const image = document.createElement('img'); image.src = track.thumbnail; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; thumbnail.append(image); if (track.duration) { const duration = document.createElement('span'); duration.textContent = formatTime(track.duration); thumbnail.append(duration); }
    const copy = document.createElement('span'); copy.className = 'song-copy'; const title = document.createElement('strong'); title.textContent = trackDisplayTitle(track); const artist = document.createElement('span'); artist.textContent = trackDisplayArtist(track); copy.append(title, artist);
    const status = document.createElement('span'); status.className = 'song-status'; const index = document.createElement('span'); index.className = 'song-index'; index.textContent = `#${track.index + 1}`; status.append(index); if (chart?.events?.length) { const badge = document.createElement('span'); badge.className = 'charted-badge'; badge.textContent = `${chart.events.length} changes`; status.append(badge); }
    button.append(thumbnail, copy, status); dom.songList.append(button);
  }
}

function openSongLibrary() {
  dom.playlistUrl.value = settings.playlistUrl || DEFAULT_PLAYLIST_URL; dom.libraryListView.hidden = false; dom.playAlongView.hidden = true; renderLibrarySummary(); renderSongList();
  if (youtubePlayer) dom.youtubePlayerShell.hidden = false;
  dom.libraryDialog.showModal();
}

function songByVideoId(videoId) { return settings.playlistTracks.find((track) => track.videoId === videoId) ?? null; }

function selectSong(videoId, play = true) {
  const track = songByVideoId(videoId); if (!track) return;
  selectedSong = track; playAlongTranspose = 0; activePlayAlongKey = ''; loopStart = null; loopEnd = null; loopEnabled = false; updateLoopControls(); updateTransposeControl();
  dom.libraryListView.hidden = true; dom.playAlongView.hidden = false; dom.playAlongTitle.textContent = trackDisplayTitle(track); dom.playAlongArtist.textContent = trackDisplayArtist(track); dom.openYouTubeButton.href = youtubeVideoUrl(track.videoId); dom.playAlongDuration.textContent = formatTime(track.duration); dom.playAlongSeek.value = '0';
  if (youtubePlayerReady && youtubePlayer) { try { youtubePlayer.playVideoAt(track.index); if (!play) youtubePlayer.pauseVideo(); } catch (_) {} }
  renderPlayAlongAtCurrentTime(true); startPlayAlongTicker();
}

function displayedChartEvents() {
  const chart = selectedSong ? settings.songCharts[selectedSong.videoId] : null;
  return chart?.events?.length ? transposeChordEvents(chart.events, playAlongTranspose, chordAccidentalMode()) : [];
}

function renderUpcomingChords(events, activeIndex, time) {
  dom.upcomingChords.replaceChildren();
  const start = Math.max(0, activeIndex); const end = Math.min(events.length, start + 7);
  for (let index = start; index < end; index += 1) {
    const event = events[index]; const button = document.createElement('button'); button.type = 'button'; button.className = 'upcoming-chord'; button.dataset.time = String(event.time); button.setAttribute('aria-current', String(index === activeIndex));
    const chord = document.createElement('strong'); chord.textContent = event.chord; const timing = document.createElement('span'); timing.textContent = index === activeIndex ? `${Math.max(0, event.time - time).toFixed(0)}s now` : formatTime(event.time); button.append(chord, timing); dom.upcomingChords.append(button);
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
    dom.currentSection.textContent = events.length ? 'Get ready' : 'Current chord'; dom.currentChordName.textContent = '—'; dom.nextChordName.textContent = events[0] ? `${events[0].chord} at ${formatTime(events[0].time)}` : 'Add a chord map to start'; dom.playAlongDiagram.replaceChildren(); playAlongCurrentVoicing = null; renderUpcomingChords(events, 0, time); activePlayAlongKey = ''; return;
  }
  const key = `${selectedSong.videoId}:${index}:${playAlongTranspose}:${settings.instrument}:${currentTuning.id}`;
  dom.currentSection.textContent = event.section || 'Current chord'; dom.currentChordName.textContent = event.chord;
  dom.nextChordName.textContent = next ? `Next ${next.chord} in ${formatTime(Math.max(0, next.time - time))}` : 'Final chord';
  if (force || key !== activePlayAlongKey) { playAlongCurrentVoicing = renderChordDiagramForSymbol(dom.playAlongDiagram, event.chord, { compact: true, limit: 4, tuningMidi: currentTuning.midi }); activePlayAlongKey = key; }
  renderUpcomingChords(events, index, time);
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
  if (!youtubePlayerReady) { showToast('Load the playlist first.'); return; }
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
  const symbol = dom.chartChordSymbol.value.trim(); if (!parseChordSymbol(symbol)) { showToast('Enter a supported chord such as C, Am, G7, or Fmaj7.'); return; }
  const time = currentPlayerTime(); const line = `${formatTime(time, time >= 3600)} ${symbol}`; const existing = dom.songChartText.value.trim(); dom.songChartText.value = existing ? `${existing}\n${line}` : line; dom.songChartText.focus(); dom.songChartText.setSelectionRange(dom.songChartText.value.length, dom.songChartText.value.length);
}

function saveSongChart(event) {
  event.preventDefault(); if (!editingSongVideoId) return;
  const bpm = clamp(Number(dom.songChartBpm.value) || 90, 20, 300); const beatsPerChord = clamp(Number(dom.beatsPerChord.value) || 4, .25, 32); const raw = dom.songChartText.value.trim(); const events = parseChordChart(raw, { bpm, beatsPerChord });
  if (raw && !events.length) { showToast('No supported chord changes were found. Check the examples below the editor.'); return; }
  settings.songCharts[editingSongVideoId] = { videoId: editingSongVideoId, title: dom.songChartTitle.value.trim(), artist: dom.songChartArtist.value.trim(), bpm, beatsPerChord, raw, sourceUrl: dom.songChartSource.value.trim(), events, updatedAt: Date.now() };
  const track = songByVideoId(editingSongVideoId); if (track) { if (settings.songCharts[editingSongVideoId].title) track.title = settings.songCharts[editingSongVideoId].title; if (settings.songCharts[editingSongVideoId].artist) track.artist = settings.songCharts[editingSongVideoId].artist; }
  saveSettings(); dom.songChartDialog.close(); activePlayAlongKey = ''; renderLibrarySummary(); renderSongList(); renderPlayAlongAtCurrentTime(true); showToast(events.length ? `Saved ${events.length} chord changes` : 'Chord map cleared');
}

async function findSongChords() {
  if (!selectedSong) return; const chart = settings.songCharts[selectedSong.videoId];
  if (chart?.sourceUrl) { window.open(chart.sourceUrl, '_blank', 'noopener'); return; }
  const url = videoUrlForSong();
  try { await navigator.clipboard.writeText(url); showToast('YouTube link copied. Paste it into Chordify, then save the licensed source or enter your chord map here.', 5200); }
  catch (_) { showToast('Open Chordify and paste this song’s YouTube link.', 3600); }
  window.open('https://chordify.net/', '_blank', 'noopener');
}

function exportSongCharts() {
  const payload = { schema: 'fretline-song-charts', version: 1, exportedAt: new Date().toISOString(), playlistUrl: settings.playlistUrl, playlistTracks: settings.playlistTracks, songCharts: settings.songCharts };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `fretline-chords-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importSongCharts(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try {
    const payload = JSON.parse(await file.text()); const importedCharts = sanitizeSongCharts(payload.songCharts ?? payload.charts ?? payload); const importedTracks = sanitizePlaylistTracks(payload.playlistTracks ?? []);
    settings.songCharts = { ...settings.songCharts, ...importedCharts };
    if (importedTracks.length) { const merged = new Map(settings.playlistTracks.map((track) => [track.videoId, track])); for (const track of importedTracks) merged.set(track.videoId, { ...merged.get(track.videoId), ...track }); settings.playlistTracks = sanitizePlaylistTracks([...merged.values()]); }
    if (typeof payload.playlistUrl === 'string' && extractYouTubePlaylistId(payload.playlistUrl)) { settings.playlistUrl = payload.playlistUrl; dom.playlistUrl.value = payload.playlistUrl; }
    saveSettings(); renderLibrarySummary(); renderSongList(); renderPlayAlongAtCurrentTime(true); showToast(`Imported ${Object.keys(importedCharts).length} chord maps`);
  } catch (_) { showToast('That file is not a valid Fretline chord export.'); }
}

function waitForTrackMetadata(videoId, timeout = 5200) {
  return new Promise((resolve) => {
    const started = performance.now();
    const poll = () => {
      const track = captureCurrentMetadata(); if (track?.videoId === videoId && track.title) { resolve(track); return; }
      if (performance.now() - started >= timeout) { resolve(track ?? null); return; }
      setTimeout(poll, 220);
    };
    poll();
  });
}

async function indexPlaylistTitles() {
  if (!youtubePlayerReady || !settings.playlistTracks.length) return;
  if (libraryIndexing) { libraryIndexToken += 1; libraryIndexing = false; dom.indexPlaylistButton.textContent = 'Read titles'; dom.libraryStatus.textContent = 'Title reading stopped.'; return; }
  libraryIndexing = true; const token = ++libraryIndexToken; dom.indexPlaylistButton.textContent = 'Stop'; const previousIndex = Math.max(0, youtubePlayer.getPlaylistIndex?.() ?? 0); const previousTime = currentPlayerTime(); const wasPlaying = globalThis.YT && youtubeState() === globalThis.YT.PlayerState.PLAYING; let wasMuted = false;
  try { wasMuted = youtubePlayer.isMuted?.() ?? false; youtubePlayer.mute(); }
  catch (_) {}
  for (let index = 0; index < settings.playlistTracks.length; index += 1) {
    if (!libraryIndexing || token !== libraryIndexToken) break;
    const track = settings.playlistTracks[index]; if (track.title && track.duration) continue;
    dom.libraryStatus.textContent = `Reading titles ${index + 1} of ${settings.playlistTracks.length}…`;
    try { youtubePlayer.playVideoAt(index); youtubePlayer.pauseVideo(); } catch (_) {}
    await waitForTrackMetadata(track.videoId);
  }
  if (token === libraryIndexToken) {
    try { youtubePlayer.playVideoAt(previousIndex); youtubePlayer.seekTo(previousTime, true); if (!wasPlaying) youtubePlayer.pauseVideo(); if (!wasMuted) youtubePlayer.unMute(); } catch (_) {}
    libraryIndexing = false; dom.indexPlaylistButton.textContent = 'Read titles'; dom.libraryStatus.textContent = 'Playlist titles saved in this browser.'; renderSongList(); renderLibrarySummary();
  }
}

function backToLibrary() { dom.playAlongView.hidden = true; dom.libraryListView.hidden = false; selectedSong = null; activePlayAlongKey = ''; stopChordSound(); renderSongList(); }

function initializeSongLibrary() {
  dom.playlistUrl.value = settings.playlistUrl || DEFAULT_PLAYLIST_URL; renderLibrarySummary(); renderSongList(); updateTransposeControl(); updateLoopControls(); startPlayAlongTicker();
}

function bindLibraryEvents() {
  dom.libraryButton.addEventListener('click', openSongLibrary); dom.readyLibraryButton.addEventListener('click', openSongLibrary); dom.playlistForm.addEventListener('submit', loadPlaylist); dom.songSearch.addEventListener('input', renderSongList); dom.indexPlaylistButton.addEventListener('click', indexPlaylistTitles); dom.exportChartsButton.addEventListener('click', exportSongCharts); dom.importChartsInput.addEventListener('change', importSongCharts);
  dom.songList.addEventListener('click', (event) => { const row = event.target.closest('button[data-video-id]'); if (row) selectSong(row.dataset.videoId, true); }); dom.backToLibraryButton.addEventListener('click', backToLibrary);
  dom.playAlongToggle.addEventListener('click', togglePlayAlong); dom.playAlongSeek.addEventListener('pointerdown', () => { seekDragging = true; }); dom.playAlongSeek.addEventListener('pointerup', () => { seekDragging = false; seekPlayAlong(); }); dom.playAlongSeek.addEventListener('change', () => { seekDragging = false; seekPlayAlong(); });
  dom.playbackRate.addEventListener('change', () => { try { youtubePlayer?.setPlaybackRate?.(Number(dom.playbackRate.value)); } catch (_) {} }); dom.transposeDown.addEventListener('click', () => transposePlayAlong(-1)); dom.transposeUp.addEventListener('click', () => transposePlayAlong(1));
  dom.setLoopStartButton.addEventListener('click', () => { loopStart = currentPlayerTime(); if (Number.isFinite(loopEnd) && loopEnd <= loopStart) loopEnd = null; updateLoopControls(); }); dom.setLoopEndButton.addEventListener('click', () => { const time = currentPlayerTime(); if (Number.isFinite(loopStart) && time > loopStart + .25) loopEnd = time; else showToast('Set A first, then move later in the song to set B.'); updateLoopControls(); }); dom.toggleLoopButton.addEventListener('click', () => { if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd) || loopEnd <= loopStart) { showToast('Set both A and B before turning the loop on.'); return; } loopEnabled = !loopEnabled; updateLoopControls(); });
  dom.upcomingChords.addEventListener('click', (event) => { const button = event.target.closest('button[data-time]'); if (!button || !youtubePlayerReady) return; youtubePlayer.seekTo(Number(button.dataset.time), true); renderPlayAlongAtCurrentTime(true); }); dom.playAlongDiagram.addEventListener('click', () => { if (playAlongCurrentVoicing) playChordVoicingSound(playAlongCurrentVoicing, currentTuning.midi, settings.instrument); });
  dom.editSongChartButton.addEventListener('click', openSongChartEditor); dom.findChordsButton.addEventListener('click', findSongChords); dom.songChartForm.addEventListener('submit', saveSongChart); dom.markChordButton.addEventListener('click', markChordAtCurrentTime);
  dom.libraryDialog.addEventListener('close', () => { try { youtubePlayer?.pauseVideo?.(); } catch (_) {} stopChordSound(); if (libraryIndexing) { libraryIndexToken += 1; libraryIndexing = false; dom.indexPlaylistButton.textContent = 'Read titles'; } });
}
