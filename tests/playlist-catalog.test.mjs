import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizePlaylistTracks } from '../src/song-library.js';

const catalog = JSON.parse(await readFile(new URL('../src/data/playlist-catalog.json', import.meta.url), 'utf8'));

test('bundled catalog contains the complete large playlist', () => {
  assert.equal(catalog.schema, 'fretline-playlist-catalog');
  assert.equal(catalog.playlistId, 'PL0gpFgtesNu015JGaKSx8BonbVjGRefKb');
  assert.ok(catalog.playableEntries >= 1000, `expected at least 1000 entries, received ${catalog.playableEntries}`);
  assert.equal(catalog.tracks.length, catalog.playableEntries);
  assert.ok(catalog.reportedEntries >= catalog.playableEntries);
});

test('every catalog entry has a stable identity and playable video id', () => {
  const catalogIds = new Set();
  for (const [position, track] of catalog.tracks.entries()) {
    assert.match(track.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(typeof track.catalogId, 'string');
    assert.ok(track.catalogId.length > 11);
    assert.ok(!catalogIds.has(track.catalogId), `duplicate catalog id ${track.catalogId}`);
    catalogIds.add(track.catalogId);
    assert.equal(track.index, position);
    assert.ok(track.title);
  }
});

test('sanitization retains repeated videos when catalog ids differ', () => {
  const repeated = [
    { catalogId: 'dQw4w9WgXcQ:0', videoId: 'dQw4w9WgXcQ', index: 0, title: 'First occurrence' },
    { catalogId: 'dQw4w9WgXcQ:8', videoId: 'dQw4w9WgXcQ', index: 8, title: 'Repeated occurrence' },
  ];
  const sanitized = sanitizePlaylistTracks(repeated);
  assert.equal(sanitized.length, 2);
  assert.deepEqual(sanitized.map((track) => track.index), [0, 8]);
});
