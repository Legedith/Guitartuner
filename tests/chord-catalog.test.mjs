import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseChordSymbol } from '../src/chords.js';

const chordCatalog = JSON.parse(await readFile(new URL('../src/data/chord-catalog.json', import.meta.url), 'utf8'));
const playlistCatalog = JSON.parse(await readFile(new URL('../src/data/playlist-catalog.json', import.meta.url), 'utf8'));
const charts = Object.entries(chordCatalog.charts ?? {});
const playlistVideoIds = new Set((playlistCatalog.tracks ?? []).map((track) => track.videoId));

test('bundled chord catalog has increased lyrics-aware composition coverage', () => {
  assert.equal(chordCatalog.schema, 'fretline-chord-catalog');
  assert.equal(chordCatalog.version, 1);
  assert.equal(chordCatalog.playlistId, 'PL0gpFgtesNu015JGaKSx8BonbVjGRefKb');
  assert.equal(chordCatalog.license, 'CC BY-NC 4.0');
  assert.equal(chordCatalog.matchingPolicy, 'composition-first-lyrics-v2');
  assert.equal(chordCatalog.stats.matchingPolicy, 'composition-first-lyrics-v2');
  assert.equal(chordCatalog.stats.playlistEntries, 1611);
  assert.equal(chordCatalog.stats.uniqueVideos, playlistVideoIds.size);
  assert.equal(chordCatalog.stats.uniqueVideos, 1608);
  assert.ok(chordCatalog.stats.chartedUniqueVideos >= 600, `expected at least 600 charts, received ${chordCatalog.stats.chartedUniqueVideos}`);
  assert.equal(
    chordCatalog.stats.coveragePercent,
    Number(((charts.length / playlistVideoIds.size) * 100).toFixed(2)),
  );
  assert.equal(chordCatalog.stats.unmatched, chordCatalog.stats.uniqueVideos - charts.length);
  assert.equal(charts.length, chordCatalog.stats.chartedUniqueVideos);
  assert.equal(
    chordCatalog.stats.highConfidence + chordCatalog.stats.mediumConfidence + chordCatalog.stats.lowConfidence,
    charts.length,
  );
  assert.ok(chordCatalog.stats.lyricsConflictsRejected > 0, 'expected lyric verification to reject at least one same-title different song');
});

test('catalog attribution and limitations are explicit', () => {
  assert.equal(chordCatalog.attribution.chords.name, 'Chordonomicon');
  assert.match(chordCatalog.attribution.chords.url, /^https:\/\//);
  assert.match(chordCatalog.attribution.chords.citation, /CHORDONOMICON/i);
  assert.match(chordCatalog.attribution.spotifyMetadata.url, /^https:\/\//);
  assert.match(chordCatalog.timingNotice, /estimat/i);
});

test('every accepted map belongs to the playlist and declares lyric-aware provenance', () => {
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  const matchModes = new Set(['same-composition-cover', 'same-composition-version', 'same-title-recording', 'same-title-unverified', 'fuzzy-composition']);
  const lyricStatuses = new Set(['verified', 'uncertain', 'unavailable', 'not-required']);
  let verifiedCovers = 0;
  let unverifiedFallbacks = 0;
  for (const [videoId, chart] of charts) {
    assert.match(videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(playlistVideoIds.has(videoId), `${videoId} is not in the bundled playlist`);
    assert.equal(chart.videoId, videoId);
    assert.equal(chart.bundled, true);
    assert.equal(chart.license, chordCatalog.license);
    assert.match(chart.sourceUrl, /^https:\/\//);
    assert.ok(chart.raw.length > 0);
    assert.ok(chart.events.length >= 2);
    assert.equal(chart.provenance.dataset, 'Chordonomicon');
    assert.match(chart.provenance.spotifySongId, /^[A-Za-z0-9]{22}$/);
    assert.ok(['high', 'medium', 'low'].includes(chart.provenance.confidence));
    assert.equal(chart.provenance.timing, 'estimated-uniform-fit');
    assert.equal(chart.provenance.policy, 'composition-first-lyrics-v2');
    assert.ok(matchModes.has(chart.provenance.matchMode), `${videoId} has unknown match mode ${chart.provenance.matchMode}`);
    assert.ok(lyricStatuses.has(chart.provenance.lyricsVerification), `${videoId} has invalid lyric status ${chart.provenance.lyricsVerification}`);
    assert.equal(typeof chart.provenance.titleExact, 'boolean');
    assert.equal(typeof chart.provenance.artistEquivalent, 'boolean');
    assert.equal(typeof chart.provenance.versionDifferenceAccepted, 'boolean');
    assert.ok(Array.isArray(chart.provenance.playlistVersionTags));
    assert.ok(Array.isArray(chart.provenance.matchedVersionTags));
    assert.ok(Number.isFinite(chart.provenance.score));
    assert.ok(Number.isFinite(chart.provenance.titleScore));
    assert.ok(Number.isFinite(chart.provenance.artistScore));
    if (chart.provenance.lyricsVerification === 'verified') {
      assert.ok(Number.isFinite(chart.provenance.lyricsSimilarity));
      assert.ok(chart.provenance.lyricsSimilarity >= 0 && chart.provenance.lyricsSimilarity <= 1);
      assert.ok(Number.isFinite(chart.provenance.lrclibTargetId));
      assert.ok(Number.isFinite(chart.provenance.lrclibCandidateId));
    }
    if (chart.provenance.matchMode === 'same-composition-cover') {
      assert.equal(chart.provenance.lyricsVerification, 'verified');
      verifiedCovers += 1;
    }
    if (chart.provenance.matchMode === 'same-title-unverified') {
      assert.ok(['unavailable', 'uncertain'].includes(chart.provenance.lyricsVerification));
      unverifiedFallbacks += 1;
    }
    confidenceCounts[chart.provenance.confidence] += 1;
  }
  assert.equal(verifiedCovers, chordCatalog.stats.lyricsVerified);
  assert.equal(unverifiedFallbacks, chordCatalog.stats.unverifiedFallbackAccepted + chordCatalog.stats.uncertainFallbackAccepted);
  assert.deepEqual(confidenceCounts, {
    high: chordCatalog.stats.highConfidence,
    medium: chordCatalog.stats.mediumConfidence,
    low: chordCatalog.stats.lowConfidence,
  });
});

test('every generated event is sorted and uses a supported chord symbol', () => {
  for (const [videoId, chart] of charts) {
    let previousTime = -1;
    for (const event of chart.events) {
      assert.ok(Number.isFinite(event.time) && event.time >= 0, `${videoId} has an invalid event time`);
      assert.ok(event.time >= previousTime, `${videoId} has events out of order`);
      previousTime = event.time;
      assert.equal(typeof event.section, 'string');
      if (event.chord !== '—') assert.ok(parseChordSymbol(event.chord), `${videoId} has unsupported chord ${event.chord}`);
    }
  }
});

test('estimated events do not extend beyond a reasonable song boundary', () => {
  const durationsByVideo = new Map((playlistCatalog.tracks ?? []).map((track) => [track.videoId, Number(track.duration) || 0]));
  for (const [videoId, chart] of charts) {
    const duration = durationsByVideo.get(videoId) || 0;
    const finalEvent = chart.events.at(-1);
    assert.ok(finalEvent.time <= 86400);
    if (duration > 0) assert.ok(finalEvent.time <= duration + 2, `${videoId} extends beyond its playlist duration`);
  }
});
