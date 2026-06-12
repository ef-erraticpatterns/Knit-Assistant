const CACHE = 'knit-assistant-v4';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/feedback.js', '/widget.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for our own app code: always try to load the freshest version
// when the server is reachable, falling back to the cache only when offline.
// This stops the home-screen app from getting stuck on a stale version.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // third-party (CDN, OpenRouter) → straight to network
  if (url.pathname.startsWith('/api/')) return;       // live data/state → never cached

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
  );
});
