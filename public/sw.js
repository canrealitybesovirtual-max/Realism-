// Network-first for navigations (always get the newest build), cache-first for hashed assets.
const CACHE = 'fogline-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const store = (res) => {
    if (res.ok && res.type === 'basic') {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone));
    }
    return res;
  };

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(store).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then(store)));
});
