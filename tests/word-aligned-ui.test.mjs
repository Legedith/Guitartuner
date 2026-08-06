import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app-parts/13-lyrics-scroll.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/lyrics.css', import.meta.url), 'utf8');

test('the lyric reader renders chords inside individual word wrappers', () => {
  assert.match(source, /placeChordsAboveWords\(/);
  assert.match(source, /className = 'lyrics-word'/);
  assert.match(source, /className = 'lyrics-word-chords'/);
  assert.match(source, /className = 'lyrics-word-text'/);
  assert.match(source, /button\.dataset\.soundChord = placement\.soundChord/);
  assert.doesNotMatch(source, /className = 'lyrics-chords'/);
});

test('the lyric reader exposes compact guitar and ukulele guidance', () => {
  assert.match(source, /\['guitar', 'ukulele'\]/);
  assert.match(source, /Key \$\{guidance\.key\.name\}/);
  assert.match(source, /Capo \$\{guidance\.capo\.capo\}/);
  assert.match(source, /guidance\.pattern/);
  assert.match(source, /buildSongGuidance\(/);
});

test('word wrappers preserve natural lyric wrapping while anchoring chords', () => {
  assert.match(styles, /\.lyrics-line-text\{[^}]*display:flex[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.lyrics-word\{[^}]*display:inline-grid/);
  assert.match(styles, /\.lyrics-word-chords\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.lyrics-guide\{/);
  assert.match(styles, /\.lyrics-instrument-switch\{/);
});
