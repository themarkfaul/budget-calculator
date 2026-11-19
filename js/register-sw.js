// Installs the service worker (/sw.js) that keeps a copy of the app so it opens with no signal.
// Loaded on every page, so the first page someone visits sets it up.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function (e) { console.warn('Offline support unavailable:', e.message); });
    });
}
