import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterChartedTracks, trackHasChordChart } from '../src/library-view.js';

const playlist = JSON.parse(await readFile(new URL('../src/data/playlist-catalog.json', import.meta.url), 'utf8'));
const chordCatalog = JSON.parse(await readFile(new URL('../src/data/chord-catalog.json', import.meta.url), 'utf8'));
const charts = chordCatalog.charts ?? {};

test('the visible library contains only songs with usable chord events', () => {
  const visible = filterChartedTracks(playlist.tracks, charts);
  const expected = playlist.tracks.filter((track) => Array.isArray(charts[track.videoId]?.events) && charts[track.videoId].events.length > 0);
  assert.equal(visible.length, expected.length);
  assert.ok(visible.length >= 600);
  assert.ok(visible.length < playlist.tracks.length);
  assert.ok(visible.every((track) => trackHasChordChart(track, charts)));
});

test('uncharted placeholder songs are excluded', () => {
  const uncharted = playlist.tracks.find((track) => !trackHasChordChart(track, charts));
  assert.ok(uncharted, 'expected the source playlist to contain an uncharted song');
  assert.ok(!filterChartedTracks([uncharted], charts).length);
});

test('search runs after the chart filter', () => {
  const visible = filterChartedTracks(playlist.tracks, charts);
  const target = visible.find((track) => track.title && track.artist) ?? visible[0];
  const titleNeedle = target.title.split(/\s+/)[0].toLocaleLowerCase();
  const matches = filterChartedTracks(playlist.tracks, charts, titleNeedle);
  assert.ok(matches.some((track) => track.catalogId === target.catalogId));
  assert.ok(matches.every((track) => trackHasChordChart(track, charts)));
});

test('repeated playlist positions remain separate when their song has chords', () => {
  const duplicateTracks = [
    { catalogId: 'same:1', videoId: 'sameVideo01', index: 1, title: 'Song', artist: 'Artist' },
    { catalogId: 'same:9', videoId: 'sameVideo01', index: 9, title: 'Song', artist: 'Artist' },
  ];
  const duplicateCharts = { sameVideo01: { events: [{ time: 0, chord: 'C' }] } };
  assert.deepEqual(filterChartedTracks(duplicateTracks, duplicateCharts).map((track) => track.catalogId), ['same:1', 'same:9']);
});

test('minimal UI removes management and empty-chart controls', async () => {
  const source = await readFile(new URL('../src/app-parts/12-minimal-library.js', import.meta.url), 'utf8');
  for (const control of ['playlistForm', 'librarySummary', 'libraryStatus', 'indexPlaylistButton', 'exportChartsButton', 'importChartsInput', 'noChartMessage', 'findChordsButton', 'songChartDialog']) {
    assert.match(source, new RegExp(`dom\\.${control}`), `minimal UI does not address ${control}`);
  }
  assert.match(source, /filterChartedTracks\(settings\.playlistTracks, settings\.songCharts/);
});
