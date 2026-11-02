// Offline cache: network first for the page, cache first for built assets.
const CACHE = 'deadgate-v2';
self.addEventListener('install', (e) => {
  // Precache the page and every built asset it links to, so the app works offline after one visit.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg']);
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
    const assets = Array.from(html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g), (m) => m[1]);
    await c.addAll(assets);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
});
