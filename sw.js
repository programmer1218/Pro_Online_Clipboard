/* Online Clipboard service worker — offline shell + fast repeat loads.
   Strategy:
     - Navigations (HTML): network-first, fall back to cached shell when offline.
     - Same-origin static assets: cache-first, revalidate in background.
     - Cross-origin (Firebase, Google Fonts, gstatic, ads): always network — never cached.
   Bump CACHE_VERSION on any asset change to invalidate old caches. */
const CACHE_VERSION = 'clip-v1';
const SHELL = [
  '/',
  '/index.html',
  '/style-pages.css',
  '/favicon.svg',
  '/favicon-32.png',
  '/favicon-180.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle our own origin. Firebase / fonts / ads go straight to network.
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first so users get fresh content, cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Static assets: cache-first, refresh in background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
