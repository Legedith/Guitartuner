import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const Pitch = await import(pathToFileURL(resolve(root, 'src/pitch.js')));
const Tunings = await import(pathToFileURL(resolve(root, 'src/tunings.js')));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
function deferred() { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

class Events {
  events = new Map();
  addEventListener(name, fn) { const listeners = this.events.get(name) || []; listeners.push(fn); this.events.set(name, listeners); }
  async emit(name) { for (const fn of this.events.get(name) || []) await fn({ target: this }); }
}
class Element extends Events {
  textContent = ''; hidden = false; disabled = false; value = ''; checked = false; dataset = {}; attrs = new Map(); children = new Map();
  style = { setProperty(name, value) { this[name] = value; } };
  classes = new Set();
  classList = { add: (...names) => names.forEach((x) => this.classes.add(x)), remove: (...names) => names.forEach((x) => this.classes.delete(x)), toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  setAttribute(name, value) { this.attrs.set(name, value); }
  getAttribute(name) { return this.attrs.get(name); }
  querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element()); return this.children.get(selector); }
  querySelectorAll() { return []; }
  replaceChildren() {}
  append() {}
}
function makeTrack() {
  const track = new Events();
  Object.assign(track, { muted: false, readyState: 'live', stopCount: 0, stop() { this.stopCount++; this.readyState = 'ended'; } });
  return track;
}
function makeStream() { const track = makeTrack(); return { track, getTracks: () => [track], getAudioTracks: () => [track] }; }

function createHarness({ stored = {}, mediaRequests = [], detection = false } = {}) {
  const elements = new Map();
  const contexts = [];
  let now = 1000;
  let analysisReads = 0;
  class AudioContext extends Events {
    state = 'suspended'; sampleRate = 48000; currentTime = 0; closeCount = 0;
    constructor() { super(); contexts.push(this); }
    async resume() { this.state = 'running'; await this.emit('statechange'); }
    async close() { this.state = 'closed'; this.closeCount++; await this.emit('statechange'); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 4096, getFloatTimeDomainData(buffer) { analysisReads++; buffer.fill(0); } }; }
  }
  const document = Object.assign(new Events(), {
    visibilityState: 'visible', documentElement: new Element(),
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    querySelectorAll() { return []; }, createElement() { return new Element(); }, createDocumentFragment() { return new Element(); },
  });
  const window = Object.assign(new Events(), { isSecureContext: true, AudioContext, matchMedia: () => ({ matches: false, addEventListener() {} }) });
  const context = vm.createContext({
    ...Pitch, ...Tunings, document, window, Float32Array,
    navigator: { mediaDevices: { getUserMedia: () => { const next = mediaRequests.shift(); if (!next) throw new Error('No fake microphone request queued'); return next.promise; } } },
    localStorage: { getItem: () => JSON.stringify(stored), setItem() {} },
    DEFAULT_PLAYLIST_URL: '', CHORD_QUALITIES: [{ id: 'major' }],
    sanitizePlaylistTracks: () => [], sanitizeSongCharts: () => ({}), extractYouTubePlaylistId: () => false,
    performance: { now: () => now },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    configureAnalysis() { vm.runInContext('analysisBuffer = new Float32Array(analyser.fftSize)', context); },
    analysisLoop() {}, showToast() {},
  });
  for (const file of ['01-state.js', '02-ui.js', '03-selection.js', ...(detection ? ['05-detection.js'] : []), '06-audio.js']) {
    vm.runInContext(read(`src/app-parts/${file}`), context, { filename: file });
  }
  if (!detection) vm.runInContext('let noiseFloorRms = .0006;', context);
  vm.runInContext("currentTuning = PRESET_TUNINGS[0]; targets = buildTargetStrings(currentTuning); settings.wakeLock = false;", context);
  return { context, contexts, elements, run: (code) => vm.runInContext(code, context), now: (time) => { now = time; }, reads: () => analysisReads };
}

test('saved sensitivity zero survives reload', () => {
  const h = createHarness({ stored: { sensitivity: 0 } });
  assert.equal(h.run('settings.sensitivity'), 0);
});

test('cancelling pending microphone permission cleans up a later granted stream', async () => {
  const permission = deferred(); const h = createHarness({ mediaRequests: [permission] });
  const start = h.run('toggleMicrophone()');
  assert.equal(h.run('microphoneBusy'), true);
  assert.equal(h.elements.get('#microphoneButton').querySelector('span').textContent, 'Cancel');
  await h.run('toggleMicrophone()');
  const stream = makeStream(); permission.resolve(stream); await start;
  assert.equal(stream.track.stopCount, 1);
  assert.equal(h.run('listening'), false);
  assert.equal(h.run('mediaStream'), null);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.elements.get('#microphoneButton').querySelector('span').textContent, 'Start tuning');
});

