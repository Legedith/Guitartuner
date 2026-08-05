import * as Chords from './chords.js';
import * as Pitch from './pitch.js';
import * as ReferenceStrings from './reference-string.js';
import * as SongLibrary from './song-library.js';
import * as Tunings from './tunings.js';

Object.assign(globalThis, Chords, Pitch, ReferenceStrings, SongLibrary, Tunings);

const applicationParts = [
  './app-parts/01-state.js',
  './app-parts/02-ui.js',
  './app-parts/03-selection.js',
  './app-parts/04-tunings.js',
  './app-parts/05-detection.js',
  './app-parts/06-audio.js',
  './app-parts/08-chords.js',
  './app-parts/09-library.js',
  './app-parts/07-events.js',
];

for (const relativePath of applicationParts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(relativePath, import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${relativePath}`));
    document.head.append(script);
  });
}
