const CACHE_VERSION = 'v2';
const STATIC_CACHE = `roadsync-static-${CACHE_VERSION}`;
const API_CACHE = `roadsync-api-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `roadsync-dynamic-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ─── IndexedDB for sync queue ───────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('RoadSyncSync', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueueSize() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('queue', 'readonly');
    const count = tx.objectStore('queue').count();
    count.onsuccess = () => resolve(count.result);
    count.onerror = () => resolve(0);
  });
}

async function addToQueue(request) {
  const db = await openDB();
  const clone = request.clone();
  const body = await clone.text();
  const entry = {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body: body || null,
    timestamp: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replayQueue() {
  const db = await openDB();
  const entries = await new Promise((resolve) => {
    const tx = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });

  const failed = [];
  for (const entry of entries) {
    try {
      const headers = new Headers(entry.headers);
      const body = entry.body ? entry.body : undefined;
      const res = await fetch(entry.url, { method: entry.method, headers, body });
      if (!res.ok) failed.push(entry);
    } catch {
      failed.push(entry);
    }
  }

  // Clear queue, re-add failed items
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').clear();
  for (const entry of failed) {
    tx.objectStore('queue').add(entry);
  }
  await new Promise((resolve) => { tx.oncomplete = resolve; });

  // Notify all clients about new count
  const count = await getQueueSize();
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'PENDING_COUNT', count });
  }
}

// ─── Install ─────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Background Sync ─────────────────────────────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'roadsync-sync') {
    e.waitUntil(replayQueue());
  }
});

// ─── Messages from client ────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SYNC_NOW') {
    e.waitUntil(replayQueue());
  }
  if (e.data?.type === 'GET_PENDING_COUNT') {
    e.waitUntil(
      getQueueSize().then((count) => {
        if (e.source) e.source.postMessage({ type: 'PENDING_COUNT', count });
      })
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isMutationRequest(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isStaticAsset(url) {
  const exts = ['.css', '.js', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.json'];
  return exts.some((ext) => url.pathname.endsWith(ext)) || url.href.includes('/_next/static/');
}

function isNavigation(url) {
  return url.pathname === '/' || (url.pathname.startsWith('/') && !url.pathname.startsWith('/api/'));
}

// ─── Fetch ───────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET' && !isMutationRequest(e.request.method)) return;

  // ── Static assets: cache-first ──
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetchAndCache(e.request, STATIC_CACHE))
    );
    return;
  }

  // ── Navigation pages: network-first with cache fallback ──
  if (isNavigation(url)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) cachePut(DYNAMIC_CACHE, e.request, res.clone());
          return res;
        })
        .catch(() => caches.match(e.request) || caches.match('/'))
    );
    return;
  }

  // ── API GET: network-first with cache fallback ──
  if (isApiRequest(url) && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) cachePut(API_CACHE, e.request, res.clone());
          return res;
        })
        .catch(() => caches.match(e.request).then((cached) => {
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true, error: 'Ви офлайн' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }))
    );
    return;
  }

  // ── API mutations: try network, queue on failure ──
  if (isApiRequest(url) && isMutationRequest(e.request.method)) {
    e.respondWith(
      fetch(e.request.clone()).then(async (res) => {
        // After successful mutation, try to sync any pending items
        const count = await getQueueSize();
        if (count > 0) replayQueue();
        return res;
      }).catch(async () => {
        await addToQueue(e.request.clone());
        const count = await getQueueSize();
        // Notify clients about pending count
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({ type: 'PENDING_COUNT', count });
        }
        return new Response(JSON.stringify({ offline: true, queued: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }
});

// ─── Utility ─────────────────────────────────────────────────────
function fetchAndCache(request, cacheName) {
  return fetch(request).then((res) => {
    if (res.ok) cachePut(cacheName, request, res.clone());
    return res;
  });
}

function cachePut(cacheName, request, response) {
  if (response.type === 'opaque') return;
  caches.open(cacheName).then((c) => c.put(request, response));
}
