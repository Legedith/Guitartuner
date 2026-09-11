function microphoneErrorMessage(error) {
  if (!window.isSecureContext) return 'Open this tuner over HTTPS to use the microphone.';
  switch (error?.name) {
    case 'NotAllowedError': return 'Microphone blocked. Allow access in browser settings, then try again.';
    case 'NotFoundError': return 'No microphone found. Connect one, then try again.';
    case 'NotReadableError': return 'Microphone busy. Close other apps using it, then try again.';
    case 'OverconstrainedError': return 'This microphone could not provide audio. Try a different input device.';
    default: return error?.message === 'MEDIA_UNSUPPORTED' ? 'This browser does not support microphone input.' : 'The microphone could not be started. Try again.';
  }
}
let wakeLockRequest = null;
async function requestWakeLock() {
  if (wakeLockSentinel || wakeLockRequest || !settings.wakeLock || !listening || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  const session = microphoneSession;
  const request = navigator.wakeLock.request('screen');
  wakeLockRequest = request;
  try {
    const sentinel = await request;
    if (session !== microphoneSession || !listening || !settings.wakeLock || document.visibilityState !== 'visible') { await sentinel.release(); return; }
    wakeLockSentinel = sentinel;
    sentinel.addEventListener('release', () => { if (wakeLockSentinel === sentinel) wakeLockSentinel = null; });
  } catch (_) { /* Screen wake lock is optional. */ }
  finally { if (wakeLockRequest === request) wakeLockRequest = null; }
}
async function releaseWakeLock() {
  const sentinel = wakeLockSentinel; wakeLockSentinel = null;
  try { await sentinel?.release(); } catch (_) {}
}
function updateMicrophoneButton() {
  dom.microphoneButton.querySelector('span').textContent = microphoneBusy ? 'Cancel' : listening ? 'Stop tuner' : 'Start tuning';
  dom.microphoneButton.setAttribute('aria-pressed', String(listening));
  dom.microphoneButton.disabled = false;
}
function updateMicrophoneInterruption() {
  if (!listening) return;
  const interrupted = microphoneContext?.state !== 'running' || mediaStream?.getAudioTracks().some((track) => track.muted);
  if (microphoneInterrupted === interrupted) return;
  microphoneInterrupted = interrupted; resetPitchTracking(); updateMicrophoneButton(); setWaitingDisplay();
  if (interrupted) {
    dom.tunerCard.dataset.state = 'paused'; dom.listenStatus.textContent = 'Microphone paused';
    dom.pitchInstruction.textContent = 'Audio input interrupted'; dom.pitchDetail.textContent = 'Stop and restart the tuner when your microphone is available.';
    dom.signalLevel.style.width = '0%'; dom.signalQuality.textContent = 'Paused';
    announceTuner('Microphone paused. Stop and restart the tuner to continue.', performance.now(), true);
  } else announceTuner('Microphone resumed. Pluck one string.', performance.now(), true);
}
async function startListening() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_UNSUPPORTED');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('MEDIA_UNSUPPORTED');
  const session = ++microphoneSession;
  stopReferenceTone({ updateDisplay: false }); stopChordSound();
  // Resume in the click gesture, before waiting for the permission prompt (Safari).
  const context = new AudioContextClass({ latencyHint: 'interactive' });
  microphoneContext = context;
  const resumed = context.resume().then(() => null, (error) => error);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    if (session !== microphoneSession) { stream.getTracks().forEach((track) => track.stop()); return; }
    mediaStream = stream;
    const resumeError = await resumed;
    if (session !== microphoneSession) return;
    if (resumeError) throw resumeError;
    if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) throw new Error('No active microphone track');
    microphoneSource = context.createMediaStreamSource(stream); analyser = context.createAnalyser();
    configureAnalysis(); analyser.smoothingTimeConstant = 0; microphoneSource.connect(analyser);
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', async () => {
        if (session !== microphoneSession) return;
        const stoppedSession = microphoneSession + 1;
        await stopListening();
        if (microphoneSession !== stoppedSession || listening || microphoneBusy) return;
        dom.tunerCard.dataset.state = 'error'; dom.listenStatus.textContent = 'Microphone disconnected';
        dom.pitchInstruction.textContent = 'Reconnect your microphone'; dom.pitchDetail.textContent = 'Then select Start tuning to try again.';
        announceTuner('Microphone disconnected. Reconnect it and start tuning again.', performance.now(), true);
      });
      track.addEventListener('mute', updateMicrophoneInterruption);
      track.addEventListener('unmute', updateMicrophoneInterruption);
    }
    context.addEventListener('statechange', () => { if (session === microphoneSession) updateMicrophoneInterruption(); });
    listening = true; microphoneInterrupted = false; noiseFloorRms = 0.0006;
    resetPitchTracking(); lastAnalysisAt = 0; dom.signalLevel.style.width = '0%'; setWaitingDisplay();
    updateMicrophoneInterruption();
    if (!microphoneInterrupted) announceTuner('Microphone ready. Pluck one open string.', performance.now(), true);
    animationFrame = requestAnimationFrame(analysisLoop); void requestWakeLock();
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (session === microphoneSession) throw error;
  } finally {
    if (session !== microphoneSession && context.state !== 'closed') { try { await context.close(); } catch (_) {} }
  }
}
async function stopListening() {
  microphoneSession += 1; listening = false; microphoneBusy = false; microphoneInterrupted = false;
  cancelAnimationFrame(animationFrame); animationFrame = 0;
  const stream = mediaStream; const source = microphoneSource; const context = microphoneContext;
  mediaStream = null; microphoneSource = null; microphoneContext = null; analyser = null; analysisBuffer = null;
  stream?.getTracks().forEach((track) => track.stop());
  try { source?.disconnect(); } catch (_) {}
  dom.signalLevel.style.width = '0%'; resetPitchTracking(); updateMicrophoneButton(); setWaitingDisplay();
  void releaseWakeLock();
  if (context && context.state !== 'closed') { try { await context.close(); } catch (_) {} }
}
async function toggleMicrophone() {
  if (microphoneBusy || listening) { await stopListening(); return; }
  microphoneBusy = true; updateMicrophoneButton();
  dom.listenStatus.textContent = 'Waiting for microphone'; dom.pitchInstruction.textContent = 'Allow microphone access';
  dom.pitchDetail.textContent = 'Your audio stays on this device. You can cancel at any time.';
  announceTuner('Allow microphone access in your browser to start tuning.', performance.now(), true);
  const expectedSession = microphoneSession + 1;
  try { await startListening(); }
  catch (error) {
    const message = microphoneErrorMessage(error);
    const stoppedSession = microphoneSession + 1;
    await stopListening();
    if (microphoneSession !== stoppedSession) return;
    dom.tunerCard.dataset.state = 'error'; dom.listenStatus.textContent = 'Microphone unavailable';
    dom.pitchInstruction.textContent = 'Check microphone access'; dom.pitchDetail.textContent = message;
    announceTuner(message, performance.now(), true);
  } finally {
    if (microphoneSession === expectedSession) { microphoneBusy = false; updateMicrophoneButton(); }
  }
}

