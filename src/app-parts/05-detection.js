function sensitivityLabel(value) { return value < 35 ? 'Low' : value < 72 ? 'Normal' : 'High'; }
function minimumRms() { return 0.022 - (settings.sensitivity * 0.00018); }
function renderSettings() {
  dom.referencePitch.value = String(settings.referenceA); dom.referencePitchValue.textContent = `${settings.referenceA} Hz`; dom.sensitivity.value = String(settings.sensitivity); dom.sensitivityValue.textContent = sensitivityLabel(settings.sensitivity);
  dom.accidentalSwitch.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === settings.accidentalMode)));
  dom.vibrationToggle.checked = settings.vibration; dom.vibrationToggle.disabled = !('vibrate' in navigator); dom.wakeLockToggle.checked = settings.wakeLock; dom.wakeLockToggle.disabled = !('wakeLock' in navigator); applyTheme();
}
function setReferencePitch(value) { settings.referenceA = clamp(Math.round(Number(value)), 430, 450); renderSettings(); updateCurrentTuning(); }
function calculateRms(buffer) { let sum = 0; for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i]; return Math.sqrt(sum / buffer.length); }
function updateSignalLevel(rms) { const threshold = minimumRms(); dom.signalLevel.style.width = `${clamp(((rms - (threshold * .35)) / .095) * 100, 0, 100)}%`; }
function acceptAutoTarget(index) {
  if (index === selectedTargetIndex) { pendingAutoTarget = null; pendingAutoFrames = 0; return true; }
  if (pendingAutoTarget === index) pendingAutoFrames += 1; else { pendingAutoTarget = index; pendingAutoFrames = 1; }
  if (pendingAutoFrames < 2) return false;
  selectedTargetIndex = index; pitchHistory = []; stableTargetIndex = null; stableSince = 0; pendingAutoTarget = null; pendingAutoFrames = 0; updateActiveString(); return true;
}
function smoothCents(cents, targetIndex, now) {
  pitchHistory = pitchHistory.filter((sample) => sample.targetIndex === targetIndex && now - sample.time < 420);
  const previous = pitchHistory.length >= 3 ? median(pitchHistory.map((sample) => sample.cents)) : Number.NaN;
  if (Number.isFinite(previous) && Math.abs(cents - previous) > 38) return previous;
  pitchHistory.push({ cents, targetIndex, time: now }); if (pitchHistory.length > 7) pitchHistory.shift(); return median(pitchHistory.slice(-5).map((sample) => sample.cents));
}
function markStableString(target, cents, clarity, now) {
  if (Math.abs(cents) <= IN_TUNE_CENTS && clarity >= .72) {
    if (stableTargetIndex !== target.index) { stableTargetIndex = target.index; stableSince = now; return; }
    if (now - stableSince >= STABLE_TUNE_MS && !tunedStrings.has(target.index)) {
      tunedStrings.add(target.index); updateActiveString(); updateTunedProgress(); if (settings.vibration && 'vibrate' in navigator) navigator.vibrate(24); if (tunedStrings.size === targets.length) showToast('All strings are in tune');
    }
  } else if (Math.abs(cents) > 4.5 || stableTargetIndex !== target.index) { stableTargetIndex = target.index; stableSince = 0; }
}
function renderPitch(target, cents, normalizedFrequency, clarity, now) {
  const smoothedCents = smoothCents(cents, target.index, now); const smoothedFrequency = target.frequency * (2 ** (smoothedCents / 1200)); const direction = tuningDirection(smoothedCents, IN_TUNE_CENTS); const magnitude = Math.abs(smoothedCents); const rounded = magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude).toString();
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave); dom.pitchFrequency.textContent = `${(Number.isFinite(smoothedFrequency) ? smoothedFrequency : normalizedFrequency).toFixed(1)} Hz`; dom.pitchCents.textContent = `${smoothedCents > 0 ? '+' : smoothedCents < 0 ? '−' : ''}${rounded} cents`; dom.tunerCard.dataset.state = direction; dom.listenStatus.textContent = 'Listening'; setNeedle(smoothedCents);
  dom.pitchInstruction.textContent = direction === 'in-tune' ? 'In tune' : direction === 'flat' ? `Tune up · ${rounded} cents flat` : `Tune down · ${rounded} cents sharp`; markStableString(target, smoothedCents, clarity, now);
}
function handlePitch(pitch, now) {
  let target; let cents; let normalizedFrequency;
  if (settings.mode === 'auto') {
    const match = matchPitchToTargets(pitch.frequency, targets, { maxCents: 430, maxHarmonic: 3 }); if (!match || !acceptAutoTarget(match.target.index)) return; target = match.target; cents = match.cents; normalizedFrequency = match.normalizedFrequency;
  } else {
    target = targets[selectedTargetIndex]; const match = normalizePitchToTarget(pitch.frequency, target.frequency); if (!match || Math.abs(match.cents) > 560) return; cents = match.cents; normalizedFrequency = match.normalizedFrequency;
  }
  lastPitchAt = now; renderPitch(target, cents, normalizedFrequency, pitch.clarity, now);
}
function handleNoPitch(now) { if (lastPitchAt === 0 || now - lastPitchAt > PITCH_TIMEOUT_MS) { pitchHistory = []; stableSince = 0; setWaitingDisplay(); } }
function analysisLoop(now) {
  if (!listening) return; animationFrame = requestAnimationFrame(analysisLoop); if (tonePlaying || now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return; lastAnalysisAt = now;
  analyser.getFloatTimeDomainData(analysisBuffer); const rms = calculateRms(analysisBuffer); updateSignalLevel(rms); if (rms < minimumRms()) { handleNoPitch(now); return; }
  const frequencies = targets.map((target) => target.frequency); const minFrequency = Math.max(45, Math.min(...frequencies) * .55); const maxFrequency = Math.min(1300, Math.max(...frequencies) * 3.1);
  const pitch = detectPitchYIN(analysisBuffer, microphoneContext.sampleRate, { minFrequency, maxFrequency, minRms: minimumRms() }); if (pitch) handlePitch(pitch, now); else handleNoPitch(now);
}
