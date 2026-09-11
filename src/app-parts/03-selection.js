function resetPitchTracking() {
  lastPitchAt = 0;
  quietSignalSince = 0;
  unclearSignalSince = 0;
  globalThis.tunerPitchSmoother?.reset();
  globalThis.tunerAutoTargetTracker?.reset();
  globalThis.tunerStabilityTracker?.reset();
  globalThis.tunerDetuneTracker?.reset();
  dom.tunerCard.classList.remove('is-holding');
}
function setNeedle(cents = Number.NaN, clarity = 0) {
  const active = Number.isFinite(cents);
  const clampedCents = active ? clamp(cents, -50, 50) : 0;
  dom.tunerCard.style.setProperty('--needle-position', `${50 + clampedCents}%`);
  dom.tunerCard.dataset.offscale = active && Math.abs(cents) > 50 ? (cents < 0 ? 'flat' : 'sharp') : 'none';
  dom.tunerCard.style.setProperty('--pitch-confidence', String(clamp(Number(clarity) || 0, 0, 1)));
  dom.meterNeedle.classList.toggle('is-active', active);
}
function setWaitingDisplay() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave); dom.pitchFrequency.textContent = '— Hz'; dom.pitchCents.textContent = '— cents';
  dom.pitchInstruction.textContent = listening ? (settings.mode === 'auto' ? 'Play any string · no tapping needed' : `Play string ${target.number} · ${targetLabel(target)}`) : 'Ready when you are';
  dom.pitchDetail.textContent = listening ? 'Pluck once, then let the note settle.' : 'Pluck one open string at a time.';
  dom.signalQuality.textContent = listening ? 'Waiting' : 'Mic off';
  dom.tunerCard.dataset.clipping = 'false';
  updateTargetDetails();
  dom.tunerCard.dataset.state = listening ? 'listening' : 'idle'; dom.tunerCard.dataset.confidence = 'none'; dom.tunerCard.classList.remove('is-holding'); dom.listenStatus.textContent = listening ? 'Listening' : 'Microphone is off'; setNeedle();
  if (listening && microphoneInterrupted) {
    dom.tunerCard.dataset.state = 'paused'; dom.listenStatus.textContent = 'Microphone paused';
    dom.pitchInstruction.textContent = 'Audio input interrupted'; dom.pitchDetail.textContent = 'Stop and restart the tuner when your microphone is available.';
    dom.signalQuality.textContent = 'Paused';
  } else if (microphoneBusy && !listening) {
    dom.listenStatus.textContent = 'Waiting for microphone'; dom.pitchInstruction.textContent = 'Allow microphone access';
    dom.pitchDetail.textContent = 'Your audio stays on this device. You can cancel at any time.';
  }
}
function updateCurrentTuning({ resetProgress = true } = {}) {
  stopReferenceTone(); stopChordSound?.(); ensureCurrentTuning(); targets = buildTargetStrings(currentTuning, settings.referenceA, settings.accidentalMode);
  selectedTargetIndex = clamp(selectedTargetIndex, 0, Math.max(0, targets.length - 1)); if (resetProgress) tunedStrings = new Set();
  resetPitchTracking(); configureAnalysis(); updateInstrumentControls(); updateTuningSummary(); updateModeControl(); renderStrings(); setWaitingDisplay(); saveSettings();
  if (dom.chordDialog.open) renderChordLibrary();
  if (!dom.playAlongView.hidden) renderPlayAlongAtCurrentTime?.();
}
function selectString(index) {
  if (!targets[index]) return; stopReferenceTone({ updateDisplay: false }); selectedTargetIndex = index;
  resetPitchTracking(); updateModeControl(); updateActiveString(); setWaitingDisplay(); saveSettings();
}
function setInstrument(instrument) {
  if (!Object.hasOwn(INSTRUMENTS, instrument) || instrument === settings.instrument) return;
  stopReferenceTone(); stopChordSound?.(); settings.instrument = instrument; selectedTargetIndex = 0; tunedStrings = new Set(); updateCurrentTuning();
}
function setMode(mode) { stopReferenceTone({ updateDisplay: false }); settings.mode = mode === 'manual' ? 'manual' : 'auto'; resetPitchTracking(); updateModeControl(); updateActiveString(); setWaitingDisplay(); saveSettings(); }
