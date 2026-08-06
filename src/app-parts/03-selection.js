function resetPitchTracking() {
  pitchHistory = [];
  lastPitchAt = 0;
  stableTargetIndex = null;
  stableSince = 0;
  pendingAutoTarget = null;
  pendingAutoFrames = 0;
  quietSignalSince = 0;
  unclearSignalSince = 0;
  globalThis.tunerPitchSmoother?.reset();
  globalThis.tunerAutoTargetTracker?.reset();
  dom.tunerCard.classList.remove('is-holding');
}
function setNeedle(cents = Number.NaN, clarity = 0) {
  const active = Number.isFinite(cents);
  const clampedCents = active ? clamp(cents, -50, 50) : 0;
  dom.tunerCard.style.setProperty('--needle-angle', `${(clampedCents / 50) * 46}deg`);
  dom.tunerCard.style.setProperty('--needle-position', `${50 + ((clampedCents / 50) * 43)}%`);
  dom.tunerCard.style.setProperty('--pitch-confidence', String(clamp(Number(clarity) || 0, 0, 1)));
  dom.meterNeedle.classList.toggle('is-active', active);
}
function setWaitingDisplay() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave); dom.pitchFrequency.textContent = '— Hz'; dom.pitchCents.textContent = '— cents';
  dom.pitchInstruction.textContent = listening ? (settings.mode === 'auto' ? 'Play any string · no tapping needed' : `Play string ${target.number} · ${targetLabel(target)}`) : 'Ready when you are';
  dom.tunerCard.dataset.state = listening ? 'listening' : 'idle'; dom.tunerCard.dataset.confidence = 'none'; dom.tunerCard.classList.remove('is-holding'); dom.listenStatus.textContent = listening ? 'Listening' : 'Microphone is off'; setNeedle();
}
function updateCurrentTuning({ resetProgress = true } = {}) {
  stopReferenceTone(); stopChordSound?.(); ensureCurrentTuning(); targets = buildTargetStrings(currentTuning, settings.referenceA, settings.accidentalMode);
  selectedTargetIndex = clamp(selectedTargetIndex, 0, Math.max(0, targets.length - 1)); if (resetProgress) tunedStrings = new Set();
  resetPitchTracking(); updateInstrumentControls(); updateTuningSummary(); updateModeControl(); renderStrings(); setWaitingDisplay(); saveSettings();
  if (dom.chordDialog.open) renderChordLibrary();
  if (!dom.playAlongView.hidden) renderPlayAlongAtCurrentTime?.();
}
function selectString(index) {
  if (!targets[index]) return; selectedTargetIndex = index;
  resetPitchTracking(); updateModeControl(); updateActiveString(); setWaitingDisplay(); saveSettings();
}
function setInstrument(instrument) {
  if (!Object.hasOwn(INSTRUMENTS, instrument) || instrument === settings.instrument) return;
  stopReferenceTone(); stopChordSound?.(); settings.instrument = instrument; selectedTargetIndex = 0; tunedStrings = new Set(); updateCurrentTuning();
}
function setMode(mode) { settings.mode = mode === 'manual' ? 'manual' : 'auto'; resetPitchTracking(); updateModeControl(); setWaitingDisplay(); saveSettings(); }
