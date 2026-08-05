const fretlineCompositionBaseProvenance = fretlineChordCatalogProvenance;
const fretlineCompositionBaseConfidenceLabel = fretlineChordCatalogConfidenceLabel;
const fretlineCompositionBaseRenderNote = fretlineChordCatalogRenderNote;

fretlineChordCatalogProvenance = function compositionAwareProvenance(value) {
  const parsed = fretlineCompositionBaseProvenance(value);
  if (!parsed || !value || typeof value !== 'object') return parsed;
  const matchModes = ['same-composition-cover', 'same-composition-version', 'same-title-recording', 'same-title-unverified', 'fuzzy-composition'];
  const lyricStatuses = ['verified', 'conflict', 'uncertain', 'unavailable', 'not-required'];
  parsed.matchMode = matchModes.includes(value.matchMode) ? value.matchMode : '';
  parsed.titleExact = Boolean(value.titleExact);
  parsed.artistEquivalent = Boolean(value.artistEquivalent);
  parsed.versionDifferenceAccepted = Boolean(value.versionDifferenceAccepted);
  parsed.policy = fretlineChordCatalogText(value.policy, 80);
  parsed.playlistVersionTags = Array.isArray(value.playlistVersionTags) ? value.playlistVersionTags.map((tag) => fretlineChordCatalogText(tag, 30)).filter(Boolean).slice(0, 12) : [];
  parsed.matchedVersionTags = Array.isArray(value.matchedVersionTags) ? value.matchedVersionTags.map((tag) => fretlineChordCatalogText(tag, 30)).filter(Boolean).slice(0, 12) : [];
  parsed.lyricsVerification = lyricStatuses.includes(value.lyricsVerification) ? value.lyricsVerification : '';
  parsed.lyricsSimilarity = Number.isFinite(Number(value.lyricsSimilarity)) ? Math.max(0, Math.min(1, Number(value.lyricsSimilarity))) : null;
  parsed.lrclibTargetId = Number.isFinite(Number(value.lrclibTargetId)) ? Number(value.lrclibTargetId) : null;
  parsed.lrclibCandidateId = Number.isFinite(Number(value.lrclibCandidateId)) ? Number(value.lrclibCandidateId) : null;
  parsed.lrclibTargetTitle = fretlineChordCatalogText(value.lrclibTargetTitle, 200);
  parsed.lrclibTargetArtist = fretlineChordCatalogText(value.lrclibTargetArtist, 180);
  parsed.lrclibCandidateTitle = fretlineChordCatalogText(value.lrclibCandidateTitle, 200);
  parsed.lrclibCandidateArtist = fretlineChordCatalogText(value.lrclibCandidateArtist, 180);
  parsed.lyricsVerificationReason = fretlineChordCatalogText(value.lyricsVerificationReason, 120);
  return parsed;
};

fretlineChordCatalogConfidenceLabel = function compositionConfidenceLabel(chart) {
  switch (chart?.provenance?.matchMode) {
    case 'same-composition-cover': return 'Same song · lyrics verified';
    case 'same-composition-version': return 'Same song · alternate version';
    case 'same-title-recording': return 'Same recording metadata';
    case 'same-title-unverified': return 'Same title · best effort';
    case 'fuzzy-composition': return 'Best-effort composition match';
    default: return fretlineCompositionBaseConfidenceLabel(chart);
  }
};

fretlineChordCatalogRenderNote = function renderCompositionVerificationNote() {
  fretlineCompositionBaseRenderNote();
  const chart = fretlineChordCatalogActiveChart();
  if (!chart?.bundled || !fretlineChordCatalogNote || fretlineChordCatalogNote.hidden) return;
  const copy = [...fretlineChordCatalogNote.querySelectorAll('span')].find((node) => !node.classList.contains('catalog-confidence'));
  if (!copy) return;
  const verification = chart.provenance?.lyricsVerification;
  if (verification === 'verified') {
    const similarity = chart.provenance?.lyricsSimilarity;
    copy.textContent += Number.isFinite(similarity)
      ? ` Lyrics fingerprint agrees (${Math.round(similarity * 100)}%).`
      : ' Lyrics fingerprint agrees.';
  } else if (verification === 'unavailable' || verification === 'uncertain') {
    copy.textContent += ' Lyrics confirmation was unavailable; treat this as a same-title best effort.';
  }
};
