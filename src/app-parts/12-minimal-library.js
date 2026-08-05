const fretlineMinimalBaseInitializeSongLibrary = initializeSongLibrary;
const fretlineMinimalBaseRenderPlayAlong = renderPlayAlongAtCurrentTime;
let fretlineMinimalLibraryReady = Promise.resolve();

function fretlineMinimalRemove(node) {
  node?.remove();
}

function fretlineMinimalApplyUi() {
  if (!document.querySelector('link[data-fretline-minimal-library]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './styles/minimal-library.css';
    link.dataset.fretlineMinimalLibrary = 'true';
    document.head.append(link);
  }

  dom.libraryDialog.classList.add('minimal-library');
  const libraryHeading = dom.libraryDialog.querySelector('.sheet-header > div');
  libraryHeading?.querySelector('.eyebrow')?.remove();
  const title = document.querySelector('#libraryDialogTitle');
  if (title) title.textContent = 'Songs';

  dom.songSearch.placeholder = 'Search';
  dom.songSearch.setAttribute('aria-label', 'Search songs with chords');
  dom.songSearch.closest('.library-toolbar')?.classList.add('minimal-library-toolbar');

  fretlineMinimalRemove(dom.playlistForm);
  fretlineMinimalRemove(dom.librarySummary);
  fretlineMinimalRemove(dom.libraryStatus);
  fretlineMinimalRemove(dom.indexPlaylistButton);
  fretlineMinimalRemove(dom.exportChartsButton);
  fretlineMinimalRemove(dom.importChartsInput.closest('label'));
  fretlineMinimalRemove(dom.noChartMessage);
  fretlineMinimalRemove(dom.findChordsButton.closest('.play-along-actions'));
  fretlineMinimalRemove(dom.songChartDialog);
  fretlineMinimalRemove(fretlineChordCatalogAttribution);
  fretlineMinimalRemove(fretlineChordCatalogNote);
  document.querySelectorAll('.catalog-attribution,.catalog-chart-note').forEach((node) => node.remove());

  const emptyDetail = dom.libraryEmpty.querySelector('span');
  emptyDetail?.remove();
  dom.libraryEmpty.querySelector('strong').textContent = 'No matches';

  dom.backToLibraryButton.textContent = '← Songs';
  dom.openYouTubeButton.className = 'icon-button minimal-external-link';
  dom.openYouTubeButton.setAttribute('aria-label', 'Open in YouTube');
  dom.openYouTubeButton.title = 'Open in YouTube';
  dom.openYouTubeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';

  dom.nextChordName.textContent = '';
}

function fretlineMinimalChartedTracks(query = '') {
  return filterChartedTracks(settings.playlistTracks, settings.songCharts, query);
}

fretlineChordCatalogEnsureUi = function minimalChordCatalogUi() {
  fretlineMinimalRemove(fretlineChordCatalogAttribution);
  fretlineMinimalRemove(fretlineChordCatalogNote);
  fretlineChordCatalogAttribution = null;
  fretlineChordCatalogNote = null;
};

fretlineChordCatalogRenderAttribution = function minimalChordCatalogAttribution() {};
fretlineChordCatalogRenderNote = function minimalChordCatalogNote() {};

catalogStatusMessage = function minimalCatalogStatus() { return ''; };

renderLibrarySummary = function minimalLibrarySummary() {
  if (dom.librarySummary) dom.librarySummary.hidden = true;
};

createSongRow = function createMinimalSongRow(track) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'song-row minimal-song-row';
  button.dataset.catalogId = track.catalogId;

  const thumbnail = document.createElement('span');
  thumbnail.className = 'song-thumbnail';
  const image = document.createElement('img');
  image.src = track.thumbnail;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  thumbnail.append(image);
  if (track.duration) {
    const duration = document.createElement('span');
    duration.textContent = formatTime(track.duration);
    thumbnail.append(duration);
  }

  const copy = document.createElement('span');
  copy.className = 'song-copy';
  const songTitle = document.createElement('strong');
  songTitle.textContent = trackDisplayTitle(track);
  const artist = document.createElement('span');
  artist.textContent = trackDisplayArtist(track);
  copy.append(songTitle, artist);

  button.append(thumbnail, copy);
  button.setAttribute('aria-label', `${trackDisplayTitle(track)} · ${trackDisplayArtist(track)}`);
  return button;
};

appendSongBatch = function appendMinimalSongBatch() {
  songListObserver?.disconnect();
  songLoadMoreButton?.remove();
  songLoadMoreButton = null;

  const supportsObserver = 'IntersectionObserver' in window;
  const end = supportsObserver
    ? Math.min(filteredSongTracks.length, renderedSongCount + SONG_BATCH_SIZE)
    : filteredSongTracks.length;
  const fragment = document.createDocumentFragment();
  for (let index = renderedSongCount; index < end; index += 1) fragment.append(createSongRow(filteredSongTracks[index]));
  dom.songList.append(fragment);
  renderedSongCount = end;
  if (renderedSongCount >= filteredSongTracks.length) return;

  const sentinel = document.createElement('span');
  sentinel.className = 'song-scroll-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  dom.songList.append(sentinel);
  songLoadMoreButton = sentinel;
  songListObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) appendSongBatch();
  }, { root: dom.libraryDialog, rootMargin: '400px 0px' });
  songListObserver.observe(sentinel);
};

renderSongList = function renderMinimalSongList() {
  disconnectSongListObserver();
  filteredSongTracks = fretlineMinimalChartedTracks(dom.songSearch.value);
  renderedSongCount = 0;
  dom.songList.replaceChildren();
  dom.libraryEmpty.hidden = filteredSongTracks.length > 0;
  if (!filteredSongTracks.length) {
    dom.libraryEmpty.querySelector('strong').textContent = 'No matches';
    return;
  }
  appendSongBatch();
};

openSongLibrary = async function openMinimalSongLibrary() {
  fretlineMinimalApplyUi();
  dom.libraryListView.hidden = false;
  dom.playAlongView.hidden = true;
  dom.youtubePlayerShell.hidden = true;
  renderSongList();
  if (!dom.libraryDialog.open) dom.libraryDialog.showModal();
  await fretlineMinimalLibraryReady;
  renderSongList();
};

backToLibrary = function backToMinimalLibrary() {
  try { youtubePlayer?.pauseVideo?.(); } catch (_) {}
  dom.youtubePlayerShell.hidden = true;
  dom.playAlongView.hidden = true;
  dom.libraryListView.hidden = false;
  selectedSong = null;
  activePlayAlongKey = '';
  stopChordSound();
  renderSongList();
};

renderPlayAlongAtCurrentTime = function renderMinimalPlayAlong(force = false) {
  fretlineMinimalBaseRenderPlayAlong(force);
  if (dom.currentSection.textContent === 'Current chord' || dom.currentSection.textContent === 'Get ready') {
    dom.currentSection.textContent = '';
  }
};

initializeSongLibrary = function initializeMinimalSongLibrary() {
  fretlineMinimalApplyUi();
  fretlineMinimalLibraryReady = Promise.resolve(fretlineMinimalBaseInitializeSongLibrary())
    .then(() => {
      fretlineMinimalApplyUi();
      renderSongList();
    });
  return fretlineMinimalLibraryReady;
};

fretlineMinimalApplyUi();
