
function renderTuningList() {
  dom.tuningInstrumentLabel.textContent = currentInstrument().name; dom.tuningList.replaceChildren();
  for (const tuning of getTuningsForInstrument(settings.instrument, settings.customTunings)) {
    const row = document.createElement('div'); row.className = 'tuning-option-row';
    const option = document.createElement('button'); option.type = 'button'; option.className = 'tuning-option'; option.setAttribute('aria-current', String(tuning.id === currentTuning.id));
    option.innerHTML = '<span><strong></strong><small></small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>';
    option.querySelector('strong').textContent = tuning.name; option.querySelector('small').textContent = formatTuningNotes(tuning, settings.accidentalMode);
    option.addEventListener('click', () => { settings.tuningSelections[settings.instrument] = tuning.id; selectedTargetIndex = 0; updateCurrentTuning(); dom.tuningDialog.close(); }); row.append(option);
    if (tuning.custom) {
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'small-icon-button'; edit.setAttribute('aria-label', `Edit ${tuning.name}`); edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20ZM14.5 6.5l3 3"/></svg>'; edit.addEventListener('click', () => openCustomTuningEditor(tuning)); row.append(edit);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'small-icon-button danger'; remove.setAttribute('aria-label', `Delete ${tuning.name}`); remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'; remove.addEventListener('click', () => deleteCustomTuning(tuning)); row.append(remove);
    }
    dom.tuningList.append(row);
  }
}
function openTuningDialog() { renderTuningList(); dom.tuningDialog.showModal(); }
function openCustomTuningEditor(tuning = null) {
  editingCustomId = tuning?.custom ? tuning.id : null; const source = tuning ?? currentTuning;
  dom.customTuningTitle.textContent = tuning ? 'Edit custom tuning' : 'Custom tuning'; dom.customInstrumentLabel.textContent = `${currentInstrument().name} · ${currentInstrument().stringCount} strings`; dom.customTuningName.value = tuning?.name ?? ''; dom.customStringRows.replaceChildren();
  source.midi.forEach((midi, index) => {
    const row = document.createElement('div'); row.className = 'custom-string-row';
    const label = document.createElement('label'); label.htmlFor = `custom-note-${index}`; label.textContent = `String ${source.midi.length - index}`;
    const noteSelect = document.createElement('select'); noteSelect.className = 'note-select'; noteSelect.id = `custom-note-${index}`; noteSelect.dataset.role = 'pitch-class'; noteSelect.dataset.index = String(index);
    PITCH_CLASSES.forEach((name, pitchClass) => noteSelect.add(new Option(name, String(pitchClass), false, pitchClass === ((midi % 12) + 12) % 12)));
    const octaveSelect = document.createElement('select'); octaveSelect.className = 'note-select'; octaveSelect.setAttribute('aria-label', `Octave for string ${source.midi.length - index}`); octaveSelect.dataset.role = 'octave'; octaveSelect.dataset.index = String(index);
    for (let octave = 1; octave <= 6; octave += 1) octaveSelect.add(new Option(`Octave ${octave}`, String(octave), false, octave === octaveFromMidi(midi)));
    row.append(label, noteSelect, octaveSelect); dom.customStringRows.append(row);
  });
  if (dom.tuningDialog.open) dom.tuningDialog.close(); dom.customTuningDialog.showModal(); requestAnimationFrame(() => dom.customTuningName.focus());
}
function customId() { return globalThis.crypto?.randomUUID ? `custom-${settings.instrument}-${crypto.randomUUID()}` : `custom-${settings.instrument}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function saveCustomTuning(event) {
  event.preventDefault(); const name = dom.customTuningName.value.trim(); const count = currentInstrument().stringCount; const midi = [];
  for (let index = 0; index < count; index += 1) {
    const pitchClass = Number(dom.customStringRows.querySelector(`[data-role="pitch-class"][data-index="${index}"]`).value);
    const octave = Number(dom.customStringRows.querySelector(`[data-role="octave"][data-index="${index}"]`).value); midi.push(((octave + 1) * 12) + pitchClass);
  }
  const tuning = { id: editingCustomId ?? customId(), instrument: settings.instrument, name, description: midi.map((note) => noteNameFromMidi(note, settings.accidentalMode)).join(' '), midi, custom: true };
  if (!isValidCustomTuning(tuning)) { showToast('Give the tuning a name and valid notes.'); return; }
  const existingIndex = settings.customTunings.findIndex((item) => item.id === tuning.id); if (existingIndex >= 0) settings.customTunings.splice(existingIndex, 1, tuning); else settings.customTunings.push(tuning);
  settings.tuningSelections[settings.instrument] = tuning.id; selectedTargetIndex = 0; updateCurrentTuning(); dom.customTuningDialog.close(); showToast('Custom tuning saved');
}
function deleteCustomTuning(tuning) {
  if (!confirm(`Delete “${tuning.name}”?`)) return; settings.customTunings = settings.customTunings.filter((item) => item.id !== tuning.id);
  if (settings.tuningSelections[settings.instrument] === tuning.id) { settings.tuningSelections[settings.instrument] = currentInstrument().defaultTuningId; selectedTargetIndex = 0; updateCurrentTuning(); } else saveSettings();
  renderTuningList(); showToast('Custom tuning deleted');
}

