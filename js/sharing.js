// Sharing budgets with a spouse or partner. Sharing is household-wide: everyone the owner adds
// can see and edit all of the owner's budgets from their own login, but only the owner can delete them.
// The database enforces this (household_shares table and budget policies in supabase-schema.sql).

var currentUser = null;      // set at startup (main.js)
var householdShares = [];    // rows from household_shares the signed-in user can see

function myEmail() {
    return currentUser && currentUser.email ? currentUser.email.toLowerCase() : '';
}

// Shares I made (people who can see my budgets)
function sharesFromMe() {
    return householdShares.filter(function (s) { return currentUser && s.owner_id === currentUser.id; });
}

// Shares made to me (people whose budgets I can see)
function sharesToMe() {
    return householdShares.filter(function (s) { return s.shared_with_email === myEmail(); });
}

function isOwnBudget(budget) {
    return !currentUser || !budget.user_id || budget.user_id === currentUser.id;
}

// Short label for a budget's sharing status on the home list, or ''
function budgetShareLabel(budget) {
    if (!isOwnBudget(budget)) {
        var share = householdShares.filter(function (s) { return s.owner_id === budget.user_id; })[0];
        return '👥 From ' + (share ? share.owner_email : 'someone else');
    }
    return sharesFromMe().length > 0 ? '👥 Shared' : '';
}

// Loads shares without ever blocking the budget list (e.g. before the database table exists)
async function refreshHouseholdShares() {
    try {
        householdShares = await loadHouseholdShares();
    } catch (e) {
        console.warn('Sharing unavailable:', e.message);
        householdShares = [];
    }
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Share dialog ──

function openShare() {
    document.getElementById('shareEmail').value = '';
    document.getElementById('shareError').textContent = '';
    renderShareLists();
    document.getElementById('shareDialog').showModal();
}

function closeShare() {
    document.getElementById('shareDialog').close();
}

function renderShareLists() {
    var mine = sharesFromMe();
    var html = '';
    for (var i = 0; i < mine.length; i++) {
        html += '<li><span>' + escapeHtml(mine[i].shared_with_email) + '</span><span class="share-actions">' +
            '<button type="button" class="btn-link-muted" data-share-invite="' + escapeHtml(mine[i].shared_with_email) + '">Send invite</button>' +
            '<button type="button" class="btn-link-muted" data-share-remove="' + escapeHtml(mine[i].shared_with_email) + '">Stop sharing</button></span></li>';
    }
    document.getElementById('shareList').innerHTML = html
        ? '<ul class="share-list">' + html + '</ul>'
        : '<p class="dialog-hint">You aren\'t sharing your budgets with anyone yet.</p>';

    var toMe = sharesToMe();
    var th = '';
    for (var j = 0; j < toMe.length; j++) {
        th += '<li><span>' + escapeHtml(toMe[j].owner_email) + '</span>' +
            '<button type="button" class="btn-link-muted" data-share-leave="' + escapeHtml(toMe[j].owner_id) + '">Remove</button></li>';
    }
    document.getElementById('sharedWithMeSection').style.display = th ? '' : 'none';
    document.getElementById('sharedWithMeList').innerHTML = th ? '<ul class="share-list">' + th + '</ul>' : '';
}

async function handleAddShare(evt) {
    evt.preventDefault();
    var errorEl = document.getElementById('shareError');
    var email = normalizeEmail(document.getElementById('shareEmail').value);
    errorEl.textContent = '';
    if (!isValidEmail(email)) { errorEl.textContent = 'Enter their email address.'; return; }
    if (email === myEmail()) { errorEl.textContent = "That's your own email."; return; }
    if (sharesFromMe().some(function (s) { return s.shared_with_email === email; })) {
        errorEl.textContent = "You're already sharing with " + email + '.';
        return;
    }

    var btn = document.getElementById('shareAddBtn');
    btn.disabled = true;
    try {
        await addHouseholdShare(email);
        await refreshHouseholdShares();
        document.getElementById('shareEmail').value = '';
        renderShareLists();
        displayBudgets();
        showToast('Shared with ' + email + '. Tap "Send invite" to let them know.', 'success');
    } catch (e) {
        errorEl.textContent = "Couldn't share: " + e.message;
    }
    btn.disabled = false;
}

async function stopSharingWith(email) {
    if (!confirm(email + ' will no longer see or edit your budgets. Continue?')) return;
    try {
        await removeHouseholdShare(currentUser.id, email);
        await refreshHouseholdShares();
        renderShareLists();
        displayBudgets();
        showToast('Stopped sharing with ' + email + '.', 'success');
    } catch (e) {
        document.getElementById('shareError').textContent = "Couldn't stop sharing: " + e.message;
    }
}

async function leaveShare(ownerId) {
    var share = sharesToMe().filter(function (s) { return s.owner_id === ownerId; })[0];
    if (!share) return;
    if (!confirm("Remove " + share.owner_email + "'s budgets from your list? They'll need to share again for you to see them.")) return;
    try {
        await removeHouseholdShare(ownerId, myEmail());
        closeShare();
        await goHome();
        showToast("Removed " + share.owner_email + "'s budgets.", 'success');
    } catch (e) {
        document.getElementById('shareError').textContent = "Couldn't remove: " + e.message;
    }
}

document.getElementById('shareDialog').addEventListener('click', function (e) {
    var remove = e.target.getAttribute('data-share-remove');
    var leave = e.target.getAttribute('data-share-leave');
    var invite = e.target.getAttribute('data-share-invite');
    if (invite) { closeShare(); sendInvite('spouse', invite); }
    else if (remove) stopSharingWith(remove);
    else if (leave) leaveShare(leave);
});
