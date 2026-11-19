// Offline support for the budget app: a copy of the budget list kept on this device, so budgets
// can be viewed (and planned with) without a connection, plus the "you're offline" banner.
// Saving still needs a connection. Signing out or deleting the account removes the copy.

var BUDGET_CACHE_PREFIX = 'budgetCache:';
var showingCachedBudgets = false;

function budgetCacheKey() {
    return BUDGET_CACHE_PREFIX + (currentUser ? currentUser.id : 'anon');
}

function isNetworkError(e) {
    var message = e && (e.message || String(e));
    return !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed/i.test(message || '');
}

function saveBudgetCache(list) {
    try {
        localStorage.setItem(budgetCacheKey(), JSON.stringify({ savedAt: new Date().toISOString(), budgets: list, shares: householdShares }));
    } catch (e) { /* storage full or blocked: offline copy just isn't kept */ }
}

function readBudgetCache() {
    try { return JSON.parse(localStorage.getItem(budgetCacheKey())); } catch (e) { return null; }
}

// Called on sign-out and account deletion (see auth.js)
function clearBudgetCaches() {
    try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);
            if (key && key.indexOf(BUDGET_CACHE_PREFIX) === 0) localStorage.removeItem(key);
        }
    } catch (e) { /* storage unavailable */ }
}

// Loads the budget list (and sharing), falling back to this device's copy when offline
async function loadBudgetsOrCache() {
    try {
        var list = await loadBudgets();
        await refreshHouseholdShares();
        showingCachedBudgets = false;
        saveBudgetCache(list);
        renderOfflineBanner();
        return list;
    } catch (e) {
        var cached = isNetworkError(e) ? readBudgetCache() : null;
        if (!cached) throw e;
        householdShares = cached.shares || [];
        showingCachedBudgets = cached.savedAt;
        renderOfflineBanner();
        return cached.budgets || [];
    }
}

function renderOfflineBanner() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    if (!showingCachedBudgets && navigator.onLine) { banner.style.display = 'none'; return; }
    var when = showingCachedBudgets ? new Date(showingCachedBudgets).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    banner.textContent = "📴 You're offline. " +
        (when ? 'Showing the budgets saved on this device (' + when + '). ' : '') +
        'You can look and plan, but saving needs a connection.';
    banner.style.display = 'block';
}

window.addEventListener('offline', renderOfflineBanner);
window.addEventListener('online', function () {
    renderOfflineBanner();
    // Back online on the home screen: swap the offline copy for the real list
    if (showingCachedBudgets && document.getElementById('homeScreen').classList.contains('active')) goHome();
});
