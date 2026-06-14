const CACHE_NAME = 'artikel-trainer-v3';
const BASE = new URL('./', self.location).href;

const ASSET_PATHS = [
  '',
  'index.html',
  'styles/base.css',
  'styles/layout.css',
  'styles/dashboard.css',
  'styles/practice.css',
  'styles/dictionary.css',
  'styles/stats.css',
  'styles/grammar.css',
  'styles/components.css',
  'js/utils.js',
  'js/store.js',
  'js/gamification.js',
  'js/adaptive.js',
  'js/practice.js',
  'js/dictionary.js',
  'js/stats.js',
  'js/grammar.js',
  'js/notifications.js',
  'js/app.js',
  'data/grammar-rules.js',
  'data/words-core.js',
  'data/words-professional.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'manifest.json'
];

const ASSETS = ASSET_PATHS.map(p => BASE + p);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).then(() => self.skipWaiting())
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match(BASE + 'index.html');
      });
    })
  );
});

self.addEventListener('push', e => {
  let data = { title: 'Artikel Trainer', body: 'Zeit zum Üben! / Time to practice!', icon: BASE + 'icons/icon-192.png' };
  if (e.data) { try { data = { ...data, ...e.data.json() }; } catch (_) {} }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: BASE + 'icons/icon-192.png',
      tag: 'daily-reminder',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      if (cs.length > 0) { cs[0].focus(); cs[0].postMessage({ type: 'NAVIGATE', screen: 'practice' }); }
      else return clients.openWindow(BASE + '?screen=practice');
    })
  );
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-reminder') e.waitUntil(checkAndNotify());
});

async function checkAndNotify() {
  const hour = new Date().getHours();
  if (hour < 8 || hour > 23) return;
  const cs = await clients.matchAll({ type: 'window' });
  if (cs.length > 0) return;
  const icon = hour >= 22 ? BASE + 'icons/icon-red-192.png' : hour >= 19 ? BASE + 'icons/icon-yellow-192.png' : BASE + 'icons/icon-192.png';
  const body = hour >= 22
    ? 'Letzter Aufruf! Noch nicht geübt. / Last call! Not practiced yet.'
    : hour >= 19
    ? 'Noch nicht fertig! / Not done yet!'
    : 'Zeit für deine tägliche Übung! / Time for your daily practice!';
  await self.registration.showNotification('Artikel Trainer', { body, icon, badge: BASE + 'icons/icon-192.png', tag: 'daily-reminder', renotify: true });
}

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_NOTIFICATION') {
    for (const r of (e.data.reminders || [])) {
      const delay = r.time - Date.now();
      if (delay > 0 && delay < 86400000) {
        setTimeout(() => {
          const icon = r.type === 'lastcall' ? BASE + 'icons/icon-red-192.png' : r.type === 'evening' ? BASE + 'icons/icon-yellow-192.png' : BASE + 'icons/icon-192.png';
          const body = r.type === 'lastcall'
            ? `Letzter Aufruf! Noch ${r.remaining} Wörter. / Last call! ${r.remaining} words left.`
            : r.type === 'evening'
            ? `Noch nicht fertig! ${r.remaining} Wörter. / Not done! ${r.remaining} words left.`
            : `Zeit zum Üben! ${r.remaining} Wörter heute. / Practice time! ${r.remaining} words today.`;
          self.registration.showNotification('Artikel Trainer', { body, icon, tag: 'daily-reminder', renotify: true });
        }, delay);
      }
    }
  }
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
