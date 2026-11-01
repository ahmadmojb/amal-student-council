/*
 * Amal Student Council service worker.
 * Caching policy (see docs/pwa.md):
 *  - Hashed build assets (/assets/*), fonts, icons: cache-first (immutable).
 *  - Page navigations: network-first; the cached app shell is used ONLY when
 *    offline, and the app itself then shows an offline notice. Live data is
 *    never served from this cache.
 *  - Never cached: /api/* (public data, admin, certificate verification),
 *    the daily schedule video (/uploads/schedule-video/, or Firebase Storage —
 *    cross-origin requests are never intercepted).
 */
const VERSION = '__BUILD_ID__';
const SHELL_CACHE = `amal-shell-${VERSION}`;
const ASSET_CACHE = `amal-assets-${VERSION}`;
const MEDIA_CACHE = 'amal-media-v1';
// The daily schedule video is never cached: it expires at midnight and video uses Range requests.
const NEVER_CACHE = [/^\/api\//, /^\/uploads\/schedule-video\//, /^\/admin/, /^\/verify/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon.svg']))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, MEDIA_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // external display, Firebase, etc.
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === '/') caches.open(SHELL_CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('/', { cacheName: SHELL_CACHE })) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  if (url.pathname.startsWith('/uploads/') && req.headers.get('range') === null) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
