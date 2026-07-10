// Bump this on every app.js/index.html/styles.css change, not just breaking
// ones. The fetch handler below is cache-first, so an already-installed PWA
// keeps serving whatever shell files are under CACHE_NAME forever until this
// name itself changes — a content-only fix to app.js is otherwise invisible
// on a phone that already installed a previous version.
const CACHE_NAME = 'stream-deck-shell-v8';
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
