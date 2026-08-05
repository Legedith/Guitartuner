const FRETLINE_CHORD_CATALOG_URL = './src/data/chord-catalog.json';
const FRETLINE_CHORD_ATTRIBUTION_URL = 'https://huggingface.co/datasets/ailsntua/Chordonomicon';

let fretlineChordCatalog = null;
let fretlineBundledSongCharts = {};
let fretlineChordCatalogLoadPromise = null;
let fretlineChordCatalogNote = null;
let fretlineChordCatalogAttribution = null;

const fretlineChordCatalogBaseSaveSettings = saveSettings;
const fretlineChordCatalogBaseInitializeSongLibrary = initializeSongLibrary;
const fretlineChordCatalogBaseRenderPlayAlong = renderPlayAlongAtCurrentTime;
const fretlineChordCatalogBaseCreateSongRow = createSongRow;
const fretlineChordCatalogBaseCatalogStatusMessage = catalogStatusMessage;
const fretlineChordCatalogBaseOpenSongChartEditor = openSongChartEditor;

function fretlineChordCatalogText(value, maximum = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

function fretlineChordCatalogNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fretlineChordCatalogSafeEvents(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const item of value) {
    const time = Math.max(0, Math.min(86400, fretlineChordCatalogNumber(item?.time, Number.NaN)));
    const chord = fretlineChordCatalogText(item?.chord, 40);
    if (!Number.isFinite(time) || !chord || (chord !== '—' && !parseChordSymbol(chord))) continue;
    output.push({ time, chord, section: fretlineChordCatalogText(item?.section, 60) });
    if (output.length >= 4000) break;
  }
  return output.sort((left, right) => left.time - right.time);
}

function fretlineChordCatalogProvenance(value) {
  if (!value || typeof value !== 'object') return null;
  const confidence = ['high', 'medium', 'low'].includes(value.confidence) ? value.confidence : 'low';
  return {
    dataset: fretlineChordCatalogText(value.dataset, 80) || 'Chordonomicon',
    spotifySongId: fretlineChordCatalogText(value.spotifySongId, 40),
    spotifyTitle: fretlineChordCatalogText(value.spotifyTitle, 200),
    spotifyArtist: fretlineChordCatalogText(value.spotifyArtist, 180),
    spotifyAlbum: fretlineChordCatalogText(value.spotifyAlbum, 180),
    confidence,
    score: fretlineChordCatalogNumber(value.score),
    titleScore: fretlineChordCatalogNumber(value.titleScore),
    artistScore: fretlineChordCatalogNumber(value.artistScore),
    durationDifferenceSeconds: Number.isFinite(Number(value.durationDifferenceSeconds)) ? Number(value.durationDifferenceSeconds) : null,
    runnerUpMargin: fretlineChordCatalogNumber(value.runnerUpMargin),
    timing: fretlineChordCatalogText(value.timing, 80) || 'estimated-uniform-fit',
    chordSpellingApproximations: Math.max(0, Math.floor(fretlineChordCatalogNumber(value.chordSpellingApproximations))),
    mainGenre: fretlineChordCatalogText(value.mainGenre, 100),
  };
}

function fretlineChordCatalogChart(videoId, value, license) {
  if (!value || typeof value !== 'object') return null;
  const safeVideoId = extractYouTubeVideoId(value.videoId ?? videoId);
  if (!safeVideoId) return null;
  const raw = typeof value.raw === 'string' ? value.raw.slice(0, 60000) : '';
  let events = fretlineChordCatalogSafeEvents(value.events);
  if (!events.length && raw) {
    events = parseChordChart(raw, {
      bpm: fretlineChordCatalogNumber(value.bpm, 90),
      beatsPerChord: fretlineChordCatalogNumber(value.beatsPerChord, 4),
    });
  }
  if (!events.length) return null;
  return {
    videoId: safeVideoId,
    title: fretlineChordCatalogText(value.title, 200),
    artist: fretlineChordCatalogText(value.artist, 180),
    bpm: Math.max(20, Math.min(300, fretlineChordCatalogNumber(value.bpm, 90))),
    beatsPerChord: Math.max(.25, Math.min(64, fretlineChordCatalogNumber(value.beatsPerChord, 4))),
    raw,
    sourceUrl: sanitizeExternalUrl(value.sourceUrl) || FRETLINE_CHORD_ATTRIBUTION_URL,
    events,
    updatedAt: Math.max(0, fretlineChordCatalogNumber(value.updatedAt, Date.now())),
    bundled: true,
    license: fretlineChordCatalogText(value.license ?? license, 100) || 'CC BY-NC 4.0',
    provenance: fretlineChordCatalogProvenance(value.provenance),
  };
}

