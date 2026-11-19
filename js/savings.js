// Savings tab: a list of savings lines like the Other tab. New budgets start with Cash Savings;
// the other kinds are added with buttons, or "+ Add Savings" for anything else.
// Each line has a stable key (also its amount field's id), which the Self-Escrow plan uses to
// remember how it's paid. Preset keys match the fixed fields older budgets used, so those load as-is.
// Saved as data.savingsItems = [{ key, name, amount }].

var SAVINGS_PRESETS = [
    ['cashSavings', 'Cash Savings', '300'],
    ['emergencyFund', 'Emergency Fund', '500'],
    ['retirement401k', 'Retirement (outside your paycheck)', '0'],
    ['iraContribution', 'IRA Contribution', '500'],
    ['investmentAccount', 'Investment Account', '300'],
    ['collegeFund', 'College Fund', '200'],
    ['hsaSavings', 'HSA (outside your paycheck)', '100'],
    ['downPaymentFund', 'House Down Payment', '500'],
    ['carFund', 'Next Car', '200'],
    ['vacationFund', 'Vacation Fund', '150'],
    ['holidayFund', 'Holidays / Gifts', '100']
];

var customSavingsCount = 0;

function savingsPreset(key) {
    return SAVINGS_PRESETS.filter(function (p) { return p[0] === key; })[0];
}

// Adds a savings line. key: a preset key, an existing saved key, or nothing for a new custom line.
function addSavingsItem(key, name, amount) {
    var preset = key ? savingsPreset(key) : null;
    if (!key) {
        do { key = 'savings_' + (++customSavingsCount); } while (document.getElementById(key));
    }
    if (document.getElementById(key)) return key;   // each kind once
    var row = document.createElement('div');
    row.className = 'other-row savings-row';
    row.id = 'savingsRow_' + key;
    row.dataset.key = key;
    row.innerHTML =
        '<input type="text" class="other-name savings-name" placeholder="What are you saving for?" aria-label="Savings name">' +
        '<input type="text" inputmode="decimal" class="other-amount" id="' + key + '" placeholder="' + (preset ? preset[2] : 'Monthly $') + '" aria-label="Monthly amount">' +
        '<label class="savings-route">Paid by <select data-route-for="' + key + '"></select></label>' +
        '<button class="remove-other-btn" onclick="removeSavingsItem(\'' + key + '\')" aria-label="Remove savings">✕</button>';
    document.getElementById('savingsList').appendChild(row);
    row.querySelector('.savings-name').value = name !== undefined && name !== null ? name : (preset ? preset[1] : '');
    document.getElementById(key).value = amount || '';

    row.addEventListener('input', calculateAll);
    setupMoneyFormatting(row);
    calculateAll();
    renderSavingsSuggestions();
    return key;
}

// Preset buttons add the line and put the cursor in its amount
function addSuggestedSavings(key) {
    var added = addSavingsItem(key);
    isDirty = true;
    document.getElementById(added).focus();
}

function addCustomSavings() {
    var key = addSavingsItem();
    isDirty = true;
    document.querySelector('#savingsRow_' + key + ' .savings-name').focus();
}

function removeSavingsItem(key) {
    var row = document.getElementById('savingsRow_' + key);
    if (row) row.remove();
    isDirty = true;
    calculateAll();
    renderSavingsSuggestions();
}

// [{ key, name, monthly }] in the order shown
function savingsItems() {
    return Array.from(document.querySelectorAll('#savingsList .savings-row')).map(function (row) {
        var key = row.dataset.key;
        var preset = savingsPreset(key);
        return {
            key: key,
            name: row.querySelector('.savings-name').value.trim() || (preset ? preset[1] : 'Savings'),
            monthly: val(key)
        };
    });
}

function gatherSavingsItems() {
    return Array.from(document.querySelectorAll('#savingsList .savings-row')).map(function (row) {
        return { key: row.dataset.key, name: row.querySelector('.savings-name').value.trim(), amount: document.getElementById(row.dataset.key).value };
    });
}

function clearSavingsItems() {
    document.getElementById('savingsList').innerHTML = '';
    customSavingsCount = 0;
    renderSavingsSuggestions();
}

// Budgets saved before the list existed kept one field per kind (cashSavings, emergencyFund, ...)
function loadSavingsItems(data) {
    clearSavingsItems();
    if (Array.isArray(data.savingsItems)) {
        data.savingsItems.forEach(function (item) {
            if (/^savings_(\d+)$/.test(item.key)) customSavingsCount = Math.max(customSavingsCount, parseInt(item.key.split('_')[1], 10));
            addSavingsItem(item.key, item.name, item.amount);
        });
    } else {
        SAVINGS_PRESETS.forEach(function (p) {
            if (data[p[0]] !== undefined && data[p[0]] !== '') addSavingsItem(p[0], p[1], data[p[0]]);
        });
    }
    if (!document.querySelector('#savingsList .savings-row')) addSavingsItem('cashSavings');
}

function renderSavingsSuggestions() {
    var box = document.getElementById('savingsSuggestions');
    if (!box) return;
    box.innerHTML = SAVINGS_PRESETS.filter(function (p) { return !document.getElementById(p[0]); }).map(function (p) {
        return '<button class="suggestion-chip" onclick="addSuggestedSavings(\'' + p[0] + '\')">+ ' + escapeHtml(p[1]) + '</button>';
    }).join('');
}
