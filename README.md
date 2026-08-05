# Fretline

Fretline is a minimalist, installable guitar and ukulele tuner with tuning-aware chord charts and personal play-along tools. Microphone audio is analyzed on the device and is never uploaded.

## Tuner

- Accurate pitch detection using the YIN algorithm
- Six-string guitar and four-string ukulele modes
- Standard tuning by default
- Guitar presets: Drop D, half-step down, D standard, Drop C, DADGAD, Open G, Open D, and Open E
- Ukulele presets: high-G standard, low G, D tuning, and baritone
- Custom tunings for either instrument
- Automatic string recognition or manual string lock through a proper slider switch
- A4 calibration from 430–450 Hz
- Adjustable microphone sensitivity and note spelling
- Guitar- and ukulele-specific plucked-string references generated on the device
- Live guidance for quiet or unclear microphone input
- Per-string progress, haptics, wake lock, and dark mode

## Chord library

- Chord diagrams generated from the active tuning rather than hard-coded standard-tuning pictures
- Multiple playable voicings up the neck
- Guitar and ukulele support, including alternate and custom tunings
- Common triads, sevenths, sixths, ninths, elevenths, thirteenths, suspended, diminished, augmented, altered dominant, added-tone, power, and slash chords
- Slash-chord diagrams enforce the requested bass note rather than displaying the label over a root-position shape
- Realistic strummed chord previews generated with the same on-device string model as the tuner
- Essential-chord shortcuts and finger-number guidance

## Bundled song library

The repository contains a generated catalog for the supplied YouTube Music playlist. The current catalog includes all **1,611 playlist positions**, representing **1,608 unique YouTube videos**. Repeated videos are preserved in their original playlist positions.

- The catalog appears immediately; no Load or Read titles step is required
- Search covers the complete catalog
- Rows render automatically in small batches to keep mobile scrolling responsive
- Selecting a song loads its exact YouTube video ID instead of relying on the embedded player's truncated playlist list
- Metadata is refreshed monthly by `.github/workflows/index-playlist.yml`
- The indexing workflow reads playlist metadata only and does not download or commit song audio

YouTube supplies playback and controls whether an individual video permits embedding. The static catalog, tuner, chord library, and locally saved chord maps remain available without using YouTube's playlist endpoint.

## Composition-first song chords

Fretline currently includes **601 chord maps**, covering **37.38%** of the 1,608 unique playlist videos:

- 470 high-confidence matches
- 117 medium-confidence matches
- 14 low-confidence matches
- 1,007 unique videos left unmatched

The matching policy follows the underlying song rather than insisting on the exact recording. Remasters, live recordings, acoustic takes, remixes, extended versions, and same-artist alternate versions are accepted when their normalized composition metadata agrees.

Cross-artist cover candidates are checked using transient LRCLIB lyric fingerprints when both recordings can be resolved. **87 accepted cover matches were lyric-verified**, while **183 same-title candidates were rejected because their lyrics conflicted**. Lyric text is never written to the repository: generated provenance contains only the LRCLIB record IDs, aggregate similarity, verification result, and match evidence.

When lyrics cannot be resolved, Fretline permits only narrow same-title fallbacks based on title distinctiveness, artist reliability, duration, and ambiguity. The interface labels each result as a same recording, alternate version, lyric-verified cover, or unverified best effort. Personal edits always override the bundled map on that device.

Every accepted chart records the matched Spotify track, title and artist scores, duration difference, confidence, source, license, chord-spelling simplifications, and composition-match mode. The matcher compares each playlist recording against **376,400 Spotify-linked chord candidates**.

Chord order and section structure come from Chordonomicon. Exact change timestamps are not present in that dataset, so Fretline fits the changes uniformly to the YouTube track duration and labels the timing as estimated. A cover or remix may also use a different key; use the play-along transpose control when needed.

The monthly `.github/workflows/index-chords.yml` workflow rebuilds the catalog, performs composition and lyric-fingerprint validation, reconciles all generated statistics, validates every event and chord symbol, and refuses to publish if coverage drops below 600 charts.

## Play along

- Synchronized current and upcoming chord display for bundled or personal maps
- Transpose, playback speed, seek, and A/B looping
- Tap the current diagram to hear the chord
- Supports exact personal changes such as `0:12 Am` or equal-bar progressions such as `C | G | Am | F`
- Export and import personal chord maps as JSON
- Optional links to external chord sources

## Reference strings

Reference playback uses a deterministic physical-style string model with instrument-specific harmonic decay, pluck position, body resonances, and filtering. It stays fully offline while sounding closer to a real guitar or ukulele string than an oscillator tone.

## Run locally

Microphone access needs a secure origin. `localhost` is treated as secure by current browsers.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Test

```bash
npm test
npm run check
```

The test suite checks pitch detection, tuning data, generated reference strings, tuning-aware chord voicings, playlist parsing, the complete playlist catalog, all bundled chord events and symbols, confidence reconciliation, composition provenance, chord-map timing, transposition, application wiring, and offline assets. The catalog workflow additionally tests the Python matching and lyric-fingerprint policy.

## Refresh generated catalogs

Run **Index complete YouTube Music playlist** to rebuild playlist metadata. Run **Build composition-first chord catalog** to rebuild composition matches and chord maps. Both run the application validation suite before committing generated output.

## Deployment

Pull requests run the validation suite. Pushing to `main` validates the source, publishes the tested commit to `gh-pages`, and requests a GitHub Pages build through `.github/workflows/pages.yml`.

The public URL is:

`https://legedith.github.io/Guitartuner/`

## Browser support

Fretline targets current versions of Chrome, Edge, Firefox, and Safari. It uses twelve-tone equal temperament and requires microphone permission for live tuning. YouTube play-along requires network access and a video that permits embedded playback.

## Licenses

Application source code is MIT licensed. The bundled generated chord catalog is a separate CC BY-NC 4.0 data distribution derived from Chordonomicon and Spotify metadata. LRCLIB is used transiently for cover verification; lyric text is not redistributed. See [`THIRD_PARTY_DATA.md`](THIRD_PARTY_DATA.md) for attribution, modifications, and accuracy limitations.
