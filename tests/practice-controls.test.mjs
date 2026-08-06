import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app-parts/15-practice-controls.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/lyrics.css', import.meta.url), 'utf8');

function functionBody(name) {
  const match = source.match(new RegExp(`${name} = function [^{]*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

test('the lyric sheet exposes simplify and semitone transpose controls', () => {
  assert.match(source, /textContent = 'Simplify'/);
  assert.match(source, /className = 'lyrics-transpose-control'/);
  assert.match(source, /Transpose down one semitone/);
  assert.match(source, /Transpose up one semitone/);
  assert.match(source, /setFretlinePracticeTranspose\(0\)/);
  assert.match(source, /buildPracticeGuidance\(/);
  assert.match(styles, /\.lyrics-simplify-button\{/);
  assert.match(styles, /\.lyrics-transpose-control\{/);
});

test('selecting a chart cues optional audio instead of autoplaying it', () => {
  const body = functionBody('selectSong');
  assert.match(body, /fretlinePracticeBaseSelectSong\(catalogId, false\)/);
});

test('the central button controls only lyric scrolling', () => {
  const body = functionBody('togglePlayAlong');
  assert.match(body, /setFretlineLyricsScrollPlaying\(!fretlineLyricsScrollPlaying\)/);
  assert.doesNotMatch(body, /youtube|fretlineLyricsBaseTogglePlayAlong/i);
  assert.match(source, /Start scrolling/);
  assert.match(source, /Pause scrolling/);
});

test('YouTube state changes do not start or stop practice scrolling', () => {
  const body = functionBody('onYouTubeStateChange');
  assert.doesNotMatch(body, /setFretlineLyricsScrollPlaying/);
  assert.match(body, /fretlineLyricsBaseYouTubeStateChange\(event\)/);
});

test('the current reading line follows the viewport rather than player time', () => {
  const body = functionBody('updateFretlineLyricsActiveLine');
  assert.match(body, /getBoundingClientRect\(\)/);
  assert.match(body, /viewport\.height \* \.36/);
  assert.doesNotMatch(body, /currentPlayerTime|youtubeState/);
});
