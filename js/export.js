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

// ── Restore from a backup ──
// Reads a file made by "Download my data" and adds its budgets back as new budgets.
// Nothing already in the account is changed or replaced; a budget whose name is already
// taken comes back as "Name (restored)".

// Returns { budgets: [{ name, data, summary }] } or throws an Error with a plain message
function parseDataBackup(text) {
    var file;
    try { file = JSON.parse(text); } catch (e) { throw new Error("This file isn't a My Budget AI backup (it couldn't be read)."); }
    if (!file || file.app !== 'My Budget AI' || !Array.isArray(file.budgets)) {
        throw new Error("This file isn't a My Budget AI backup. Use a file from ⚙️ Settings → Download my data.");
    }
    var list = file.budgets.filter(function (b) {
        return b && typeof b.name === 'string' && b.name.trim() && b.data && typeof b.data === 'object' && !Array.isArray(b.data);
    }).map(function (b) {
        return {
            name: b.name.trim().slice(0, 200),
            data: b.data,
            summary: b.summary && typeof b.summary === 'object' && !Array.isArray(b.summary) ? b.summary : {}
        };
    });
    if (!list.length) throw new Error('This backup has no budgets in it.');
    return { budgets: list, exportedAt: file.exportedAt || '' };
}

// Gives each restored budget a name not already used by the user's budgets (or earlier ones in the file)
function restoredNames(backupBudgets, existingNames) {
    var taken = {};
    existingNames.forEach(function (n) { taken[n.toLowerCase()] = true; });
    return backupBudgets.map(function (b) {
        var name = b.name;
        if (taken[name.toLowerCase()]) {
            name = b.name + ' (restored)';
            for (var n = 2; taken[name.toLowerCase()]; n++) name = b.name + ' (restored ' + n + ')';
        }
        taken[name.toLowerCase()] = true;
        return name;
    });
}

function chooseBackupFile() {
    if (showingCachedBudgets) { showToast("You're offline. Connect to the internet to restore a backup.", 'error'); return; }
    var input = document.getElementById('restoreFileInput');
    input.value = '';
    input.click();
}

async function restoreFromBackup(file) {
    if (!file) return;
    var backup;
    try {
        backup = parseDataBackup(await file.text());
    } catch (e) {
        showToast(e.message, 'error');
        return;
    }
    var count = backup.budgets.length;
    var when = backup.exportedAt ? ' from ' + new Date(backup.exportedAt).toLocaleDateString() : '';
    if (!confirm('Restore ' + count + ' budget' + (count === 1 ? '' : 's') + when + '?\n\n' +
        'They are added as new budgets. Your current budgets are not changed; any with the same name come back as "(restored)".')) return;

    var names = restoredNames(backup.budgets, budgets.filter(isOwnBudget).map(function (b) { return b.name; }));
    var done = 0;
    try {
        for (var i = 0; i < count; i++) {
            await saveBudgetToDb({ name: names[i], data: backup.budgets[i].data, summary: backup.budgets[i].summary });
            done++;
        }
    } catch (e) {
        showToast('Restored ' + done + ' of ' + count + ' budgets, then stopped: ' + e.message, 'error');
        if (done) goHome();
        return;
    }
    closeSettings();
    await goHome();
    showToast('Restored ' + count + ' budget' + (count === 1 ? '' : 's') + '.', 'success');
}
