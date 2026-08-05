function microphoneErrorMessage(error) {
  if (!window.isSecureContext) return 'Microphone access requires HTTPS.';
  switch (error?.name) { case 'NotAllowedError': return 'Microphone blocked. Allow access in browser settings and try again.'; case 'NotFoundError': return 'No microphone was found on this device.'; case 'NotReadableError': return 'The microphone is busy in another app.'; case 'OverconstrainedError': return 'This microphone does not support the requested audio mode.'; default: return 'The microphone could not be started.'; }
}
async function requestWakeLock() {
  if (!settings.wakeLock || !listening || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try { wakeLockSentinel = await navigator.wakeLock.request('screen'); wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; }); } catch (_) { wakeLockSentinel = null; }
}
async function releaseWakeLock() { if (!wakeLockSentinel) return; try { await wakeLockSentinel.release(); } catch (_) {} wakeLockSentinel = null; }
function updateMicrophoneButton() { dom.microphoneButton.querySelector('span').textContent = listening ? 'Stop tuner' : 'Start tuning'; dom.microphoneButton.setAttribute('aria-pressed', String(listening)); }
async function startListening() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error(!window.isSecureContext ? 'INSECURE_CONTEXT' : 'MEDIA_UNSUPPORTED');
  stopReferenceTone(); mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext; microphoneContext = new AudioContextClass({ latencyHint: 'interactive' }); await microphoneContext.resume(); microphoneSource = microphoneContext.createMediaStreamSource(mediaStream); analyser = microphoneContext.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0; microphoneSource.connect(analyser); analysisBuffer = new Float32Array(analyser.fftSize);
  listening = true; resetPitchTracking(); lastAnalysisAt = 0; dom.signalLevel.style.width = '0%'; updateMicrophoneButton(); setWaitingDisplay(); await requestWakeLock(); animationFrame = requestAnimationFrame(analysisLoop);
}
async function stopListening() {
  listening = false; cancelAnimationFrame(animationFrame); animationFrame = 0; mediaStream?.getTracks().forEach((track) => track.stop()); mediaStream = null; microphoneSource?.disconnect(); microphoneSource = null; analyser = null; analysisBuffer = null;
  if (microphoneContext && microphoneContext.state !== 'closed') try { await microphoneContext.close(); } catch (_) {} microphoneContext = null; dom.signalLevel.style.width = '0%'; resetPitchTracking(); updateMicrophoneButton(); setWaitingDisplay(); await releaseWakeLock();
}
async function toggleMicrophone() {
  if (microphoneBusy) return; microphoneBusy = true; dom.microphoneButton.disabled = true;
  try { if (listening) await stopListening(); else await startListening(); }
  catch (error) {
    await stopListening(); const message = error?.message === 'INSECURE_CONTEXT' ? 'Microphone access requires HTTPS.' : error?.message === 'MEDIA_UNSUPPORTED' ? 'This browser does not support microphone input.' : microphoneErrorMessage(error);
    dom.tunerCard.dataset.state = 'error'; dom.listenStatus.textContent = 'Microphone unavailable'; dom.pitchInstruction.textContent = message; showToast(message, 4200);
  } finally { microphoneBusy = false; dom.microphoneButton.disabled = false; }
}
async function ensureReferenceContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) throw new Error('Audio output is not supported.');
  if (!referenceContext || referenceContext.state === 'closed') referenceContext = new AudioContextClass({ latencyHint: 'interactive' }); await referenceContext.resume(); return referenceContext;
}
function stopReferenceTone() {
  clearTimeout(referenceToneTimer); for (const node of referenceToneNodes) { try { node.stop?.(); } catch (_) {} try { node.disconnect?.(); } catch (_) {} }
  referenceToneNodes = []; tonePlaying = false; updateToneButton(); if (listening) setWaitingDisplay();
}
async function toggleReferenceTone() {
  if (tonePlaying) { stopReferenceTone(); return; } const target = targets[selectedTargetIndex] ?? targets[0];
  try {
    const context = await ensureReferenceContext(); const now = context.currentTime; const master = context.createGain(); const fundamentalGain = context.createGain(); const harmonicGain = context.createGain(); const fundamental = context.createOscillator(); const harmonic = context.createOscillator();
    master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(.16, now + .035); master.gain.setValueAtTime(.16, now + 1.8); master.gain.exponentialRampToValueAtTime(.0001, now + 2.25); fundamentalGain.gain.value = .86; harmonicGain.gain.value = .14; fundamental.type = 'sine'; harmonic.type = 'sine'; fundamental.frequency.value = target.frequency; harmonic.frequency.value = target.frequency * 2;
    fundamental.connect(fundamentalGain).connect(master); harmonic.connect(harmonicGain).connect(master); master.connect(context.destination); fundamental.start(now); harmonic.start(now); fundamental.stop(now + 2.3); harmonic.stop(now + 2.3);
    referenceToneNodes = [fundamental, harmonic, fundamentalGain, harmonicGain, master]; tonePlaying = true; updateToneButton(); dom.listenStatus.textContent = `Reference tone · ${targetLabel(target)}`; dom.pitchInstruction.textContent = 'Listen, then match the pitch'; referenceToneTimer = setTimeout(stopReferenceTone, 2350);
  } catch (error) { showToast(error.message || 'Reference tone could not be played.'); }
}
function resetProgress() { tunedStrings = new Set(); stableTargetIndex = null; stableSince = 0; updateActiveString(); updateTunedProgress(); }
function resetPreferences() {
  if (!confirm('Reset preferences and return to standard guitar tuning? Custom tunings will be kept.')) return; const customTunings = settings.customTunings; Object.assign(settings, makeDefaults(customTunings)); stopReferenceTone(); if (listening) stopListening(); selectedTargetIndex = 0; renderSettings(); updateCurrentTuning(); showToast('Preferences reset');
}
function initializeMeterTicks() { const fragment = document.createDocumentFragment(); for (let index = 0; index < 21; index += 1) fragment.append(document.createElement('span')); dom.meterTicks.append(fragment); }