function fretlineChordCatalogUserChartsForStorage() {
  const output = {};
  for (const [videoId, chart] of Object.entries(settings.songCharts || {})) {
    if (!chart?.bundled) output[videoId] = chart;
  }
  return output;
}

saveSettings = function saveSettingsWithoutBundledChordCopies() {
  if (!Object.keys(fretlineBundledSongCharts).length) return fretlineChordCatalogBaseSaveSettings();
  const mergedCharts = settings.songCharts;
  settings.songCharts = fretlineChordCatalogUserChartsForStorage();
  try { return fretlineChordCatalogBaseSaveSettings(); }
  finally { settings.songCharts = mergedCharts; }
};

function fretlineChordCatalogActiveChart(videoId = selectedSong?.videoId) {
  return videoId ? settings.songCharts?.[videoId] ?? null : null;
}

function fretlineChordCatalogConfidenceLabel(chart) {
  const confidence = chart?.provenance?.confidence;
  return confidence ? `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence` : 'Best-effort match';
}

function fretlineChordCatalogEnsureUi() {
  if (!document.querySelector('link[data-fretline-chord-catalog-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = './styles/chord-catalog.css'; link.dataset.fretlineChordCatalogStyle = 'true';
    document.head.append(link);
  }
  if (!fretlineChordCatalogNote) {
    fretlineChordCatalogNote = document.createElement('div');
    fretlineChordCatalogNote.className = 'catalog-chart-note';
    fretlineChordCatalogNote.hidden = true;
    dom.playAlongCard.insertAdjacentElement('afterend', fretlineChordCatalogNote);
  }
  if (!fretlineChordCatalogAttribution) {
    fretlineChordCatalogAttribution = document.createElement('p');
    fretlineChordCatalogAttribution.className = 'catalog-attribution';
    fretlineChordCatalogAttribution.hidden = true;
    dom.libraryDialog.querySelector('.sheet-header')?.insertAdjacentElement('afterend', fretlineChordCatalogAttribution);
  }
}

function fretlineChordCatalogRenderAttribution() {
  fretlineChordCatalogEnsureUi();
  if (!fretlineChordCatalog) { fretlineChordCatalogAttribution.hidden = true; return; }
  const stats = fretlineChordCatalog.stats || {};
  const count = Math.max(0, Math.floor(fretlineChordCatalogNumber(stats.chartedUniqueVideos)));
  fretlineChordCatalogAttribution.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = `${count.toLocaleString()} matched chord maps`;
  const text = document.createTextNode(' · Chord sequences from ');
  const link = document.createElement('a');
  link.href = FRETLINE_CHORD_ATTRIBUTION_URL; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Chordonomicon';
  const tail = document.createTextNode(' · CC BY-NC 4.0 · change times are estimated');
  fretlineChordCatalogAttribution.append(strong, text, link, tail);
  fretlineChordCatalogAttribution.hidden = false;
}

function fretlineChordCatalogRenderNote() {
  fretlineChordCatalogEnsureUi();
  const chart = fretlineChordCatalogActiveChart();
  if (!chart) {
    fretlineChordCatalogNote.hidden = true;
    dom.findChordsButton.querySelector('span').textContent = 'Find chords';
    dom.editSongChartButton.querySelector('span').textContent = 'Edit chord map';
    return;
  }
  fretlineChordCatalogNote.replaceChildren();
  if (chart.bundled) {
    const confidence = chart.provenance?.confidence || 'low';
    const badge = document.createElement('span');
    badge.className = `catalog-confidence catalog-confidence-${confidence}`;
    badge.textContent = fretlineChordCatalogConfidenceLabel(chart);
    const copy = document.createElement('span');
    const approximate = chart.provenance?.chordSpellingApproximations
      ? ` · ${chart.provenance.chordSpellingApproximations} simplified chord spelling${chart.provenance.chordSpellingApproximations === 1 ? '' : 's'}`
      : '';
    copy.textContent = `Matched to ${chart.provenance?.spotifyArtist || chart.artist || 'the recording'} — ${chart.provenance?.spotifyTitle || chart.title || 'dataset track'}. Chord order is transcribed; play-along timing is estimated${approximate}.`;
    const source = document.createElement('a');
    source.href = chart.sourceUrl || FRETLINE_CHORD_ATTRIBUTION_URL; source.target = '_blank'; source.rel = 'noopener'; source.textContent = 'Source';
    fretlineChordCatalogNote.append(badge, copy, source);
    dom.findChordsButton.querySelector('span').textContent = 'View source';
    dom.editSongChartButton.querySelector('span').textContent = 'Adjust chart';
  } else {
    const badge = document.createElement('span'); badge.className = 'catalog-confidence catalog-confidence-personal'; badge.textContent = 'Personal chart';
    const copy = document.createElement('span'); copy.textContent = 'Your saved chord map overrides the bundled best-effort match on this device.';
    fretlineChordCatalogNote.append(badge, copy);
    dom.findChordsButton.querySelector('span').textContent = chart.sourceUrl ? 'View source' : 'Find chords';
    dom.editSongChartButton.querySelector('span').textContent = 'Edit chord map';
  }
  fretlineChordCatalogNote.hidden = false;
}

async function loadBundledChordCatalog() {
  if (fretlineChordCatalog) return fretlineChordCatalog;
  if (fretlineChordCatalogLoadPromise) return fretlineChordCatalogLoadPromise;
  const request = fetch(FRETLINE_CHORD_CATALOG_URL, { cache: 'no-cache', credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error(`Chord catalog request failed with ${response.status}.`);
      return response.json();
    })
    .then((payload) => {
      if (!payload || payload.schema !== 'fretline-chord-catalog' || typeof payload.charts !== 'object') {
        throw new Error('The bundled chord catalog is invalid.');
      }
      const license = fretlineChordCatalogText(payload.license, 100);
      if (!license) throw new Error('The bundled chord catalog has no license declaration.');
      const charts = {};
      for (const [videoId, value] of Object.entries(payload.charts)) {
        const chart = fretlineChordCatalogChart(videoId, value, license);
        if (chart) charts[chart.videoId] = chart;
      }
      if (!Object.keys(charts).length) throw new Error('The bundled chord catalog has no usable charts.');
      const userCharts = { ...(settings.songCharts || {}) };
      fretlineBundledSongCharts = charts;
      fretlineChordCatalog = payload;
      settings.songCharts = { ...charts, ...userCharts };
      saveSettings();
      renderLibrarySummary(); renderSongList(); fretlineChordCatalogRenderAttribution(); fretlineChordCatalogRenderNote();
      return payload;
    })
    .catch((error) => { console.warn('Fretline chord catalog:', error); return null; })
    .finally(() => { fretlineChordCatalogLoadPromise = null; });
  fretlineChordCatalogLoadPromise = request;
  return request;
}

catalogStatusMessage = function catalogStatusWithChordCoverage() {
  const base = fretlineChordCatalogBaseCatalogStatusMessage();
  const count = Math.max(0, Math.floor(fretlineChordCatalogNumber(fretlineChordCatalog?.stats?.chartedUniqueVideos)));
  return count ? `${base} ${count.toLocaleString()} songs include best-effort chord maps.` : base;
};

createSongRow = function createSongRowWithConfidence(track) {
  const row = fretlineChordCatalogBaseCreateSongRow(track);
  const chart = settings.songCharts?.[track.videoId];
  if (!chart?.events?.length) return row;
  const badge = row.querySelector('.charted-badge');
  if (badge && chart.bundled) {
    const confidence = chart.provenance?.confidence || 'low';
    badge.classList.add(`chart-badge-${confidence}`);
    badge.textContent = `${confidence[0].toUpperCase()}${confidence.slice(1)} · ${chart.events.length}`;
    badge.title = 'Best-effort recording match; chord timing is estimated';
  }
  return row;
};

renderPlayAlongAtCurrentTime = function renderPlayAlongWithCatalogContext(force = false) {
  fretlineChordCatalogBaseRenderPlayAlong(force);
  fretlineChordCatalogRenderNote();
};

openSongChartEditor = function openCatalogAwareSongChartEditor() {
  fretlineChordCatalogBaseOpenSongChartEditor();
  const chart = fretlineChordCatalogActiveChart();
  if (chart?.bundled && dom.songChartDialog.open) {
    dom.songChartDialog.querySelector('.eyebrow').textContent = 'Adjust best-effort chart';
  }
};

initializeSongLibrary = async function initializeLibraryWithBundledChords() {
  await fretlineChordCatalogBaseInitializeSongLibrary();
  fretlineChordCatalogEnsureUi();
  await loadBundledChordCatalog();
};
