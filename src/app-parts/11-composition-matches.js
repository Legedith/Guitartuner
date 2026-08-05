const fretlineCompositionBaseProvenance = fretlineChordCatalogProvenance;
const fretlineCompositionBaseConfidenceLabel = fretlineChordCatalogConfidenceLabel;

fretlineChordCatalogProvenance = function compositionAwareProvenance(value) {
  const parsed = fretlineCompositionBaseProvenance(value);
  if (!parsed || !value || typeof value !== 'object') return parsed;
  const matchModes = ['same-composition-cover', 'same-composition-version', 'same-title-recording', 'fuzzy-composition'];
  parsed.matchMode = matchModes.includes(value.matchMode) ? value.matchMode : '';
  parsed.titleExact = Boolean(value.titleExact);
  parsed.artistEquivalent = Boolean(value.artistEquivalent);
  parsed.versionDifferenceAccepted = Boolean(value.versionDifferenceAccepted);
  parsed.policy = fretlineChordCatalogText(value.policy, 80);
  parsed.playlistVersionTags = Array.isArray(value.playlistVersionTags) ? value.playlistVersionTags.map((tag) => fretlineChordCatalogText(tag, 30)).filter(Boolean).slice(0, 12) : [];
  parsed.matchedVersionTags = Array.isArray(value.matchedVersionTags) ? value.matchedVersionTags.map((tag) => fretlineChordCatalogText(tag, 30)).filter(Boolean).slice(0, 12) : [];
  return parsed;
};

fretlineChordCatalogConfidenceLabel = function compositionConfidenceLabel(chart) {
  switch (chart?.provenance?.matchMode) {
    case 'same-composition-cover': return 'Same song · cover match';
    case 'same-composition-version': return 'Same song · alternate version';
    case 'same-title-recording': return 'Same-title recording';
    case 'fuzzy-composition': return 'Best-effort composition match';
    default: return fretlineCompositionBaseConfidenceLabel(chart);
  }
};
