// "Download my data": every budget the user owns, as one JSON file. Works as a backup,
// before deleting an account, or to take the data somewhere else.

function buildDataExport(ownBudgets) {
    return {
        app: 'My Budget AI',
        exportedAt: new Date().toISOString(),
        account: { email: currentUser ? currentUser.email : '' },
        settings: { suggestionMode: suggestionMode },
        sharedWith: sharesFromMe().map(function (s) { return s.shared_with_email; }),
        budgets: ownBudgets.map(function (b) {
            return { name: b.name, created_at: b.created_at, updated_at: b.updated_at, summary: b.summary, data: b.data };
        })
    };
}

function dataExportFileName(date) {
    var d = date || new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'my-budget-ai-data-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
}

async function downloadMyData() {
    var list = budgets;
    try {
        list = await loadBudgets();   // freshest copy, in case another device saved since
    } catch (e) {
        if (!list.length) { showToast("Couldn't load your budgets: " + e.message, 'error'); return; }
        showToast('Offline: downloading the budgets loaded on this device.', 'info');
    }
    var own = list.filter(isOwnBudget);
    var blob = new Blob([JSON.stringify(buildDataExport(own), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dataExportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('Downloaded ' + own.length + ' budget' + (own.length === 1 ? '' : 's') + '.', 'success');
}