// Wait for the output fade, microphone frame, and short room echo to clear.
function guardReferencePlayback() {
  playbackGuardUntil = performance.now() + 700;
  resetPitchTracking(); dom.signalLevel.style.width = '0%';
}
async function ensureReferenceContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) throw new Error('Audio output is not supported.');
  if (!referenceContext || referenceContext.state === 'closed') { referenceContext = new AudioContextClass({ latencyHint: 'interactive' }); referenceBufferCache = new Map(); }
  await referenceContext.resume(); return referenceContext;
}
function removeOldReferenceBuffer() {
  if (referenceBufferCache.size < 48) return;
  const oldestKey = referenceBufferCache.keys().next().value; referenceBufferCache.delete(oldestKey);
}
function getReferenceBuffer(context, target, instrument) {
  const key = `${instrument}:${context.sampleRate}:${target.frequency.toFixed(5)}`;
  const cached = referenceBufferCache.get(key); if (cached) return cached;
  const samples = generatePluckedStringSamples({ frequency: target.frequency, instrument, sampleRate: context.sampleRate, seed: (target.midi * 4099) + (instrument === 'ukulele' ? 17 : 0) });
  if (!samples.length) throw new Error('Reference string could not be generated.');
  const buffer = context.createBuffer(1, samples.length, context.sampleRate); buffer.copyToChannel(samples, 0); removeOldReferenceBuffer(); referenceBufferCache.set(key, buffer); return buffer;
}
function disconnectReferenceNodes(nodes) {
  for (const node of nodes) { try { node.disconnect?.(); } catch (_) {} }
}
function stopReferenceTone({ updateDisplay = true } = {}) {
  clearTimeout(referenceToneTimer); referenceToneTimer = 0; referenceTonePlayId += 1;
  const nodes = referenceToneNodes; referenceToneNodes = [];
  if (tonePlaying || nodes.length) guardReferencePlayback();
  tonePlaying = false; updateToneButton();
  const source = nodes[0]; const master = nodes[4];
  if (referenceContext && referenceContext.state !== 'closed' && master) {
    const now = referenceContext.currentTime;
    try { master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(Math.max(.0001, master.gain.value), now); master.gain.exponentialRampToValueAtTime(.0001, now + .025); } catch (_) {}
    try { source?.stop(now + .03); } catch (_) {}
    setTimeout(() => disconnectReferenceNodes(nodes), 55);
  } else {
    try { source?.stop?.(); } catch (_) {} disconnectReferenceNodes(nodes);
  }
  if (updateDisplay && targets.length) setWaitingDisplay();
}
function finishReferenceTone(playId, nodes) {
  if (playId !== referenceTonePlayId) { disconnectReferenceNodes(nodes); return; }
  guardReferencePlayback();
  clearTimeout(referenceToneTimer); referenceToneTimer = 0; referenceToneNodes = []; tonePlaying = false; disconnectReferenceNodes(nodes); updateToneButton(); if (targets.length) setWaitingDisplay();
}
async function playReferenceString() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  const instrument = settings.instrument; guardReferencePlayback(); stopChordSound(); stopReferenceTone({ updateDisplay: false }); const playId = referenceTonePlayId;
  try {
    const context = await ensureReferenceContext(); if (playId !== referenceTonePlayId || instrument !== settings.instrument) return;
    const profile = referenceProfile(instrument); const buffer = getReferenceBuffer(context, target, instrument); const now = context.currentTime; const source = context.createBufferSource(); const highpass = context.createBiquadFilter(); const lowpass = context.createBiquadFilter(); const body = context.createBiquadFilter(); const master = context.createGain(); const compressor = context.createDynamicsCompressor();
    source.buffer = buffer; highpass.type = 'highpass'; highpass.frequency.value = profile.highpass; highpass.Q.value = .55; lowpass.type = 'lowpass'; lowpass.frequency.value = profile.lowpass; lowpass.Q.value = .68; body.type = 'peaking'; body.frequency.value = instrument === 'ukulele' ? 370 : 210; body.Q.value = .9; body.gain.value = instrument === 'ukulele' ? 1.6 : 1.9;
    master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(.78, now + .008); master.gain.setValueAtTime(.78, Math.max(now + .01, now + buffer.duration - .09)); master.gain.exponentialRampToValueAtTime(.0001, now + buffer.duration);
    compressor.threshold.value = -16; compressor.knee.value = 16; compressor.ratio.value = 2.4; compressor.attack.value = .003; compressor.release.value = .16;
    source.connect(highpass).connect(lowpass).connect(body).connect(master).connect(compressor).connect(context.destination);
    const nodes = [source, highpass, lowpass, body, master, compressor]; referenceToneNodes = nodes; tonePlaying = true; updateToneButton(); setWaitingDisplay(); dom.tunerCard.dataset.state = 'reference'; dom.listenStatus.textContent = 'Playing reference'; dom.pitchInstruction.textContent = `Listen to ${targetLabel(target)}`; dom.pitchDetail.textContent = listening ? 'Pitch detection pauses while the reference plays.' : 'Match this sound, or start tuning with your microphone.'; dom.signalQuality.textContent = 'Reference';
    source.addEventListener('ended', () => finishReferenceTone(playId, nodes), { once: true }); source.start(now); source.stop(now + buffer.duration); referenceToneTimer = setTimeout(() => finishReferenceTone(playId, nodes), (buffer.duration * 1000) + 120);
  } catch (error) { stopReferenceTone(); showToast(error.message || 'Reference string could not be played.'); }
}
async function toggleReferenceTone() { if (tonePlaying) { stopReferenceTone(); return; } await playReferenceString(); }

