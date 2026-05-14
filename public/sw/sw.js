/**
 * Service Worker
 * Strategy:
 *   - Static assets  → Cache First (versioned cache)
 *   - /api/v1/*      → Network First, fallback to cached response
 *   - Navigation     → Network First, fallback to /offline.html
 */

'use strict';

const CACHE_VERSION  = 'v8';
const STATIC_CACHE   = `static-${CACHE_VERSION}`;
const API_CACHE      = `api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/css/app.css',
    '/js/app.js',
    '/js/services/ApiService.js',
    '/js/services/SyncService.js',
    '/js/services/AuthService.js',
    '/js/controllers/BaseController.js',
    '/js/utils/Validator.js',
    '/js/utils/ServiceWorkerUtil.js',
    '/js/utils/SEO.js',
    '/js/components/SwarmCard.js',
    '/js/components/CountdownTimer.js',
    '/js/components/RegionSwitcher.js',
    '/js/controllers/HomeController.js',
    '/js/controllers/ActiveSwarmsController.js',
    '/js/controllers/SwarmDetailController.js',
    '/js/controllers/HowItWorksController.js',
    '/js/controllers/PastWinnersController.js',
    '/js/controllers/FaqController.js',
    '/js/controllers/AccountDashboardController.js',
    '/js/controllers/NectarWalletController.js',
    '/js/controllers/LoginController.js',
    '/js/controllers/RegisterController.js',
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
