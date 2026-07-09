// Bumped for the key-model rewrite: app.js now speaks a breaking wire
// protocol (context-addressed renders instead of card broadcasts), so a
// stale cached shell must not keep serving the old app.js against a new
// server — see openspec/changes/elgato-parity-key-model.
const CACHE_NAME = 'stream-deck-shell-v5';
const SHELL_FILES = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/vendor/nosleep.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first for the app shell only. All live data comes over the WebSocket,
// so there is nothing else worth intercepting here.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
