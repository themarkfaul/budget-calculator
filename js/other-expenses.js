// Other tab: user-named expense lines (debts, insurance, childcare, ...), each marked as a
// need or a want so the 50/30/20 check stays accurate. Saved as data.otherExpenses (an array).

var otherExpenseCount = 0;

var OTHER_EXPENSE_SUGGESTIONS = [
    ['Credit card payment', 'need'], ['Student loan', 'need'], ['Health insurance', 'need'],
    ['Life insurance', 'need'], ['Medical / prescriptions', 'need'], ['Childcare', 'need'],
    ['Pet care', 'want'], ['Charitable giving', 'want'], ['Gym membership', 'want'], ['Subscriptions', 'want']
];

function addOtherExpense(name, amount, type) {
    var idx = otherExpenseCount++;
    var row = document.createElement('div');
    row.className = 'other-row';
    row.id = 'other_' + idx;
    row.innerHTML =
        '<input type="text" class="other-name" id="otherName_' + idx + '" placeholder="Expense name" aria-label="Expense name">' +
        '<input type="text" inputmode="decimal" class="other-amount" id="otherAmount_' + idx + '" placeholder="Monthly $" aria-label="Monthly amount">' +
        '<select class="other-type" id="otherType_' + idx + '" aria-label="Need or want">' +
            '<option value="need">Need</option><option value="want">Want</option>' +
        '</select>' +
        '<button class="remove-other-btn" onclick="removeOtherExpense(' + idx + ')" aria-label="Remove expense">✕</button>';
    document.getElementById('otherExpensesContainer').appendChild(row);

    document.getElementById('otherName_' + idx).value = name || '';
    document.getElementById('otherAmount_' + idx).value = amount || '';
    document.getElementById('otherType_' + idx).value = type === 'want' ? 'want' : 'need';

    row.addEventListener('input', calculateAll);
    row.addEventListener('change', calculateAll);
    setupMoneyFormatting(row);
    isDirty = true;
    calculateAll();
    return idx;
}

// Suggestion buttons add a named line and put the cursor in its amount
function addSuggestedExpense(index) {
    var s = OTHER_EXPENSE_SUGGESTIONS[index];
    var idx = addOtherExpense(s[0], '', s[1]);
    document.getElementById('otherAmount_' + idx).focus();
}

function removeOtherExpense(idx) {
    var row = document.getElementById('other_' + idx);
    if (row) row.remove();
    isDirty = true;
    calculateAll();
}

function getOtherExpenseIndices() {
    var rows = document.querySelectorAll('#otherExpensesContainer .other-row');
    var indices = [];
    for (var i = 0; i < rows.length; i++) indices.push(parseInt(rows[i].id.replace('other_', ''), 10));
    return indices;
}

// Monthly totals: { total, needs, wants }
function calculateOtherExpenses() {
    var indices = getOtherExpenseIndices();
    var needs = 0, wants = 0;
    for (var i = 0; i < indices.length; i++) {
        var amount = val('otherAmount_' + indices[i]);
        if (document.getElementById('otherType_' + indices[i]).value === 'want') wants += amount;
        else needs += amount;
    }
    setText('otherNeedsResult', formatCurrency(needs));
    setText('otherWantsResult', formatCurrency(wants));
    setText('otherResult', formatCurrency(needs + wants));
    return { total: needs + wants, needs: needs, wants: wants };
}

// For saving: rows with a name or an amount
function gatherOtherExpenses() {
    var indices = getOtherExpenseIndices();
    var list = [];
    for (var i = 0; i < indices.length; i++) {
        var name = document.getElementById('otherName_' + indices[i]).value.trim();
        var amount = document.getElementById('otherAmount_' + indices[i]).value;
        if (!name && !amount) continue;
        list.push({ name: name, amount: amount, type: document.getElementById('otherType_' + indices[i]).value });
    }
    return list;
}

function loadOtherExpenses(list) {
    clearOtherExpenses();
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) addOtherExpense(list[i].name, list[i].amount, list[i].type);
}

function clearOtherExpenses() {
    document.getElementById('otherExpensesContainer').innerHTML = '';
    otherExpenseCount = 0;
}

function renderOtherSuggestions() {
    var html = '';
    for (var i = 0; i < OTHER_EXPENSE_SUGGESTIONS.length; i++) {
        html += '<button class="suggestion-chip" onclick="addSuggestedExpense(' + i + ')">+ ' +
            OTHER_EXPENSE_SUGGESTIONS[i][0] + '</button>';
    }
    document.getElementById('otherSuggestions').innerHTML = html;
}
