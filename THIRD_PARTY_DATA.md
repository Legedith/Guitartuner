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

The distributed catalog is a modified derivative. Fretline normalizes chord spelling, preserves section order, matches Spotify-linked records to playlist compositions, and generates estimated change times fitted to the YouTube track duration.

## Spotify Huge Track Analysis Dataset

Recording names, artists, albums, durations, and tempo used during matching are obtained from the **Spotify Huge Track Analysis Dataset**.

- Dataset page: https://huggingface.co/datasets/GildasLeDrogoff/spotify-huge-track-analysis-dataset
- License declared by the dataset publisher: CC BY-NC 4.0

This metadata is used to resolve Chordonomicon's Spotify track identifiers and is not presented as Spotify endorsement.

## LRCLIB composition verification

Cross-artist cover candidates are verified against lyric records returned by the public **LRCLIB** API when both the playlist recording and candidate recording can be resolved.

- Service: https://lrclib.net/
- API documentation: https://lrclib.net/docs

Fretline uses LRCLIB only as a transient composition fingerprint. Lyric text is held in the workflow cache while matching and is never committed, bundled, displayed, or redistributed. Accepted catalog entries retain only:

- the LRCLIB record identifiers;
- an aggregate lyric-similarity score;
- verified, uncertain, unavailable, or not-required status;
- the titles and artists returned for the two compared records.

Same-title candidates whose lyric fingerprints clearly conflict are rejected. Candidates for which lyrics are unavailable are accepted only through narrower metadata fallbacks and are labelled as unverified best efforts.

## Composition-first matching

The matcher intentionally accepts a chord chart from another recording of the same composition. This includes covers, remasters, live recordings, acoustic takes, remixes, extended versions, slowed or sped-up versions, and similar releases.

Every accepted chart includes:

- the matched Spotify track identifier, title, artist, and album;
- title, artist, duration, and ambiguity scores;
- high, medium, or low confidence;
- same-recording, alternate-version, lyric-verified-cover, or unverified match mode;
- lyric-verification evidence when applicable;
- the number of chord-spelling simplifications, if any;
- an explicit `estimated-uniform-fit` timing label.

The current catalog contains 601 maps for 1,608 unique playlist videos. Of those, 87 are cross-artist covers verified by lyric fingerprints and 18 are accepted alternate versions. The matcher rejected 183 plausible same-title candidates after detecting conflicting lyrics.

## Accuracy and provenance

Chord order and section structure come from the source transcription. Exact chord-change times are estimates because the source dataset does not provide synchronized timestamps. Covers and remixes may also differ in key, arrangement, inserted sections, or duration. Use transposition and personal timing edits where necessary.

Personal edits in Fretline override the bundled chart on that device. The full accepted-match evidence and unmatched candidate report are retained in `src/data/chord-match-report.json` for auditability.

## Non-commercial condition

CC BY-NC 4.0 permits sharing and adapting the chord data with attribution for non-commercial purposes. Anyone redistributing or deploying this repository is responsible for ensuring that their use of the bundled chord data satisfies that license. The tuner and chord-diagram code can be used separately under MIT by omitting the two generated catalog files and their integration modules.
