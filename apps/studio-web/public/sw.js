/* Hendy Studio PWA shell cache. Authenticated API, signed media, uploads and WebSocket traffic are never cached. */
const CACHE_NAME = 'hendy-studio-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/pwa-192x192.png', '/icons/pwa-512x512.png', '/icons/pwa-maskable-512x512.png'];
const NEVER_CACHE = /^\/(?:api\/|media\/|uploads\/|health(?:$|\/)|ws\/)/;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hendy-studio-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER_CACHE.test(url.pathname) || url.searchParams.has('sig')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/index.html')) || (await caches.match('/'))));
    return;
  }
  if (/\.(?:js|css|svg|png|ico|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
