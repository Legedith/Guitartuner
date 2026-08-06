const VISUAL_PITCH_TIMEOUT_MS = 1250;
const PITCH_HOLD_HINT_MS = 520;
const pitchSmoother = globalThis.tunerPitchSmoother = new PitchSmoother({ windowMs: 480, maxSamples: 9, outlierCents: 24 });
const autoTargetTracker = globalThis.tunerAutoTargetTracker = new AutoTargetTracker({ strongConfirmMs: 45, weakConfirmMs: 115, minimumMargin: 18 });
let noiseFloorRms = 0.0006;

function sensitivityLabel(value) { return value < 35 ? 'Low' : value < 72 ? 'Normal' : 'High'; }
function signalThreshold() { return adaptiveRmsThreshold(settings.sensitivity, noiseFloorRms); }
function minimumRms() { return pitchDetectionRmsFloor(settings.sensitivity, noiseFloorRms); }
function renderSettings() {
  dom.referencePitch.value = String(settings.referenceA); dom.referencePitchValue.textContent = `${settings.referenceA} Hz`; dom.sensitivity.value = String(settings.sensitivity); dom.sensitivityValue.textContent = sensitivityLabel(settings.sensitivity);
  dom.accidentalSwitch.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === settings.accidentalMode)));
  dom.vibrationToggle.checked = settings.vibration; dom.vibrationToggle.disabled = !('vibrate' in navigator); dom.wakeLockToggle.checked = settings.wakeLock; dom.wakeLockToggle.disabled = !('wakeLock' in navigator); applyTheme();
}
function setReferencePitch(value) { settings.referenceA = clamp(Math.round(Number(value)), 430, 450); renderSettings(); updateCurrentTuning(); }
function calculateRms(buffer) {
  let mean = 0;
  for (let index = 0; index < buffer.length; index += 1) mean += buffer[index];
  mean /= buffer.length;
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) { const centered = buffer[index] - mean; sum += centered * centered; }
  return Math.sqrt(sum / buffer.length);
}
function updateSignalLevel(rms) {
  const threshold = Math.max(signalThreshold(), 0.00012);
  const level = clamp((Math.log2(1 + (rms / threshold)) / Math.log2(17)) * 100, 0, 100);
  dom.signalLevel.style.width = `${level}%`;
  dom.tunerCard.style.setProperty('--signal-strength', String(level / 100));
}
function acceptAutoTarget(match, now) {
  const decision = autoTargetTracker.update(match, selectedTargetIndex, now);
  if (!decision.accepted) return false;
  if (!decision.changed) return true;
  selectedTargetIndex = decision.index;
  pitchSmoother.reset();
  stableTargetIndex = null;
  stableSince = 0;
  updateActiveString();
  return true;
}
function markStableString(target, cents, clarity, now) {
  if (Math.abs(cents) <= IN_TUNE_CENTS && clarity >= .68) {
    if (stableTargetIndex !== target.index || !stableSince) { stableTargetIndex = target.index; stableSince = now; return; }
    if (now - stableSince >= STABLE_TUNE_MS && !tunedStrings.has(target.index)) {
      tunedStrings.add(target.index); updateActiveString(); updateTunedProgress(); if (settings.vibration && 'vibrate' in navigator) navigator.vibrate(24); if (tunedStrings.size === targets.length) showToast('All strings are in tune');
    }
  } else { stableTargetIndex = target.index; stableSince = 0; }
}
function renderPitch(target, cents, normalizedFrequency, clarity, now) {
  const smoothedCents = pitchSmoother.update({ cents, targetIndex: target.index, clarity, time: now });
  if (!Number.isFinite(smoothedCents)) return;
  const smoothedFrequency = target.frequency * (2 ** (smoothedCents / 1200)); const direction = tuningDirection(smoothedCents, IN_TUNE_CENTS); const magnitude = Math.abs(smoothedCents); const rounded = magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude).toString();
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave); dom.pitchFrequency.textContent = `${(Number.isFinite(smoothedFrequency) ? smoothedFrequency : normalizedFrequency).toFixed(1)} Hz`; dom.pitchCents.textContent = `${smoothedCents > 0 ? '+' : smoothedCents < 0 ? '−' : ''}${rounded} cents`; dom.tunerCard.dataset.state = direction; dom.tunerCard.dataset.confidence = clarity >= .82 ? 'high' : clarity >= .68 ? 'medium' : 'low'; dom.tunerCard.classList.remove('is-holding'); dom.listenStatus.textContent = settings.mode === 'auto' ? `Listening · string ${target.number}` : 'Listening'; setNeedle(smoothedCents, clarity);
  dom.pitchInstruction.textContent = direction === 'in-tune' ? 'In tune · let it ring' : direction === 'flat' ? `Tune up · ${rounded} cents flat` : `Tune down · ${rounded} cents sharp`; markStableString(target, smoothedCents, clarity, now);
}
function handlePitch(pitch, now) {
  let target; let cents; let normalizedFrequency;
  if (settings.mode === 'auto') {
    const match = matchPitchToTargets(pitch.frequency, targets, { maxCents: 500, maxHarmonic: 4, previousTargetIndex: selectedTargetIndex, switchPenalty: 12 });
    if (!match || !acceptAutoTarget(match, now)) return false;
    target = match.target; cents = match.cents; normalizedFrequency = match.normalizedFrequency;
  } else {
    target = targets[selectedTargetIndex]; const match = normalizePitchToTarget(pitch.frequency, target.frequency); if (!match || Math.abs(match.cents) > 560) return false; cents = match.cents; normalizedFrequency = match.normalizedFrequency;
  }
  quietSignalSince = 0; unclearSignalSince = 0; lastPitchAt = now; renderPitch(target, cents, normalizedFrequency, pitch.clarity, now); return true;
}
function handleNoPitch(now, rms = 0) {
  const threshold = signalThreshold();
  if (rms < threshold) { if (!quietSignalSince) quietSignalSince = now; unclearSignalSince = 0; }
  else { if (!unclearSignalSince) unclearSignalSince = now; quietSignalSince = 0; }
  if (lastPitchAt !== 0 && now - lastPitchAt <= VISUAL_PITCH_TIMEOUT_MS) {
    if (now - lastPitchAt > PITCH_HOLD_HINT_MS) { dom.tunerCard.classList.add('is-holding'); dom.listenStatus.textContent = 'Listening · note fading'; }
    return;
  }
  pitchSmoother.reset(); autoTargetTracker.reset(); stableSince = 0; setWaitingDisplay();
  if (quietSignalSince && now - quietSignalSince > 2200) {
    dom.listenStatus.textContent = 'Listening · no string heard';
    dom.pitchInstruction.textContent = 'Move closer and pluck one string cleanly';
  } else if (unclearSignalSince && now - unclearSignalSince > 1500) {
    dom.listenStatus.textContent = 'Listening · unclear pitch';
    dom.pitchInstruction.textContent = 'Mute the other strings and reduce background noise';
  }
}
function analysisLoop(now) {
  if (!listening) return; animationFrame = requestAnimationFrame(analysisLoop); if (tonePlaying || chordSoundPlaying || now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return; lastAnalysisAt = now;
  analyser.getFloatTimeDomainData(analysisBuffer); const rms = calculateRms(analysisBuffer); updateSignalLevel(rms);
  const detectionFloor = minimumRms();
  if (rms < detectionFloor) { noiseFloorRms = updateAdaptiveNoiseFloor(noiseFloorRms, rms); handleNoPitch(now, rms); return; }
  const frequencies = targets.map((target) => target.frequency); const minFrequency = Math.max(45, Math.min(...frequencies) * .55); const maxFrequency = Math.min(1300, Math.max(...frequencies) * 3.1);
  const pitch = detectPitchYIN(analysisBuffer, microphoneContext.sampleRate, { minFrequency, maxFrequency, minRms: detectionFloor, minClarity: .57, threshold: .16 });
  noiseFloorRms = updateAdaptiveNoiseFloor(noiseFloorRms, rms, { pitched: Boolean(pitch) });
  if (!pitch || !handlePitch(pitch, now)) handleNoPitch(now, rms);
}
