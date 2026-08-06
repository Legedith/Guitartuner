const fretlineFocusBaseSelectSong = selectSong;
const fretlineFocusBaseBackToLibrary = backToLibrary;
const fretlineFocusBaseSetScrollPlaying = setFretlineLyricsScrollPlaying;
const fretlineFocusBaseResetReader = resetFretlineLyricsReader;
const fretlineFocusBaseRenderLyrics = renderFretlineLyrics;
const fretlineFocusBaseRenderPracticeSheet = renderFretlinePracticeSheet;
let fretlineFocusScrollPosition = 0;
let fretlineFocusFullscreenButton = null;
let fretlineFocusHeadingActions = null;

function fretlineFocusMaximumScroll() {
  if (!fretlineLyricsViewport) return 0;
  return Math.max(0, fretlineLyricsViewport.scrollHeight - fretlineLyricsViewport.clientHeight);
}

function fretlineFocusSyncScrollPosition() {
  fretlineFocusScrollPosition = Math.min(fretlineFocusMaximumScroll(), Math.max(0, Number(fretlineLyricsViewport?.scrollTop) || 0));
}

function fretlineFocusIconButton(label, path) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'practice-fullscreen-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return button;
}

function updateFretlineFocusFullscreenButton() {
  if (!fretlineFocusFullscreenButton) return;
  const active = document.fullscreenElement === dom.libraryDialog;
  const label = active ? 'Exit full screen' : 'Full screen';
  fretlineFocusFullscreenButton.setAttribute('aria-pressed', String(active));
  fretlineFocusFullscreenButton.setAttribute('aria-label', label);
  fretlineFocusFullscreenButton.title = label;
  const path = fretlineFocusFullscreenButton.querySelector('path');
  if (path) path.setAttribute('d', active
    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
    : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5');
}

async function requestFretlineNativeFullscreen() {
  if (document.fullscreenElement || typeof dom.libraryDialog?.requestFullscreen !== 'function') return;
  try {
    await dom.libraryDialog.requestFullscreen({ navigationUI: 'hide' });
  } catch (_) {
    try { await dom.libraryDialog.requestFullscreen(); } catch (_) {}
  }
}

async function toggleFretlineNativeFullscreen() {
  if (document.fullscreenElement === dom.libraryDialog) {
    try { await document.exitFullscreen(); } catch (_) {}
    return;
  }
  await requestFretlineNativeFullscreen();
}

function ensureFretlineFocusUi() {
  ensureFretlineLyricsUi();
  if (!document.querySelector('link[data-fretline-practice-focus]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './styles/practice-focus.css';
    link.dataset.fretlinePracticeFocus = 'true';
    document.head.append(link);
  }

  if (!fretlineFocusFullscreenButton?.isConnected) {
    const heading = dom.playAlongView?.querySelector('.song-heading');
    if (heading) {
      fretlineFocusHeadingActions = heading.querySelector('.practice-heading-actions');
      if (!fretlineFocusHeadingActions) {
        fretlineFocusHeadingActions = document.createElement('div');
        fretlineFocusHeadingActions.className = 'practice-heading-actions';
        heading.append(fretlineFocusHeadingActions);
      }
      fretlineFocusFullscreenButton = fretlineFocusIconButton('Full screen', 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5');
      fretlineFocusFullscreenButton.addEventListener('click', toggleFretlineNativeFullscreen);
      fretlineFocusHeadingActions.append(fretlineFocusFullscreenButton);
      if (dom.openYouTubeButton?.isConnected) fretlineFocusHeadingActions.append(dom.openYouTubeButton);
    }
  }

  if (fretlineLyricsViewport && !fretlineLyricsViewport.dataset.reliableAutoscroll) {
    fretlineLyricsViewport.dataset.reliableAutoscroll = 'true';
    const pauseForManualScroll = () => {
      if (fretlineLyricsScrollPlaying) setFretlineLyricsScrollPlaying(false);
      fretlineFocusSyncScrollPosition();
    };
    fretlineLyricsViewport.addEventListener('wheel', pauseForManualScroll, { passive: true });
    fretlineLyricsViewport.addEventListener('touchstart', pauseForManualScroll, { passive: true });
    fretlineLyricsViewport.addEventListener('pointerdown', pauseForManualScroll, { passive: true });
    fretlineLyricsViewport.addEventListener('scroll', () => {
      if (!fretlineLyricsScrollPlaying) fretlineFocusSyncScrollPosition();
    }, { passive: true });
  }
  updateFretlineFocusFullscreenButton();
}

function enterFretlinePracticeFocus() {
  ensureFretlineFocusUi();
  dom.libraryDialog.classList.add('practice-focus-mode');
  document.body.classList.add('practice-focus-open');
  dom.youtubePlayerShell.hidden = true;
  requestAnimationFrame(() => fretlineLyricsViewport?.focus({ preventScroll: true }));
}

function leaveFretlinePracticeFocus() {
  dom.libraryDialog.classList.remove('practice-focus-mode');
  document.body.classList.remove('practice-focus-open');
  if (document.fullscreenElement === dom.libraryDialog) document.exitFullscreen().catch(() => {});
}

setFretlineLyricsScrollPlaying = function setReliableLyricsScrollPlaying(playing) {
  if (playing) fretlineFocusSyncScrollPosition();
  fretlineFocusBaseSetScrollPlaying(playing);
};

fretlineLyricsScrollStep = function reliableLyricsScrollStep(now) {
  if (!fretlineLyricsScrollPlaying || !fretlineLyricsViewport) return;
  const maximum = fretlineFocusMaximumScroll();
  if (!maximum) {
    setFretlineLyricsScrollPlaying(false);
    return;
  }
  if (!fretlineLyricsScrollLastTime) {
    fretlineLyricsScrollLastTime = now;
    fretlineFocusSyncScrollPosition();
  }
  const elapsed = Math.max(0, Math.min(.25, (now - fretlineLyricsScrollLastTime) / 1000));
  fretlineLyricsScrollLastTime = now;
  fretlineFocusScrollPosition = advancePracticeScrollPosition(
    fretlineFocusScrollPosition,
    elapsed,
    fretlineLyricsScrollSpeed,
    maximum,
  );
  fretlineLyricsViewport.scrollTop = fretlineFocusScrollPosition;
  updateFretlineLyricsActiveLine();
  if (fretlineFocusScrollPosition >= maximum - .5) {
    setFretlineLyricsScrollPlaying(false);
    return;
  }
  fretlineLyricsScrollFrame = requestAnimationFrame(fretlineLyricsScrollStep);
};

resetFretlineLyricsReader = function resetReliableLyricsReader() {
  fretlineFocusScrollPosition = 0;
  return fretlineFocusBaseResetReader();
};

renderFretlineLyrics = function renderReliableLyrics(...argumentsList) {
  const result = fretlineFocusBaseRenderLyrics(...argumentsList);
  fretlineFocusSyncScrollPosition();
  return result;
};

renderFretlinePracticeSheet = function renderReliablePracticeSheet() {
  const resume = fretlineLyricsScrollPlaying;
  if (resume) setFretlineLyricsScrollPlaying(false);
  const result = fretlineFocusBaseRenderPracticeSheet();
  requestAnimationFrame(() => {
    fretlineFocusSyncScrollPosition();
    if (resume) setFretlineLyricsScrollPlaying(true);
  });
  return result;
};

selectSong = async function selectSongInPracticeFocus(catalogId) {
  enterFretlinePracticeFocus();
  requestFretlineNativeFullscreen();
  const result = fretlineFocusBaseSelectSong(catalogId);
  await result;
  dom.youtubePlayerShell.hidden = true;
  ensureFretlineFocusUi();
};

backToLibrary = function leaveFocusedPractice() {
  leaveFretlinePracticeFocus();
  return fretlineFocusBaseBackToLibrary();
};

document.addEventListener('fullscreenchange', updateFretlineFocusFullscreenButton);
dom.libraryDialog.addEventListener('close', leaveFretlinePracticeFocus);
ensureFretlineFocusUi();
