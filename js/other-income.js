// Income tab "Other Income": money that doesn't come from a paycheck (rental income, a side job,
// Social Security, a pension, child support...). Each line is a monthly amount the household
// actually receives, after any taxes. Saved as data.otherIncome (an array of { name, amount }).

var otherIncomeCount = 0;

var OTHER_INCOME_SUGGESTIONS = [
    'Rental income', 'Side job / freelance', 'Social Security', 'Pension', 'Child support / alimony',
    'Interest / dividends', 'Disability benefits', 'Bonus / commission'
];

function addOtherIncome(name, amount) {
    var idx = otherIncomeCount++;
    var row = document.createElement('div');
    row.className = 'other-row other-income-row';
    row.id = 'otherIncome_' + idx;
    row.innerHTML =
        '<input type="text" class="other-name" id="otherIncomeName_' + idx + '" placeholder="Income source" aria-label="Income source">' +
        '<input type="text" inputmode="decimal" class="other-amount" id="otherIncomeAmount_' + idx + '" placeholder="Monthly $" aria-label="Monthly amount">' +
        '<button class="remove-other-btn" onclick="removeOtherIncome(' + idx + ')" aria-label="Remove income">✕</button>';
    document.getElementById('otherIncomeContainer').appendChild(row);

    document.getElementById('otherIncomeName_' + idx).value = name || '';
    document.getElementById('otherIncomeAmount_' + idx).value = amount || '';

    row.addEventListener('input', calculateAll);
    setupMoneyFormatting(row);
    isDirty = true;
    calculateAll();
    return idx;
}

function addSuggestedIncome(index) {
    var idx = addOtherIncome(OTHER_INCOME_SUGGESTIONS[index], '');
    document.getElementById('otherIncomeAmount_' + idx).focus();
}

function removeOtherIncome(idx) {
    var row = document.getElementById('otherIncome_' + idx);
    if (row) row.remove();
    isDirty = true;
    calculateAll();
}

function getOtherIncomeIndices() {
    var rows = document.querySelectorAll('#otherIncomeContainer .other-income-row');
    var indices = [];
    for (var i = 0; i < rows.length; i++) indices.push(parseInt(rows[i].id.replace('otherIncome_', ''), 10));
    return indices;
}

// Lines with an amount: [{ name, monthly }]
function otherIncomeLines() {
    return getOtherIncomeIndices().map(function (idx) {
        return {
            name: document.getElementById('otherIncomeName_' + idx).value.trim() || 'Other income',
            monthly: val('otherIncomeAmount_' + idx)
        };
    }).filter(function (line) { return line.monthly > 0; });
}

function calculateOtherIncome() {
    var total = otherIncomeLines().reduce(function (sum, line) { return sum + line.monthly; }, 0);
    setText('otherIncomeResult', formatCurrency(total));
    return total;
}

function gatherOtherIncome() {
    return getOtherIncomeIndices().map(function (idx) {
        return {
            name: document.getElementById('otherIncomeName_' + idx).value.trim(),
            amount: document.getElementById('otherIncomeAmount_' + idx).value
        };
    }).filter(function (line) { return line.name || line.amount; });
}

function loadOtherIncome(list) {
    clearOtherIncome();
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) addOtherIncome(list[i].name, list[i].amount);
}

function clearOtherIncome() {
    document.getElementById('otherIncomeContainer').innerHTML = '';
    otherIncomeCount = 0;
}

function renderOtherIncomeSuggestions() {
    var html = '';
    for (var i = 0; i < OTHER_INCOME_SUGGESTIONS.length; i++) {
        html += '<button class="suggestion-chip" onclick="addSuggestedIncome(' + i + ')">+ ' + OTHER_INCOME_SUGGESTIONS[i] + '</button>';
    }
    document.getElementById('otherIncomeSuggestions').innerHTML = html;
}
