# Third-party data

Fretline application source code remains licensed under the MIT License in `LICENSE`.

The generated files below are a separate data distribution and are **not** covered by the MIT License:

- `src/data/chord-catalog.json`
- `src/data/chord-match-report.json`

## Chordonomicon

Chord sequences are derived from **Chordonomicon**, published by the Intelligent Systems Lab at the National Technical University of Athens.

- Dataset page: https://huggingface.co/datasets/ailsntua/Chordonomicon
- License: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)
- Citation: Kantarelis et al., *CHORDONOMICON: A Dataset of 666,000 Songs and their Chord Progressions* (2024)

The distributed catalog is a modified derivative. Fretline normalizes chord spelling, preserves section order, matches Spotify-linked records to playlist recordings, and generates estimated change times fitted to the YouTube track duration.

## Spotify Huge Track Analysis Dataset

Recording names, artists, albums, durations, and tempo used during matching are obtained from the **Spotify Huge Track Analysis Dataset**.

- Dataset page: https://huggingface.co/datasets/GildasLeDrogoff/spotify-huge-track-analysis-dataset
- License declared by the dataset publisher: CC BY-NC 4.0

This metadata is used to resolve Chordonomicon's Spotify track identifiers and is not presented as Spotify endorsement.

## Accuracy and provenance

Every accepted chart includes:

- the matched Spotify track identifier, title, artist, and album;
- title, artist, duration, and ambiguity scores;
- high, medium, or low confidence;
- the number of chord-spelling simplifications, if any;
- an explicit `estimated-uniform-fit` timing label.

Chord order and section structure come from the source transcription. Exact chord-change times are estimates because the source dataset does not provide synchronized timestamps. Personal edits in Fretline override the bundled chart on that device.

## Non-commercial condition

CC BY-NC 4.0 permits sharing and adapting the data with attribution for non-commercial purposes. Anyone redistributing or deploying this repository is responsible for ensuring that their use of the bundled chord data satisfies that license. The tuner and chord-diagram code can be used separately under MIT by omitting the two generated catalog files and their integration module.
