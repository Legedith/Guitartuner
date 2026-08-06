import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app-parts/13-lyrics-sheet.js', import.meta.url), 'utf8');
const parser = await readFile(new URL('../src/lyrics-sheet.js', import.meta.url), 'utf8');

test('the lyric view removes the timeline and keeps three scroll controls', () => {
  for (const selector of ['.playback-progress', '.playback-controls', '.loop-controls']) {
    assert.match(source, new RegExp(selector.replace('.', '\\.')));
  }
  assert.match(source, /controls\.append\(fretlineLyricsSlowButton, playButton, fretlineLyricsFastButton, fretlineLyricsSpeedOutput\)/);
});

test('scroll speed is clamped from 0.1 to 1.0 in tenths', () => {
  assert.match(source, /clamp\(Math\.round\(Number\(value\) \* 10\) \/ 10, \.1, 1\)/);
  assert.match(source, /fretlineLyricsScrollSpeed - \.1/);
  assert.match(source, /fretlineLyricsScrollSpeed \+ \.1/);
});

test('one button controls both playback and auto scroll', () => {
  assert.match(source, /togglePlayAlong = async function toggleLyricsPlayback/);
  assert.match(source, /fretlineLyricsStartScroll\(\)/);
  assert.match(source, /youtubePlayer\?\.playVideo\?\.\(\)/);
  assert.match(source, /youtubePlayer\?\.pauseVideo\?\.\(\)/);
});

test('lyrics stay device-local and are never fetched by the sheet code', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(parser, /\bfetch\s*\(/);
  assert.match(parser, /fretline:lyrics:v1/);
});
