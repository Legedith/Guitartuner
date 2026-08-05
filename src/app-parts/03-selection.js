function resetPitchTracking() { pitchHistory = []; lastPitchAt = 0; stableTargetIndex = null; stableSince = 0; pendingAutoTarget = null; pendingAutoFrames = 0; }
function setNeedle(cents = 0) { dom.meterNeedle.style.left = `${50 + ((clamp(cents, -50, 50) / 50) * 45)}%`; }
function setWaitingDisplay() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave); dom.pitchFrequency.textContent = '— Hz'; dom.pitchCents.textContent = '— cents';
  dom.pitchInstruction.textContent = listening ? (settings.mode === 'auto' ? 'Play one string at a time' : `Play string ${target.number} · ${targetLabel(target)}`) : 'Ready when you are';
  dom.tunerCard.dataset.state = listening ? 'listening' : 'idle'; dom.listenStatus.textContent = listening ? 'Listening' : 'Microphone is off'; setNeedle(0);
}
function updateCurrentTuning({ resetProgress = true } = {}) {
  ensureCurrentTuning(); targets = buildTargetStrings(currentTuning, settings.referenceA, settings.accidentalMode);
  selectedTargetIndex = clamp(selectedTargetIndex, 0, Math.max(0, targets.length - 1)); if (resetProgress) tunedStrings = new Set();
  resetPitchTracking(); updateInstrumentControls(); updateTuningSummary(); updateModeControl(); renderStrings(); setWaitingDisplay(); saveSettings();
}
function selectString(index, switchToManual = false) {
  if (!targets[index]) return; selectedTargetIndex = index; if (switchToManual) settings.mode = 'manual';
  resetPitchTracking(); updateModeControl(); updateActiveString(); setWaitingDisplay(); saveSettings();
}
function setInstrument(instrument) {
  if (!Object.hasOwn(INSTRUMENTS, instrument) || instrument === settings.instrument) return;
  stopReferenceTone(); settings.instrument = instrument; selectedTargetIndex = 0; tunedStrings = new Set(); updateCurrentTuning();
}
function setMode(mode) { settings.mode = mode === 'manual' ? 'manual' : 'auto'; resetPitchTracking(); updateModeControl(); setWaitingDisplay(); saveSettings(); }
