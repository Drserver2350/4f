/* Felani4F — service worker
   HTML / JS / CSS are network-first so published tracks, covers and the
   catalogue show up right after a deploy; images, fonts and audio are
   cache-first for speed. */
const V = 'felani4f-v3';
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
const isFresh = (url) =>
  url.pathname.endsWith('.html') || url.pathname.endsWith('/') ||
  url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
  url.pathname.endsWith('overrides.js') || url.pathname.endsWith('config.js') ||
  url.pathname.endsWith('.webmanifest');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // always fresh: the published catalogue + app shell
  if (isFresh(url)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(V).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      }).catch(() => caches.open(V).then((c) => c.match(req).then((hit) => hit || c.match('./index.html')).then((hit) => hit || Response.error())))
    );
    return;
  }

  // cache-first: media, fonts, images
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  }));
});
