// Printable one-page report for a saved budget. The browser's print dialog also offers
// "Save as PDF". Only #printReport is shown when printing (see @media print in styles.css).

function reportRow(label, amount, takeHome, cls) {
    var pct = takeHome > 0 ? (amount / takeHome * 100).toFixed(1) + '%' : '';
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th><td>' +
        formatSignedMoney(amount) + '</td><td>' + pct + '</td></tr>';
}

function buildBudgetReport(budget) {
    var s = budget.summary || {};
    var data = budget.data || {};
    var takeHome = parseMoney(s.takeHome);
    var remaining = parseMoney(s.remainingBalance);
    var check = computeHealthCheck(budget);
    var saved = budget.updated_at ? new Date(budget.updated_at).toLocaleDateString() : '';

    var html = '<div class="report">' +
        '<div class="report-brand">My Budget AI</div>' +
        '<h1>' + escapeHtml(budget.name) + '</h1>' +
        '<p class="report-meta">Printed ' + new Date().toLocaleDateString() + (saved ? ' · Last saved ' + saved : '') + '</p>' +
        '<h2>Monthly overview</h2><table class="report-table"><thead><tr><th></th><th>Monthly</th><th>% of take-home</th></tr></thead><tbody>' +
        reportRow('Take-home pay', takeHome, takeHome, 'report-strong');

    [['Housing', 'housing'], ['Transportation', 'transportation'], ['Education', 'education'],
        ['Utilities', 'utilities'], ['Spending', 'spending'], ['Other', 'other']].forEach(function (c) {
        html += reportRow(c[0], parseMoney(s[c[1]]), takeHome);
    });
    html += reportRow('Savings', plannedSavings(s), takeHome);
    html += reportRow('Costs + savings', takeHome - remaining, takeHome, 'report-strong');
    html += reportRow(remaining < 0 ? 'Over budget' : 'Left over', remaining, takeHome,
        'report-strong report-' + balanceStatus(remaining));

    var toSavings = parseMoney(s.leftoverToSavings), toSpending = parseMoney(s.leftoverToSpending);
    if (remaining > 0 && toSavings + toSpending > 0) {
        html += reportRow('↳ Remaining for savings', toSavings, takeHome);
        html += reportRow('↳ Remaining for spending', toSpending, takeHome);
    }
    html += '</tbody></table>';

    var other = Array.isArray(data.otherExpenses) ? data.otherExpenses : [];
    if (other.length) {
        html += '<h2>Other expenses</h2><table class="report-table"><tbody>';
        other.forEach(function (o) {
            html += '<tr><th scope="row">' + escapeHtml(o.name || 'Unnamed') + ' <span class="report-tag">' +
                (o.type === 'want' ? 'want' : 'need') + '</span></th><td>$' + formatCurrency(parseMoney(o.amount)) +
                '</td><td></td></tr>';
        });
        html += '</tbody></table>';
    }

    html += '<h2>Financial health check</h2><table class="report-table report-checks"><tbody>' +
        '<tr><th scope="row">Balanced budget</th><td>' + (check.balancePass ? '✅ Pass' : '❌ Over budget') + '</td><td>' +
            (check.balancePass ? '$' + formatCurrency(remaining) + ' left over' : '$' + formatCurrency(-remaining) + ' short each month') + '</td></tr>' +
        '<tr><th scope="row">25% housing rule</th><td>' + (check.housingPass ? '✅ Pass' : '❌ Fail') + '</td><td>Housing is ' +
            check.housingPercent.toFixed(1) + '% of take-home</td></tr>' +
        '<tr><th scope="row">50/30/20 rule</th><td>' + (check.ruleOf503020Pass ? '✅ Pass' : '❌ Needs work') + '</td><td>Needs ' +
            check.needsPercent.toFixed(1) + '% · Wants ' + check.wantsPercent.toFixed(1) + '% · Savings ' + check.savingsPercent.toFixed(1) + '%</td></tr>' +
        '</tbody></table>' +
        '<p class="report-footer">Created with My Budget AI · mybudget-ai.vercel.app</p></div>';
    return html;
}

function printBudgetReport(budget) {
    if (!budget) { showToast('Select a budget first.', 'info'); return; }
    document.getElementById('printReport').innerHTML = buildBudgetReport(budget);
    window.print();
}
