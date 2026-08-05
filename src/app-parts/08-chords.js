const SVG_NS = 'http://www.w3.org/2000/svg';
const ESSENTIAL_CHORDS = Object.freeze(['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm', 'Bm', 'A7', 'E7']);

function chordAccidentalMode() { return settings.accidentalMode === 'flats' ? 'flats' : 'sharps'; }
function currentChordSymbol() { return formatChordSymbol(settings.chordRoot, settings.chordQuality, chordAccidentalMode()); }
function currentChordVoicing() { return chordVoicings[chordVoicingIndex] ?? null; }

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function createChordDiagramElement(voicing, tuningMidi, options = {}) {
  const compact = Boolean(options.compact);
  const width = compact ? 190 : 280;
  const height = compact ? 210 : 285;
  const left = compact ? 31 : 45;
  const right = compact ? 159 : 235;
  const top = compact ? 35 : 45;
  const bottom = compact ? 176 : 235;
  const stringCount = tuningMidi.length;
  const stringGap = stringCount > 1 ? (right - left) / (stringCount - 1) : 0;
  const visibleFrets = 5;
  const fretGap = (bottom - top) / visibleFrets;
  const startFret = voicing.baseFret > 1 ? voicing.baseFret : 1;
  const mode = chordAccidentalMode();
  const symbolLabel = options.symbol || currentChordSymbol();
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${symbolLabel} chord diagram, ${voicing.position}` });
  const title = svgNode('title'); title.textContent = `${symbolLabel} · ${voicing.position}`; svg.append(title);

  for (let row = 0; row <= visibleFrets; row += 1) {
    const y = top + (row * fretGap);
    svg.append(svgNode('line', { x1: left, y1: y, x2: right, y2: y, class: row === 0 && startFret === 1 ? 'fretboard-nut' : 'fretboard-line' }));
  }
  for (let stringIndex = 0; stringIndex < stringCount; stringIndex += 1) {
    const x = left + (stringIndex * stringGap);
    svg.append(svgNode('line', { x1: x, y1: top, x2: x, y2: bottom, class: 'fretboard-line' }));
  }

  if (startFret > 1) {
    const label = svgNode('text', { x: left - (compact ? 10 : 15), y: top + (fretGap * .62), class: 'fretboard-label', 'text-anchor': 'end' });
    label.textContent = `${startFret}fr`;
    svg.append(label);
  }

  for (const barre of voicing.barres ?? []) {
    if (barre.fret < startFret || barre.fret >= startFret + visibleFrets) continue;
    const fromX = left + (barre.fromString * stringGap);
    const toX = left + (barre.toString * stringGap);
    const y = top + ((barre.fret - startFret + .5) * fretGap);
    svg.append(svgNode('rect', { x: Math.min(fromX, toX) - 7, y: y - 8, width: Math.abs(toX - fromX) + 14, height: 16, rx: 8, class: 'fretboard-barre' }));
  }

  voicing.frets.forEach((fret, stringIndex) => {
    const x = left + (stringIndex * stringGap);
    if (fret < 0) {
      const marker = svgNode('text', { x, y: top - 15, class: 'fretboard-muted', 'text-anchor': 'middle' }); marker.textContent = '×'; svg.append(marker); return;
    }
    if (fret === 0) {
      svg.append(svgNode('circle', { cx: x, cy: top - 17, r: compact ? 5 : 6, class: 'fretboard-open' })); return;
    }
    if (fret < startFret || fret >= startFret + visibleFrets) return;
    const y = top + ((fret - startFret + .5) * fretGap);
    svg.append(svgNode('circle', { cx: x, cy: y, r: compact ? 9 : 11, class: 'fretboard-dot' }));
    const finger = voicing.fingers?.[stringIndex];
    if (finger) { const label = svgNode('text', { x, y, class: 'fretboard-finger' }); label.textContent = String(finger); svg.append(label); }
  });

  tuningMidi.forEach((midi, stringIndex) => {
    const label = svgNode('text', { x: left + (stringIndex * stringGap), y: bottom + (compact ? 21 : 25), class: 'fretboard-string-name' });
    label.textContent = noteNameFromMidi(midi, mode);
    svg.append(label);
  });
  return svg;
}

function renderChordDiagramForSymbol(container, symbol, options = {}) {
  container.replaceChildren();
  const parsed = parseChordSymbol(symbol);
  if (!parsed || parsed.rest) {
    const empty = document.createElement('div'); empty.className = 'chord-empty'; empty.innerHTML = '<strong>Rest</strong><span>No chord here</span>'; container.append(empty); return null;
  }
  const tuningMidi = options.tuningMidi ?? currentTuning?.midi;
  if (!Array.isArray(tuningMidi)) return null;
  const voicings = generateChordVoicings(tuningMidi, parsed.root, parsed.quality, { limit: options.limit ?? 6, maxFret: options.maxFret ?? 12, bassPitchClass: parsed.slashBass });
  const voicing = voicings[Math.min(options.voicingIndex ?? 0, Math.max(0, voicings.length - 1))] ?? null;
  if (!voicing) {
    const empty = document.createElement('div'); empty.className = 'chord-empty'; empty.innerHTML = '<strong>No practical shape found</strong><span>Try another voicing or tuning.</span>'; container.append(empty); return null;
  }
  container.append(createChordDiagramElement(voicing, tuningMidi, { ...options, symbol }));
  return voicing;
}

function populateChordSelectors() {
  dom.chordRootSelect.replaceChildren();
  for (let root = 0; root < 12; root += 1) dom.chordRootSelect.add(new Option(noteNameFromPitchClass(root, chordAccidentalMode()), String(root), false, root === settings.chordRoot));
  dom.chordQualitySelect.replaceChildren();
  for (const quality of CHORD_QUALITIES) dom.chordQualitySelect.add(new Option(quality.label, quality.id, false, quality.id === settings.chordQuality));
}

function renderEssentialChords() {
  dom.essentialChordList.replaceChildren();
  for (const symbol of ESSENTIAL_CHORDS) {
    const parsed = parseChordSymbol(symbol); if (!parsed) continue;
    const display = formatChordSymbol(parsed.root, parsed.quality, chordAccidentalMode());
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chord-chip'; button.dataset.chord = display; button.textContent = display;
    button.setAttribute('aria-current', String(parsed.root === settings.chordRoot && parsed.quality === settings.chordQuality));
    dom.essentialChordList.append(button);
  }
}

function renderChordNotes(voicing) {
  dom.chordNotes.replaceChildren();
  if (!voicing) return;
  const seen = new Set();
  for (const midi of voicing.noteMidis.filter(Number.isFinite)) {
    const label = noteNameFromMidi(midi, chordAccidentalMode()); if (seen.has(label)) continue; seen.add(label);
    const chip = document.createElement('span'); chip.textContent = label; dom.chordNotes.append(chip);
  }
}

function updateChordPlayButton() {
  const label = dom.playChordButton?.querySelector('span');
  if (label) label.textContent = chordSoundPlaying ? 'Stop chord' : 'Play chord';
  if (dom.playChordButton) dom.playChordButton.setAttribute('aria-pressed', String(chordSoundPlaying));
}

function renderChordLibrary(symbol = null) {
  if (!currentTuning) return;
  if (symbol) {
    const parsed = parseChordSymbol(symbol);
    if (parsed && !parsed.rest) { settings.chordRoot = parsed.root; settings.chordQuality = parsed.quality; chordVoicingIndex = 0; }
  }
  populateChordSelectors();
  chordVoicings = generateChordVoicings(currentTuning.midi, settings.chordRoot, settings.chordQuality, { limit: 8, maxFret: 12 });
  chordVoicingIndex = clamp(chordVoicingIndex, 0, Math.max(0, chordVoicings.length - 1));
  const voicing = currentChordVoicing();
  const symbolText = currentChordSymbol();
  dom.chordInstrumentLabel.textContent = `${currentInstrument().name} · ${currentTuning.name}`;
  dom.chordName.textContent = symbolText;
  dom.chordVoicingLabel.textContent = voicing?.position ?? 'No playable shape';
  dom.chordVoicingCount.textContent = chordVoicings.length ? `${chordVoicingIndex + 1} of ${chordVoicings.length}` : '0 voicings';
  dom.previousVoicingButton.disabled = chordVoicings.length < 2;
  dom.nextVoicingButton.disabled = chordVoicings.length < 2;
  dom.playChordButton.disabled = !voicing;
  dom.chordDiagram.replaceChildren();
  if (voicing) dom.chordDiagram.append(createChordDiagramElement(voicing, currentTuning.midi, { symbol: symbolText }));
  else { const empty = document.createElement('div'); empty.className = 'chord-empty'; empty.innerHTML = '<strong>No practical shape found</strong><span>Try another chord or tuning.</span>'; dom.chordDiagram.append(empty); }
  renderChordNotes(voicing); renderEssentialChords(); updateChordPlayButton(); saveSettings();
}

function openChordLibrary(symbol = null) {
  stopReferenceTone(); stopChordSound(); renderChordLibrary(symbol); dom.chordDialog.showModal();
}

function changeChordVoicing(delta) {
  if (chordVoicings.length < 2) return;
  stopChordSound(); chordVoicingIndex = (chordVoicingIndex + delta + chordVoicings.length) % chordVoicings.length; renderChordLibrary();
}

async function playCurrentChord() {
  if (chordSoundPlaying) { stopChordSound(); return; }
  const voicing = currentChordVoicing(); if (voicing) await playChordVoicingSound(voicing, currentTuning.midi, settings.instrument);
}

function initializeChordLibrary() { populateChordSelectors(); renderEssentialChords(); }

function bindChordEvents() {
  dom.chordsButton.addEventListener('click', () => openChordLibrary()); dom.readyChordsButton.addEventListener('click', () => openChordLibrary());
  dom.chordRootSelect.addEventListener('change', () => { settings.chordRoot = Number(dom.chordRootSelect.value); chordVoicingIndex = 0; stopChordSound(); renderChordLibrary(); });
  dom.chordQualitySelect.addEventListener('change', () => { settings.chordQuality = dom.chordQualitySelect.value; chordVoicingIndex = 0; stopChordSound(); renderChordLibrary(); });
  dom.previousVoicingButton.addEventListener('click', () => changeChordVoicing(-1)); dom.nextVoicingButton.addEventListener('click', () => changeChordVoicing(1)); dom.playChordButton.addEventListener('click', playCurrentChord);
  dom.essentialChordList.addEventListener('click', (event) => { const button = event.target.closest('button[data-chord]'); if (!button) return; const parsed = parseChordSymbol(button.dataset.chord); if (!parsed) return; settings.chordRoot = parsed.root; settings.chordQuality = parsed.quality; chordVoicingIndex = 0; stopChordSound(); renderChordLibrary(); });
  dom.chordDialog.addEventListener('close', stopChordSound);
}
