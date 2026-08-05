const CACHE_NAME = 'fretline-v1';
const APP_ASSETS = [
  './',
  './index.html',
  './styles/foundation.css',
  './styles/tuner.css',
  './styles/dialogs.css',
  './src/boot.js',
  './src/pitch.js',
  './src/tunings.js',
  './src/app-parts/01-state.js',
  './src/app-parts/02-ui.js',
  './src/app-parts/03-selection.js',
  './src/app-parts/04-tunings.js',
  './src/app-parts/05-detection.js',
  './src/app-parts/06-audio.js',
  './src/app-parts/07-events.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
