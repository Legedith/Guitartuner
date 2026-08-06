const fretlineWordAlignedBaseUpdateControls = updateFretlineLyricsControls;

updateFretlineLyricsControls = function updateWordAlignedLyricsControls() {
  fretlineWordAlignedBaseUpdateControls();
  const path = dom.playAlongToggle?.querySelector('path');
  if (path && fretlineLyricsScrollPlaying) path.setAttribute('d', 'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z');
};

updateFretlineLyricsControls();
