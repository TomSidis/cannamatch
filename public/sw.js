/* CannaMatch service worker — minimal, network-first.
 * ponytail: deliberately simple. Caches the app shell so the PWA opens offline; NEVER caches
 * /api (auth, scoring, terms must stay live). Runtime caching only — no brittle precache list. */
const CACHE = 'cm-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GETs; never touch the API or non-GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))),
  );
});