function updateChordSoundControls() { if (typeof updateChordPlayButton === 'function') updateChordPlayButton(); }
function disconnectChordPlayback(playback) {
  if (!playback) return;
  for (const source of playback.sources ?? []) { try { source.disconnect(); } catch (_) {} }
  disconnectReferenceNodes(playback.nodes ?? []);
}
function stopChordSound() {
  clearTimeout(chordSoundTimer); chordSoundTimer = 0; chordSoundPlayId += 1;
  const playback = chordSoundPlayback; chordSoundPlayback = null; chordSoundPlaying = false; updateChordSoundControls();
  if (!playback) return;
  guardReferencePlayback();
  if (referenceContext && referenceContext.state !== 'closed') {
    const now = referenceContext.currentTime;
    try { playback.master.gain.cancelScheduledValues(now); playback.master.gain.setValueAtTime(Math.max(.0001, playback.master.gain.value), now); playback.master.gain.exponentialRampToValueAtTime(.0001, now + .035); } catch (_) {}
    for (const source of playback.sources) try { source.stop(now + .04); } catch (_) {}
    setTimeout(() => disconnectChordPlayback(playback), 75);
  } else disconnectChordPlayback(playback);
}
function finishChordSound(playId, playback) {
  if (playId !== chordSoundPlayId) { disconnectChordPlayback(playback); return; }
  guardReferencePlayback();
  clearTimeout(chordSoundTimer); chordSoundTimer = 0; chordSoundPlayback = null; chordSoundPlaying = false; disconnectChordPlayback(playback); updateChordSoundControls();
}
async function playChordVoicingSound(voicing, tuningMidi = currentTuning?.midi, instrument = settings.instrument) {
  if (!voicing || !Array.isArray(tuningMidi) || voicing.frets?.length !== tuningMidi.length) return;
  guardReferencePlayback(); stopReferenceTone({ updateDisplay: false }); stopChordSound(); const playId = chordSoundPlayId;
  try {
    const context = await ensureReferenceContext(); if (playId !== chordSoundPlayId) return;
    const profile = referenceProfile(instrument); const now = context.currentTime + .012; const highpass = context.createBiquadFilter(); const lowpass = context.createBiquadFilter(); const body = context.createBiquadFilter(); const master = context.createGain(); const compressor = context.createDynamicsCompressor(); const sources = [];
    highpass.type = 'highpass'; highpass.frequency.value = profile.highpass; highpass.Q.value = .52; lowpass.type = 'lowpass'; lowpass.frequency.value = profile.lowpass; lowpass.Q.value = .64; body.type = 'peaking'; body.frequency.value = instrument === 'ukulele' ? 370 : 210; body.Q.value = .85; body.gain.value = instrument === 'ukulele' ? 1.4 : 1.8;
    compressor.threshold.value = -19; compressor.knee.value = 20; compressor.ratio.value = 3; compressor.attack.value = .004; compressor.release.value = .22;
    highpass.connect(lowpass).connect(body).connect(master).connect(compressor).connect(context.destination);
    let totalDuration = 0; let soundedIndex = 0;
    voicing.frets.forEach((fret, stringIndex) => {
      if (fret < 0) return;
      const midi = tuningMidi[stringIndex] + fret; const frequency = midiToFrequency(midi, settings.referenceA); const target = { midi, frequency };
      const buffer = getReferenceBuffer(context, target, instrument); const source = context.createBufferSource(); const start = now + (soundedIndex * (instrument === 'ukulele' ? .024 : .032));
      source.buffer = buffer; source.connect(highpass); source.start(start); source.stop(start + buffer.duration); sources.push(source); totalDuration = Math.max(totalDuration, (start - now) + buffer.duration); soundedIndex += 1;
    });
    if (!sources.length) throw new Error('This chord has no sounding strings.');
    master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(instrument === 'ukulele' ? .44 : .36, now + .018); master.gain.setValueAtTime(instrument === 'ukulele' ? .44 : .36, Math.max(now + .04, now + totalDuration - .15)); master.gain.exponentialRampToValueAtTime(.0001, now + totalDuration);
    const playback = { sources, nodes: [highpass, lowpass, body, master, compressor], master }; chordSoundPlayback = playback; chordSoundPlaying = true; updateChordSoundControls();
    chordSoundTimer = setTimeout(() => finishChordSound(playId, playback), (totalDuration * 1000) + 140);
  } catch (error) { stopChordSound(); showToast(error.message || 'The chord could not be played.'); }
}

function resetProgress() { tunedStrings = new Set(); resetPitchTracking(); setWaitingDisplay(); updateActiveString(); updateTunedProgress(); }
function resetPreferences() {
  if (!confirm('Reset preferences and return to standard guitar tuning? Your custom tunings, playlist, and chord maps will be kept.')) return;
  const preserved = { customTunings: settings.customTunings, playlistUrl: settings.playlistUrl, playlistTracks: settings.playlistTracks, songCharts: settings.songCharts };
  Object.assign(settings, makeDefaults(preserved.customTunings), preserved); stopReferenceTone(); stopChordSound(); if (listening) stopListening(); selectedTargetIndex = 0; renderSettings(); updateCurrentTuning(); initializeChordLibrary?.(); initializeSongLibrary?.(); showToast('Preferences reset');
}
function initializeMeterTicks() { const fragment = document.createDocumentFragment(); for (let index = 0; index < 21; index += 1) fragment.append(document.createElement('span')); dom.meterTicks.append(fragment); }
