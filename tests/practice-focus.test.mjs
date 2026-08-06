import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app-parts/16-practice-focus.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/practice-focus.css', import.meta.url), 'utf8');

function assignedFunctionBody(name) {
  const match = source.match(new RegExp(`${name} = (?:async )?function [^{]*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

test('the animation loop uses an accumulated floating scroll position', () => {
  const body = assignedFunctionBody('fretlineLyricsScrollStep');
  assert.match(body, /advancePracticeScrollPosition\(/);
  assert.match(body, /fretlineFocusScrollPosition/);
  assert.match(body, /fretlineLyricsViewport\.scrollTop = fretlineFocusScrollPosition/);
  assert.doesNotMatch(body, /currentPlayerDuration|selectedSong\?\.duration|lyricsScrollRate/);
});

test('manual scrolling pauses automatic movement instead of fighting the user', () => {
  assert.match(source, /addEventListener\('wheel', pauseForManualScroll/);
  assert.match(source, /addEventListener\('touchstart', pauseForManualScroll/);
  assert.match(source, /addEventListener\('pointerdown', pauseForManualScroll/);
  assert.match(source, /setFretlineLyricsScrollPlaying\(false\)/);
});

test('opening a song enters focus mode and requests native fullscreen when available', () => {
  const body = assignedFunctionBody('selectSong');
  assert.match(body, /enterFretlinePracticeFocus\(\)/);
  assert.match(body, /requestFretlineNativeFullscreen\(\)/);
  assert.match(body, /fretlineFocusBaseSelectSong\(catalogId\)/);
  assert.match(source, /classList\.add\('practice-focus-mode'\)/);
  assert.match(source, /classList\.remove\('practice-focus-mode'\)/);
});

test('the focused dialog fills the viewport and gives the lyric reader remaining space', () => {
  assert.match(styles, /dialog\.minimal-library\.practice-focus-mode\{[^}]*width:100vw[^}]*height:100dvh/);
  assert.match(styles, /\.practice-focus-mode #playAlongView\{[^}]*height:100%[^}]*min-height:0/);
  assert.match(styles, /\.practice-focus-mode \.lyrics-reader\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(styles, /\.practice-focus-mode \.lyrics-viewport\{[^}]*height:auto[^}]*min-height:0/);
  assert.match(styles, /\.practice-focus-mode >\.youtube-player-shell|\.practice-focus-mode>\.youtube-player-shell/);
});

test('leaving the song exits focus mode and native fullscreen', () => {
  const body = assignedFunctionBody('backToLibrary');
  assert.match(body, /leaveFretlinePracticeFocus\(\)/);
  assert.match(body, /fretlineFocusBaseBackToLibrary\(\)/);
  assert.match(source, /document\.exitFullscreen\(\)/);
});
