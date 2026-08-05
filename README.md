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
- Major, minor, dominant 7, major 7, minor 7, sus2, sus4, diminished, augmented, and power chords
- Realistic strummed chord previews generated with the same on-device string model as the tuner
- Essential-chord shortcuts and finger-number guidance

## Song library and play along

- Loads a public YouTube or YouTube Music playlist through YouTube's embedded player after explicit user action
- Keeps playlist metadata and personal chord maps in browser storage
- Reads available song titles from the embedded player; unavailable or non-embeddable songs remain under YouTube's control
- Supports exact timed changes such as `0:12 Am` or equal-bar progressions such as `C | G | Am | F`
- Synchronized current and upcoming chords
- Transpose, playback speed, seek, and A/B looping
- Tap the current diagram to hear the chord
- Export and import personal chord maps as JSON
- Optional links to licensed chord sources

Fretline does not scrape or redistribute commercial chord transcriptions. Use a licensed service or your own chart, then store the timing and progression locally. YouTube supplies the song playback; Fretline does not download or proxy media.

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

The test suite checks pitch detection, tuning data, generated reference strings, tuning-aware chord voicings, playlist parsing, chord-map timing, and transposition.

## Deployment

Pull requests run the validation suite. Pushing to `main` validates the source, publishes the tested commit to `gh-pages`, and requests a GitHub Pages build through `.github/workflows/pages.yml`.

The public URL is:

`https://legedith.github.io/Guitartuner/`

## Browser support

Fretline targets current versions of Chrome, Edge, Firefox, and Safari. It uses twelve-tone equal temperament and requires microphone permission for live tuning. YouTube play-along requires network access and a playlist whose videos permit embedded playback; the tuner, chord library, and locally stored chord maps remain available offline.

## License

MIT
