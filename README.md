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
- Major, minor, dominant 7, major 7, minor 7, major 6, minor 6, add 9, dominant 9, minor 9, sus2, sus4, diminished, diminished 7, augmented, power, and slash chords
- Slash-chord diagrams enforce the requested bass note rather than displaying the label over a root-position shape
- Realistic strummed chord previews generated with the same on-device string model as the tuner
- Essential-chord shortcuts and finger-number guidance

## Bundled song library

The repository contains a generated catalog for the supplied YouTube Music playlist. The current catalog includes all 1,611 playable playlist entries, including repeated videos as separate playlist positions.

- The catalog appears immediately; no Load or Read titles step is required
- Search covers the complete catalog
- Rows render automatically in small batches to keep mobile scrolling responsive
- Selecting a song loads its exact YouTube video ID instead of relying on the embedded player's truncated playlist list
- Metadata is refreshed monthly by `.github/workflows/index-playlist.yml`
- The indexing workflow reads playlist metadata only and does not download or commit song audio

YouTube supplies playback and controls whether an individual video permits embedding. The static catalog, tuner, chord library, and locally saved chord maps remain available without using YouTube's playlist endpoint.

## Play along

- Supports exact timed changes such as `0:12 Am` or equal-bar progressions such as `C | G | Am | F`
- Synchronized current and upcoming chords
- Transpose, playback speed, seek, and A/B looping
- Tap the current diagram to hear the chord
- Export and import personal chord maps as JSON
- Optional links to licensed chord sources

YouTube playlist metadata does not contain chord progressions. Fretline therefore does not fabricate charts or scrape and redistribute commercial transcriptions. Use a licensed chord source, an authorized provider export, or your own chart, then store its timing and progression locally.

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

The test suite checks pitch detection, tuning data, generated reference strings, tuning-aware chord voicings, playlist parsing, the bundled catalog, chord-map timing, transposition, application wiring, and offline assets.

## Refresh the playlist catalog

Run the **Index complete YouTube Music playlist** workflow manually, or wait for its monthly schedule. The workflow follows every playlist continuation, refuses to publish fewer than 1,000 entries, validates the application, and commits the refreshed catalog.

## Deployment

Pull requests run the validation suite. Pushing to `main` validates the source, publishes the tested commit to `gh-pages`, and requests a GitHub Pages build through `.github/workflows/pages.yml`.

The public URL is:

`https://legedith.github.io/Guitartuner/`

## Browser support

Fretline targets current versions of Chrome, Edge, Firefox, and Safari. It uses twelve-tone equal temperament and requires microphone permission for live tuning. YouTube play-along requires network access and a video that permits embedded playback.

## License

MIT