test('an older permission result cannot replace a newer active microphone', async () => {
  const oldPermission = deferred(); const newPermission = deferred();
  const h = createHarness({ mediaRequests: [oldPermission, newPermission] });
  const oldStart = h.run('toggleMicrophone()'); await h.run('toggleMicrophone()');
  const newStart = h.run('toggleMicrophone()'); const newStream = makeStream(); newPermission.resolve(newStream); await newStart;
  const oldStream = makeStream(); oldPermission.resolve(oldStream); await oldStart;
  assert.equal(oldStream.track.stopCount, 1);
  assert.equal(newStream.track.stopCount, 0);
  assert.equal(h.run('listening'), true);
  assert.equal(h.run('mediaStream'), newStream);
  assert.equal(h.run('microphoneContext'), h.contexts[1]);
  assert.equal(h.contexts[1].state, 'running');
});

test('an older rejected permission cannot overwrite a new active session with an error', async () => {
  const oldPermission = deferred(); const newPermission = deferred();
  const h = createHarness({ mediaRequests: [oldPermission, newPermission] });
  const oldStart = h.run('toggleMicrophone()'); await h.run('toggleMicrophone()');
  const newStart = h.run('toggleMicrophone()'); const stream = makeStream(); newPermission.resolve(stream); await newStart;
  oldPermission.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); await oldStart;
  assert.equal(h.run('listening'), true);
  assert.notEqual(h.elements.get('#tunerCard').dataset.state, 'error');
  assert.equal(h.run('mediaStream'), stream);
});

test('a disconnected microphone releases capture and offers a fresh start', async () => {
  const permission = deferred(); const h = createHarness({ mediaRequests: [permission] });
  const start = h.run('toggleMicrophone()'); const stream = makeStream(); permission.resolve(stream); await start;
  stream.track.readyState = 'ended'; await stream.track.emit('ended');
  assert.equal(h.run('listening'), false);
  assert.equal(h.run('mediaStream'), null);
  assert.equal(h.run('analysisBuffer'), null);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.elements.get('#listenStatus').textContent, 'Microphone disconnected');
  assert.equal(h.elements.get('#microphoneButton').querySelector('span').textContent, 'Start tuning');
});

test('temporarily muted input pauses readings and unmute restores listening', async () => {
  const permission = deferred(); const h = createHarness({ mediaRequests: [permission] });
  const start = h.run('toggleMicrophone()'); const stream = makeStream(); permission.resolve(stream); await start;
  stream.track.muted = true; await stream.track.emit('mute');
  assert.equal(h.run('microphoneInterrupted'), true);
  assert.equal(h.elements.get('#signalQuality').textContent, 'Paused');
  h.run('selectString(1)');
  assert.equal(h.elements.get('#listenStatus').textContent, 'Microphone paused');
  assert.equal(h.elements.get('#microphoneButton').querySelector('span').textContent, 'Stop tuner');
  stream.track.muted = false; await stream.track.emit('unmute');
  assert.equal(h.run('microphoneInterrupted'), false);
  assert.equal(h.elements.get('#microphoneButton').querySelector('span').textContent, 'Stop tuner');
});

const detectionTest = test;

detectionTest('two isolated in-tune readings cannot satisfy the confirmation dwell', () => {
  const h = createHarness({ detection: true });
  h.run('listening = true; markStableString(targets[0], 0, .99, 100); lastPitchAt = 100; handleNoPitch(1000, 0); markStableString(targets[0], 0, .99, 1100)');
  assert.equal(h.run('tunedStrings.has(0)'), false);
  for (const now of [1200, 1300, 1400, 1500, 1600, 1700]) h.run(`markStableString(targets[0], 0, .99, ${now})`);
  assert.equal(h.run('tunedStrings.has(0)'), true);
});

detectionTest('a check survives one transient but is revoked after sustained detuning', () => {
  const h = createHarness({ detection: true });
  for (const now of [100, 200, 300, 400, 500, 600, 700]) h.run(`markStableString(targets[0], 0, .99, ${now})`);
  assert.equal(h.run('tunedStrings.has(0)'), true);
  h.run('markStableString(targets[0], 20, .99, 800)');
  assert.equal(h.run('tunedStrings.has(0)'), true);
  h.run('markStableString(targets[0], 0, .99, 900)');
  for (const now of [1000, 1100, 1200, 1300]) h.run(`markStableString(targets[0], 20, .99, ${now})`);
  assert.equal(h.run('tunedStrings.has(0)'), false);
});

