/* 4F — service worker: offline shell + audio cache */
const V = '4f-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/css/style.css', './assets/js/data.js', './assets/js/app.js',
  './assets/fonts/vazirmatn-sub.woff2', './assets/fonts/unbounded-sub.woff2',
  './assets/img/orbit-zero.jpg', './assets/img/neon-night.jpg', './assets/img/dusk.jpg',
  './assets/img/glass.jpg', './assets/img/circuit.jpg',
  './assets/img/orbit-zero-sm.jpg', './assets/img/neon-night-sm.jpg', './assets/img/dusk-sm.jpg',
  './assets/img/glass-sm.jpg', './assets/img/circuit-sm.jpg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // audio: cache-first, stored on first play/download
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
  // static: stale-while-revalidate
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
