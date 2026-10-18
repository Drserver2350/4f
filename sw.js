/* Felani4F — service worker (offline shell + audio cache) */
const V = 'felani4f-v1';
const SHELL = [
  './', './index.html', './credits.html', './manifest.webmanifest',
  './assets/css/style.css', './assets/js/data.js', './assets/js/api.js', './assets/js/app.js',
  './assets/fonts/vazirmatn-sub.woff2', './assets/fonts/unbounded-sub.woff2',
  './assets/img/hero-bg.jpg', './assets/img/texture.jpg', './assets/img/og.jpg',
  './assets/img/icon-192.png', './assets/img/icon-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // never cache API calls
  if (url.pathname.endsWith('.mp3')) {
    e.respondWith(caches.open(V).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
