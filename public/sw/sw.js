/**
 * Service Worker
 * Strategy:
 *   - Static assets  → Cache First (versioned cache)
 *   - /api/v1/*      → Network First, fallback to cached response
 *   - Navigation     → Network First, fallback to /offline.html
 */

'use strict';

const CACHE_VERSION  = 'v6';
const STATIC_CACHE   = `static-${CACHE_VERSION}`;
const API_CACHE      = `api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/public/css/app.css',
    '/public/js/app.js',
    '/public/js/services/ApiService.js',
    '/public/js/services/SyncService.js',
    '/public/js/services/AuthService.js',
    '/public/js/controllers/BaseController.js',
    '/public/js/utils/Validator.js',
    '/public/js/utils/ServiceWorkerUtil.js',
    '/public/js/components/SwarmCard.js',
    '/public/js/components/CountdownTimer.js',
    '/public/js/components/RegionSwitcher.js',
    '/public/js/controllers/HomeController.js',
    '/public/js/controllers/ActiveSwarmsController.js',
    '/public/js/controllers/SwarmDetailController.js',
    '/public/js/controllers/HowItWorksController.js',
    '/public/js/controllers/PastWinnersController.js',
    '/public/js/controllers/FaqController.js',
];

// -------------------------
// Install — pre-cache static assets
// -------------------------

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
              .then((cache) => cache.addAll(STATIC_ASSETS))
              .then(() => self.skipWaiting())
    );
});

// -------------------------
// Activate — clear old caches
// -------------------------

self.addEventListener('activate', (event) => {
    const validCaches = [STATIC_CACHE, API_CACHE];

    event.waitUntil(
        caches.keys()
              .then((keys) => Promise.all(
                  keys
                    .filter((key) => !validCaches.includes(key))
                    .map((key)    => caches.delete(key))
              ))
              .then(() => self.clients.claim())
    );
});

// -------------------------
// Fetch — routing strategy
// -------------------------

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url         = new URL(request.url);

    // API requests → Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // Navigation → Network First, fallback to offline page
    if (request.mode === 'navigate') {
        event.respondWith(navigationHandler(request));
        return;
    }

    // Static assets → Cache First
    event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// -------------------------
// Strategies
// -------------------------

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);

    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }

    return response;
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);

        if (response.ok && request.method === 'GET') {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }

        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        return new Response(
            JSON.stringify({ success: false, message: 'You are offline.', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

async function navigationHandler(request) {
    try {
        return await fetch(request);
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        return caches.match('/offline.html');
    }
}

// -------------------------
// Message handler (e.g. skip waiting)
// -------------------------

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
