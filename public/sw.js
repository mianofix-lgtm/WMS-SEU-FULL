const CACHE = 'seufull-v2';
const PRECACHE = ['/', '/index.html'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('firebase')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && res.type === 'basic') { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
