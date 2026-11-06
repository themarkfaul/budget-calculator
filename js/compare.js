// Compare Budgets screen: up to three saved budgets side by side, with each column's
// difference from the first and the health check results.

var COMPARE_MAX = 3;
var compareSelection = [];   // indexes into budgets

// Rows: [label, value from summary, higher is better?]
var COMPARE_ROWS = [
    ['Take-home pay', function (s) { return parseMoney(s.takeHome); }, true],
    ['Housing', function (s) { return parseMoney(s.housing); }, false],
    ['Transportation', function (s) { return parseMoney(s.transportation); }, false],
    ['Education', function (s) { return parseMoney(s.education); }, false],
    ['Utilities', function (s) { return parseMoney(s.utilities); }, false],
    ['Spending', function (s) { return parseMoney(s.spending); }, false],
    ['Other', function (s) { return parseMoney(s.other); }, false],
    ['Savings', function (s) { return plannedSavings(s); }, true],
    ['Left over', function (s) { return parseMoney(s.remainingBalance); }, true]
];

function openCompare() {
    if (budgets.length < 2) { showToast('Save at least two budgets to compare them.', 'info'); return; }
    // Start with the selected budget (if any) and the next one in the list
    var first = selectedBudgetIndex >= 0 ? selectedBudgetIndex : 0;
    compareSelection = [first, first === 0 ? 1 : 0];
    renderComparePicker();
    renderCompareTable();
    showScreen('compareScreen');
    window.scrollTo(0, 0);
}

function renderComparePicker() {
    var html = '';
    for (var i = 0; i < budgets.length; i++) {
        var checked = compareSelection.indexOf(i) >= 0;
        html += '<label class="compare-choice' + (checked ? ' compare-choice-on' : '') + '">' +
            '<input type="checkbox" onchange="toggleCompareBudget(' + i + ', this.checked)"' + (checked ? ' checked' : '') + '> ' +
            escapeHtml(budgets[i].name) + '</label>';
    }
    document.getElementById('comparePicker').innerHTML = html;
}

function toggleCompareBudget(index, on) {
    var at = compareSelection.indexOf(index);
    if (on && at < 0) {
        if (compareSelection.length >= COMPARE_MAX) {
            showToast('Compare up to ' + COMPARE_MAX + ' budgets at a time.', 'info');
            renderComparePicker();
            return;
        }
        compareSelection.push(index);
    } else if (!on && at >= 0) {
        compareSelection.splice(at, 1);
    }
    renderComparePicker();
    renderCompareTable();
}

// Difference from the first column, colored by whether it's better or worse
function compareDiffHtml(diff, higherIsBetter) {
    if (Math.abs(diff) < 0.005) return '<div class="compare-diff">same</div>';
    var better = higherIsBetter ? diff > 0 : diff < 0;
    return '<div class="compare-diff ' + (better ? 'compare-better' : 'compare-worse') + '">' +
        (diff > 0 ? '+' : '−') + '$' + formatCurrency(Math.abs(diff)) + '</div>';
}

function renderCompareTable() {
    var el = document.getElementById('compareTable');
    if (compareSelection.length < 2) {
        el.innerHTML = '<p class="compare-empty">Pick at least two budgets above.</p>';
        return;
    }
    var picked = compareSelection.map(function (i) { return budgets[i]; });
    var summaries = picked.map(function (b) { return b.summary || {}; });

    var html = '<table class="compare-table"><thead><tr><th></th>';
    picked.forEach(function (b) { html += '<th>' + escapeHtml(b.name) + '</th>'; });
    html += '</tr></thead><tbody>';

    COMPARE_ROWS.forEach(function (row) {
        var values = summaries.map(row[1]);
        html += '<tr><th scope="row">' + row[0] + '</th>';
        values.forEach(function (v, col) {
            var cls = row[0] === 'Left over' ? ' class="compare-' + balanceStatus(v) + '"' : '';
            html += '<td' + cls + '><div class="compare-value">' + formatSignedMoney(v) + '</div>' +
                (col > 0 ? compareDiffHtml(v - values[0], row[2]) : '') + '</td>';
        });
        html += '</tr>';
    });

    var checks = picked.map(computeHealthCheck);
    [['Balanced budget', 'balancePass'], ['25% housing rule', 'housingPass'], ['50/30/20 rule', 'ruleOf503020Pass']]
        .forEach(function (rule) {
            html += '<tr class="compare-check-row"><th scope="row">' + rule[0] + '</th>';
            checks.forEach(function (c) { html += '<td>' + (c[rule[1]] ? '✅ Pass' : '❌ Not yet') + '</td>'; });
            html += '</tr>';
        });

    el.innerHTML = html + '</tbody></table>';
}