detectionTest('auto mode retains an initial pending target until its next confirming frame', () => {
  const h = createHarness({ detection: true });
  h.run('listening = true; selectedTargetIndex = 0; settings.mode = "auto"');
  assert.equal(h.run('handlePitch({ frequency: targets[1].frequency, clarity: .99 }, 100)'), true);
  assert.equal(h.run('selectedTargetIndex'), 0);
  assert.equal(h.run('autoTargetTracker.pendingIndex'), 1);
  assert.equal(h.run('handlePitch({ frequency: targets[1].frequency, clarity: .99 }, 200)'), true);
  assert.equal(h.run('selectedTargetIndex'), 1);
});

detectionTest('reference playback resets confirmation and blocks analysis through its tail', () => {
  const h = createHarness({ detection: true });
  h.run('listening = true; microphoneContext = { sampleRate: 48000, state: "running" }; analyser = { fftSize: 4096, getFloatTimeDomainData(buffer) { buffer.fill(0); globalThis.frameReads = (globalThis.frameReads || 0) + 1; } }; configureAnalysis(); markStableString(targets[0], 0, .99, 1000)');
  h.now(1400); h.run('guardReferencePlayback(); analysisLoop(2099)');
  assert.equal(h.run('globalThis.frameReads || 0'), 0);
  assert.equal(h.elements.get('#signalQuality').textContent, 'Paused');
  h.run('analysisLoop(2100)');
  assert.equal(h.run('globalThis.frameReads'), 1);
  h.run('markStableString(targets[0], 0, .99, 2200)');
  assert.equal(h.run('tunedStrings.has(0)'), false);
});

detectionTest('Reset requires a fresh continuous confirmation instead of inheriting the previous dwell', () => {
  const h = createHarness({ detection: true });
  for (const now of [100, 200, 300, 400, 500, 600, 700]) h.run(`markStableString(targets[0], 0, .99, ${now})`);
  assert.equal(h.run('tunedStrings.has(0)'), true);
  h.run('resetProgress(); markStableString(targets[0], 0, .99, 800)');
  assert.equal(h.run('tunedStrings.has(0)'), false);
  for (const now of [900, 1000, 1100, 1200, 1300, 1400]) h.run(`markStableString(targets[0], 0, .99, ${now})`);
  assert.equal(h.run('tunedStrings.has(0)'), true);
});

detectionTest('manual mode never checks a reference an octave away', () => {
  const h = createHarness({ detection: true });
  h.run('settings.mode = "manual"; selectedTargetIndex = 0; listening = true');
  for (let time = 100; time <= 1200; time += 100) {
    h.run(`handlePitch({ frequency: targets[0].frequency * 2, clarity: .99 }, ${time})`);
  }
  assert.equal(h.run('tunedStrings.size'), 0);
  assert.equal(h.elements.get('#listenStatus').textContent, 'Different note heard');
  assert.equal(h.elements.get('#pitchCents').textContent, '— cents');
});

detectionTest('Auto cannot certify which of two unison strings was played', () => {
  const h = createHarness({ detection: true });
  h.run('listening = true; targets[1].frequency = targets[0].frequency');
  for (let time = 100; time <= 1200; time += 100) {
    h.run(`handlePitch({ frequency: targets[0].frequency, clarity: .99 }, ${time})`);
  }
  assert.equal(h.run('tunedStrings.size'), 0);
  assert.equal(h.elements.get('#pitchInstruction').textContent, 'Use Manual for this note');
});

detectionTest('clipped input clears confirmation and explains how to recover', () => {
  const h = createHarness({ detection: true });
  h.run('listening = true; microphoneContext = { sampleRate: 48000, state: "running" }; analyser = { getFloatTimeDomainData(buffer) { for (let i = 0; i < buffer.length; i++) buffer[i] = i % 2 ? 1 : -1; } }; configureAnalysis();');
  for (let time = 100; time <= 1200; time += 100) h.run(`analysisLoop(${time})`);
  assert.equal(h.run('tunedStrings.size'), 0);
  assert.equal(h.elements.get('#signalQuality').textContent, 'Clipping');
  assert.equal(h.elements.get('#pitchInstruction').textContent, 'Input too loud');
});

detectionTest('low-clarity input never earns a check despite a centered pitch', () => {
  const h = createHarness({ detection: true });
  h.run('settings.mode = "manual"; listening = true');
  for (const now of [100, 200, 300, 400, 500, 600, 700, 800, 900]) h.run(`handlePitch({ frequency: targets[0].frequency, clarity: .75 }, ${now})`);
  assert.equal(h.run('tunedStrings.size'), 0);
  assert.equal(h.elements.get('#pitchInstruction').textContent, 'Pluck again');
  assert.notEqual(h.elements.get('#tunerCard').dataset.state, 'in-tune');
});
