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
  stopReferenceTone(); stopChordSound(); mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
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
  const nodes = referenceToneNodes; referenceToneNodes = []; tonePlaying = false; updateToneButton();
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
  clearTimeout(referenceToneTimer); referenceToneTimer = 0; referenceToneNodes = []; tonePlaying = false; disconnectReferenceNodes(nodes); updateToneButton(); if (targets.length) setWaitingDisplay();
}
async function playReferenceString() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  const instrument = settings.instrument; stopChordSound(); stopReferenceTone({ updateDisplay: false }); const playId = referenceTonePlayId;
  try {
    const context = await ensureReferenceContext(); if (playId !== referenceTonePlayId || instrument !== settings.instrument) return;
    const profile = referenceProfile(instrument); const buffer = getReferenceBuffer(context, target, instrument); const now = context.currentTime; const source = context.createBufferSource(); const highpass = context.createBiquadFilter(); const lowpass = context.createBiquadFilter(); const body = context.createBiquadFilter(); const master = context.createGain(); const compressor = context.createDynamicsCompressor();
    source.buffer = buffer; highpass.type = 'highpass'; highpass.frequency.value = profile.highpass; highpass.Q.value = .55; lowpass.type = 'lowpass'; lowpass.frequency.value = profile.lowpass; lowpass.Q.value = .68; body.type = 'peaking'; body.frequency.value = instrument === 'ukulele' ? 370 : 210; body.Q.value = .9; body.gain.value = instrument === 'ukulele' ? 1.6 : 1.9;
    master.gain.setValueAtTime(.0001, now); master.gain.exponentialRampToValueAtTime(.78, now + .008); master.gain.setValueAtTime(.78, Math.max(now + .01, now + buffer.duration - .09)); master.gain.exponentialRampToValueAtTime(.0001, now + buffer.duration);
    compressor.threshold.value = -16; compressor.knee.value = 16; compressor.ratio.value = 2.4; compressor.attack.value = .003; compressor.release.value = .16;
    source.connect(highpass).connect(lowpass).connect(body).connect(master).connect(compressor).connect(context.destination);
    const nodes = [source, highpass, lowpass, body, master, compressor]; referenceToneNodes = nodes; tonePlaying = true; updateToneButton(); dom.listenStatus.textContent = `Reference string · ${targetLabel(target)}`; dom.pitchInstruction.textContent = `${INSTRUMENTS[instrument].name} string · listen, then match the pitch`;
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
  if (referenceContext && referenceContext.state !== 'closed') {
    const now = referenceContext.currentTime;
    try { playback.master.gain.cancelScheduledValues(now); playback.master.gain.setValueAtTime(Math.max(.0001, playback.master.gain.value), now); playback.master.gain.exponentialRampToValueAtTime(.0001, now + .035); } catch (_) {}
    for (const source of playback.sources) try { source.stop(now + .04); } catch (_) {}
    setTimeout(() => disconnectChordPlayback(playback), 75);
  } else disconnectChordPlayback(playback);
}
function finishChordSound(playId, playback) {
  if (playId !== chordSoundPlayId) { disconnectChordPlayback(playback); return; }
  clearTimeout(chordSoundTimer); chordSoundTimer = 0; chordSoundPlayback = null; chordSoundPlaying = false; disconnectChordPlayback(playback); updateChordSoundControls();
}
async function playChordVoicingSound(voicing, tuningMidi = currentTuning?.midi, instrument = settings.instrument) {
  if (!voicing || !Array.isArray(tuningMidi) || voicing.frets?.length !== tuningMidi.length) return;
  stopReferenceTone({ updateDisplay: false }); stopChordSound(); const playId = chordSoundPlayId;
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

function resetProgress() { tunedStrings = new Set(); stableTargetIndex = null; stableSince = 0; updateActiveString(); updateTunedProgress(); }
function resetPreferences() {
  if (!confirm('Reset preferences and return to standard guitar tuning? Your custom tunings, playlist, and chord maps will be kept.')) return;
  const preserved = { customTunings: settings.customTunings, playlistUrl: settings.playlistUrl, playlistTracks: settings.playlistTracks, songCharts: settings.songCharts };
  Object.assign(settings, makeDefaults(preserved.customTunings), preserved); stopReferenceTone(); stopChordSound(); if (listening) stopListening(); selectedTargetIndex = 0; renderSettings(); updateCurrentTuning(); initializeChordLibrary?.(); initializeSongLibrary?.(); showToast('Preferences reset');
}
function initializeMeterTicks() { const fragment = document.createDocumentFragment(); for (let index = 0; index < 21; index += 1) fragment.append(document.createElement('span')); dom.meterTicks.append(fragment); }
