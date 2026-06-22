// ===== SERVICE WORKER — Cache First strategy =====
const CACHE_NAME = 'health-app-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/analyses.html',
  '/dynamics.html',
  '/recommendations.html',
  '/workouts.html',
  '/nutrition.html',
  '/goals.html',
  '/profiles.html',
  '/css/style.css',
  '/js/storage.js',
  '/js/norms.js',
  '/js/rules.js',
  '/js/nutrition-db.js',
  '/js/utils.js',
  '/manifest.json'
];

// Install — pre-cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — Cache First, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET and external requests (CDN)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    // For CDN resources (Chart.js) — network first
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
