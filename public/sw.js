const CACHE_NAME = 'roadsync-v1';
const STATIC_ASSETS = ['/', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET') return; const u = new URL(e.request.url); if (u.pathname.startsWith('/api/')) return; e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE_NAME).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request))); });
