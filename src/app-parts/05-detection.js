const VISUAL_PITCH_TIMEOUT_MS = 1250;
const PITCH_HOLD_HINT_MS = 220;
const pitchSmoother = globalThis.tunerPitchSmoother = new PitchSmoother();
const autoTargetTracker = globalThis.tunerAutoTargetTracker = new AutoTargetTracker({ strongConfirmMs: 45, weakConfirmMs: 115, minimumMargin: 18 });
let noiseFloorRms = 0.0006;

function sensitivityLabel(value) { return value < 35 ? 'Low' : value < 72 ? 'Normal' : 'High'; }
function signalThreshold() { return adaptiveRmsThreshold(settings.sensitivity, noiseFloorRms); }
function minimumRms() { return pitchDetectionRmsFloor(settings.sensitivity, noiseFloorRms); }
function renderSettings() {
  dom.calibrationButton.textContent = `A4 · ${settings.referenceA} Hz`; dom.calibrationButton.dataset.adjusted = String(settings.referenceA !== 440); dom.calibrationButton.setAttribute('aria-label', `Concert pitch A4, ${settings.referenceA} hertz. Open settings`);
  dom.referencePitch.setAttribute('aria-valuetext', `${settings.referenceA} hertz`); dom.sensitivity.setAttribute('aria-valuetext', `${settings.sensitivity} percent, ${sensitivityLabel(settings.sensitivity)}`);
  dom.referencePitch.value = String(settings.referenceA); dom.referencePitchValue.textContent = `${settings.referenceA} Hz`; dom.sensitivity.value = String(settings.sensitivity); dom.sensitivityValue.textContent = sensitivityLabel(settings.sensitivity);
  dom.accidentalSwitch.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === settings.accidentalMode)));
  dom.vibrationToggle.checked = settings.vibration; dom.vibrationToggle.disabled = !('vibrate' in navigator); dom.wakeLockToggle.checked = settings.wakeLock; dom.wakeLockToggle.disabled = !('wakeLock' in navigator); applyTheme();
}
function setReferencePitch(value) { if (!Number.isFinite(Number(value))) return; settings.referenceA = clamp(Math.round(Number(value)), 430, 450); renderSettings(); updateCurrentTuning(); }
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
function configureAnalysis() {
  if (!analyser || !microphoneContext || !targets.length) return;
  const lowest = Math.min(...targets.map((target) => target.frequency));
  const minimum = Math.max(20, lowest * .7);
  const requiredSamples = microphoneContext.sampleRate * Math.max(.085, 3 / minimum);
  analyser.fftSize = Math.min(32768, Math.max(2048, 2 ** Math.ceil(Math.log2(requiredSamples))));
  analysisBuffer = new Float32Array(analyser.fftSize);
}
function acceptAutoTarget(match, now) {
  const decision = autoTargetTracker.update(match, selectedTargetIndex, now);
  if (!decision.accepted) return false;
  if (!decision.changed) return true;
  selectedTargetIndex = decision.index;
  pitchSmoother.reset(); stabilityTracker.reset(); detuneTracker.reset(); updateActiveString();
  return true;
}
const stabilityTracker = globalThis.tunerStabilityTracker = new TuningStabilityTracker({ holdMs: STABLE_TUNE_MS, maxGapMs: 150, minClarity: .82, threshold: IN_TUNE_CENTS });
const detuneTracker = globalThis.tunerDetuneTracker = {
  targetIndex: null, since: null, lastTime: null,
  reset() { this.targetIndex = null; this.since = null; this.lastTime = null; },
};
function markStableString(target, cents, clarity, now, valid = true) {
  const result = stabilityTracker.update({ targetIndex: target.index, cents, clarity, time: now, valid });
  // Completion follows unsmoothed measurements; the needle may be smoothed for readability.
  if (result.justStable && !tunedStrings.has(target.index)) {
    tunedStrings.add(target.index); updateActiveString(); updateTunedProgress();
    if (settings.vibration && 'vibrate' in navigator) navigator.vibrate(24);
    announceTuner(`String ${target.number}, ${targetLabel(target)}, confirmed in tune.`, now, true);
    if (tunedStrings.size === targets.length) showToast('Every string checked. Try one final pass.');
  }
  // A wider exit band and short dwell avoid revoking a check on a single attack transient.
  if (valid && clarity >= .82 && Math.abs(cents) > 6 && tunedStrings.has(target.index)) {
    if (detuneTracker.targetIndex !== target.index || detuneTracker.lastTime === null || now - detuneTracker.lastTime > 150) {
      detuneTracker.targetIndex = target.index; detuneTracker.since = now;
    }
    detuneTracker.lastTime = now;
    if (now - detuneTracker.since >= 300) {
      tunedStrings.delete(target.index); updateActiveString(); updateTunedProgress(); detuneTracker.reset();
      announceTuner(`String ${target.number} has drifted. Check it again.`, now, true);
    }
  } else detuneTracker.reset();
  return result;
}
function renderPitch(target, cents, frequency, clarity, now, ambiguous = false) {
  const smoothedCents = pitchSmoother.update({ cents, targetIndex: target.index, clarity, time: now });
  if (!Number.isFinite(smoothedCents)) return;
  const stable = markStableString(target, cents, clarity, now, !ambiguous);
  // Do not say "in tune" while smoothing is catching up with an actual correction.
  const guidanceCents = Math.abs(smoothedCents) <= IN_TUNE_CENTS && Math.abs(cents) > 6 ? cents : smoothedCents;
  const direction = tuningDirection(guidanceCents, IN_TUNE_CENTS);
  const magnitude = Math.abs(smoothedCents);
  const rounded = magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude).toString();
  dom.pitchNote.textContent = target.note; dom.pitchOctave.textContent = String(target.octave);
  dom.pitchFrequency.textContent = `${frequency.toFixed(1)} Hz`;
  dom.pitchCents.textContent = `${smoothedCents > 0 ? '+' : smoothedCents < 0 ? '−' : ''}${rounded} cents`;
  dom.tunerCard.dataset.state = direction === 'in-tune' && !stable.stable ? 'listening' : direction;
  dom.tunerCard.dataset.confidence = clarity >= .9 ? 'high' : clarity >= .82 ? 'medium' : 'low';
  dom.tunerCard.classList.remove('is-holding'); dom.listenStatus.textContent = settings.mode === 'auto' ? 'Auto · listening' : 'Manual · listening';
  dom.signalQuality.textContent = clarity >= .9 ? 'Clear note' : clarity >= .82 ? 'Good signal' : 'Unsteady';
  setNeedle(smoothedCents, clarity);
  dom.pitchInstruction.textContent = direction === 'in-tune' ? (stable.stable ? 'In tune' : 'Hold steady') : direction === 'flat' ? 'Tune up' : 'Tune down';
  dom.pitchDetail.textContent = direction === 'in-tune' ? (stable.stable ? 'String checked. Move to the next one.' : 'Let the note settle inside the green band.') : `${direction === 'flat' ? 'Raise' : 'Lower'} the pitch${magnitude > 50 ? ' · beyond the 50-cent scale' : ' toward the center'}.`;
  if (clarity < .82) { dom.pitchInstruction.textContent = 'Pluck again'; dom.pitchDetail.textContent = 'The note is not clear enough to check. Mute the other strings.'; dom.tunerCard.dataset.state = 'listening'; }
  if (ambiguous) { dom.pitchInstruction.textContent = 'Use Manual for this note'; dom.pitchDetail.textContent = 'These strings share a pitch. Select and check each one.'; dom.tunerCard.dataset.state = 'listening'; }
  announceTuner(`String ${target.number}, ${targetLabel(target)}. ${dom.pitchInstruction.textContent}.`, now);
}
function handlePitch(pitch, now) {
  let target; let cents;
  if (settings.mode === 'auto') {
    const match = matchPitchToTargets(pitch.frequency, targets, { maxCents: 500, previousTargetIndex: selectedTargetIndex, switchPenalty: 18 });
    if (!match) return false;
    if (!acceptAutoTarget(match, now)) {
      stabilityTracker.reset(); detuneTracker.reset(); setNeedle();
      dom.tunerCard.dataset.state = 'listening'; dom.listenStatus.textContent = 'Finding string';
      dom.pitchFrequency.textContent = `${pitch.frequency.toFixed(1)} Hz`; dom.pitchCents.textContent = '— cents';
      dom.pitchInstruction.textContent = 'Let it ring'; dom.pitchDetail.textContent = 'Confirming the string before measuring.';
      return true;
    }
    target = match.target; cents = match.cents;
  } else {
    target = targets[selectedTargetIndex];
    const match = comparePitchToTarget(pitch.frequency, target.frequency);
    if (!match) return false;
    cents = match.cents;
    if (Math.abs(cents) > 600) {
      stabilityTracker.reset(); detuneTracker.reset(); pitchSmoother.reset(); lastPitchAt = 0;
      dom.tunerCard.dataset.state = 'listening'; setNeedle();
      dom.pitchFrequency.textContent = `${pitch.frequency.toFixed(1)} Hz`; dom.pitchCents.textContent = '— cents';
      const heard = formatMidiNote(frequencyToMidi(pitch.frequency, settings.referenceA), settings.accidentalMode, currentTuning.preferFlats);
      dom.listenStatus.textContent = 'Different note heard'; dom.pitchInstruction.textContent = `Hearing ${heard}`;
      dom.pitchDetail.textContent = `Check string ${target.number} (${targetLabel(target)}). Pluck it open and mute the others.`;
      dom.signalQuality.textContent = 'Check string';
      announceTuner(`Hearing ${heard}. Check string ${target.number}, ${targetLabel(target)}.`, now);
      return true;
    }
  }
  const ambiguous = settings.mode === 'auto' && targets.filter((item) => Math.abs(centsBetween(item.frequency, target.frequency)) < .1).length > 1;
  quietSignalSince = 0; unclearSignalSince = 0; lastPitchAt = now;
  renderPitch(target, cents, pitch.frequency, pitch.clarity, now, ambiguous); return true;
}
function handleNoPitch(now, rms = 0) {
  // A held visual is never evidence of a continuing note.
  stabilityTracker.reset(); detuneTracker.reset(); autoTargetTracker.reset();
  const threshold = signalThreshold();
  if (rms < threshold) { if (!quietSignalSince) quietSignalSince = now; unclearSignalSince = 0; }
  else { if (!unclearSignalSince) unclearSignalSince = now; quietSignalSince = 0; }
  if (lastPitchAt !== 0 && now - lastPitchAt <= VISUAL_PITCH_TIMEOUT_MS) {
    dom.tunerCard.classList.add('is-holding'); dom.tunerCard.dataset.state = 'listening';
    dom.signalQuality.textContent = 'No clear note';
    if (now - lastPitchAt > PITCH_HOLD_HINT_MS) {
      dom.listenStatus.textContent = 'Last reading · fading'; dom.pitchInstruction.textContent = 'Pluck again';
      dom.pitchDetail.textContent = 'The faded needle shows the last reading.';
    } else { dom.pitchInstruction.textContent = 'Let it ring'; dom.pitchDetail.textContent = 'Waiting for a clear note.'; }
    return;
  }
  pitchSmoother.reset(); setWaitingDisplay();
  if (quietSignalSince && now - quietSignalSince > 1600) {
    dom.listenStatus.textContent = 'No string heard'; dom.pitchInstruction.textContent = 'Pluck one string';
    dom.pitchDetail.textContent = 'Move closer, or raise sensitivity in Settings.'; dom.signalQuality.textContent = 'Quiet';
  } else if (unclearSignalSince && now - unclearSignalSince > 1000) {
    dom.listenStatus.textContent = 'Unclear pitch'; dom.pitchInstruction.textContent = 'Mute the other strings';
    dom.pitchDetail.textContent = 'Pluck once and reduce background noise.'; dom.signalQuality.textContent = 'Unclear';
  }
  announceTuner(dom.pitchInstruction.textContent, now);
}
function analysisLoop(now) {
  if (!listening) return;
  animationFrame = requestAnimationFrame(analysisLoop);
  if (microphoneInterrupted || document.visibilityState !== 'visible') return;
  if (tonePlaying || chordSoundPlaying) return;
  if (now < playbackGuardUntil) {
    dom.listenStatus.textContent = 'Reference fading'; dom.pitchInstruction.textContent = 'Wait for the reference to fade';
    dom.pitchDetail.textContent = 'Then pluck your string.'; dom.signalQuality.textContent = 'Paused'; return;
  }
  if (now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return;
  lastAnalysisAt = now;
  analyser.getFloatTimeDomainData(analysisBuffer);
  const rms = calculateRms(analysisBuffer); updateSignalLevel(rms);
  let clipped = 0;
  for (const sample of analysisBuffer) if (Math.abs(sample) >= .98) clipped += 1;
  dom.tunerCard.dataset.clipping = String(clipped > analysisBuffer.length * .005);
  if (dom.tunerCard.dataset.clipping === 'true') {
    handleNoPitch(now, rms); dom.tunerCard.dataset.clipping = 'true';
    dom.pitchInstruction.textContent = 'Input too loud'; dom.pitchDetail.textContent = 'Move away from the microphone or lower input gain.';
    dom.signalQuality.textContent = 'Clipping'; announceTuner(dom.pitchDetail.textContent, now); return;
  }
  const detectionFloor = minimumRms();
  if (rms < detectionFloor) { noiseFloorRms = updateAdaptiveNoiseFloor(noiseFloorRms, rms); handleNoPitch(now, rms); return; }
  const frequencies = targets.map((target) => target.frequency);
  const minFrequency = Math.max(20, Math.min(...frequencies) * .7);
  const maxFrequency = Math.min(microphoneContext.sampleRate / 4, Math.max(...frequencies) * 1.6);
  const pitch = detectPitchYIN(analysisBuffer, microphoneContext.sampleRate, { minFrequency, maxFrequency, minRms: detectionFloor, minClarity: .7, threshold: .12 });
  noiseFloorRms = updateAdaptiveNoiseFloor(noiseFloorRms, rms, { pitched: Boolean(pitch) });
  if (!pitch || !handlePitch(pitch, now)) handleNoPitch(now, rms);
}
