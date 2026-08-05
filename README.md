# Fretline

Fretline is a minimalist, installable guitar and ukulele tuner that runs entirely in the browser. Microphone audio is analyzed on the device and is never uploaded.

## Features

- Accurate pitch detection using the YIN algorithm
- Six-string guitar and four-string ukulele modes
- Standard tuning by default
- Guitar presets: Drop D, half-step down, D standard, Drop C, DADGAD, Open G, Open D, and Open E
- Ukulele presets: high-G standard, low G, D tuning, and baritone
- Custom tunings for either instrument
- Automatic string recognition or manual string lock
- A4 calibration from 430–450 Hz
- Adjustable microphone sensitivity and note spelling
- Guitar- and ukulele-specific plucked-string references generated on the device
- Live guidance for quiet or unclear microphone input
- Per-string progress, haptics, wake lock, and dark mode
- Installable PWA with offline support
- No accounts, analytics, licensed samples, or server-side audio processing

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

The test suite checks pitch detection, tuning data, and the generated reference strings across the supported guitar and ukulele range.

## Deployment

Pushing to `main` runs the GitHub Pages workflow in `.github/workflows/pages.yml`. It validates the source, publishes the tested commit to `gh-pages`, and requests a Pages build.

The public URL is:

`https://legedith.github.io/Guitartuner/`

## Browser support

Fretline targets current versions of Chrome, Edge, Firefox, and Safari. It uses twelve-tone equal temperament and requires microphone permission for live tuning.

## License

MIT
