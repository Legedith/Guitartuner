import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const selection = read('src/app-parts/03-selection.js');
const detection = read('src/app-parts/05-detection.js');
const tunerCss = read('styles/tuner.css');
const serviceWorker = read('service-worker.js');

test('tapping a string no longer silently disables automatic detection', () => {
  const selectStringBody = selection.match(/function selectString\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.ok(selectStringBody);
  assert.doesNotMatch(selectStringBody, /settings\.mode\s*=\s*['"]manual['"]/);
  assert.match(selection, /Play any string · no tapping needed/);
});

test('the live loop uses adaptive quiet-note detection, temporal smoothing, and bidirectional target confirmation', () => {
  assert.match(detection, /pitchDetectionRmsFloor\(settings\.sensitivity, noiseFloorRms\)/);
  assert.match(detection, /new PitchSmoother/);
  assert.match(detection, /new AutoTargetTracker/);
  assert.match(detection, /previousTargetIndex:\s*selectedTargetIndex/);
  assert.match(detection, /VISUAL_PITCH_TIMEOUT_MS\s*=\s*1250/);
});

test('the visual tuner exposes an arc, active needle, and real auto/manual switch styling', () => {
  assert.match(tunerCss, /--needle-angle/);
  assert.match(tunerCss, /\.meter-ticks span:nth-child\(21\)/);
  assert.match(tunerCss, /\.meter-needle\.is-active/);
  assert.match(tunerCss, /\.mode-slider input:checked\+\.mode-slider-track i/);
});

test('the offline cache is bumped for the tuner update', () => {
  assert.match(serviceWorker, /fretline-v13/);
});
