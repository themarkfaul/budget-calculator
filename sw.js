// Service worker: keeps a copy of the app's own files so it opens with no internet connection.
// Network first: when online you always get the newest version (the site updates on every push);
// the saved copy is only used when the network fails. Budget data itself is never cached here
// (requests to Supabase pass straight through); the app keeps its own offline copy of the list.

var CACHE = 'mybudgetai-v1';

var APP_FILES = [
    '/', '/index.html', '/app.html', '/mortgage.html', '/privacy.html', '/reset-password.html',
    '/manifest.webmanifest', '/css/styles.css',
    '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png',
    '/js/config.js', '/js/supabase-client.js', '/js/auth.js', '/js/db.js', '/js/tax-limits.js', '/js/state-tax.js', '/js/mortgage-rates.js',
    '/js/mortgage-market.js', '/js/mortgage-handoff.js', '/js/mortgage-calculator.js', '/js/csv-import.js', '/js/state.js',
    '/js/helpers.js', '/js/screens.js', '/js/income.js', '/js/education.js', '/js/other-expenses.js', '/js/other-income.js', '/js/savings.js', '/js/escrow.js', '/js/actual.js',
    '/js/budget-editor.js', '/js/suggestions.js', '/js/explain.js', '/js/calculations.js', '/js/money-chart.js',
    '/js/compare.js', '/js/print-report.js', '/js/sharing.js', '/js/export.js', '/js/offline.js', '/js/register-sw.js', '/js/main.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(CACHE).then(function (cache) {
        // One missing file shouldn't stop the rest from being saved
        return Promise.all(APP_FILES.map(function (url) {
            return cache.add(url).catch(function () { /* fetched and saved later instead */ });
        }));
    }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

function isAppFile(url) {
    return url.origin === self.location.origin || url.href.indexOf('https://cdn.jsdelivr.net/npm/@supabase/') === 0;
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;
    var url = new URL(request.url);
    if (!isAppFile(url)) return;   // Supabase and anything else go straight to the network

    event.respondWith(fetch(request).then(function (response) {
        if (response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
    }).catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (saved) {
            if (saved) return saved;
            if (request.mode === 'navigate') return caches.match('/app.html');
            return Response.error();
        });
    }));
});
