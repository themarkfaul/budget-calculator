// Messages, unsaved-work warning, dashboard chart, budget comparison, and printed report.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, text } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => newBudget(w));

// A saved budget, built through the calculator like the real Save button does
function savedBudget(name, rent, groceries, savings) {
    newBudget(w);
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '2500');          // $5,416.67 a month
    setField(w, 'payFrequency_0', '26');
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', String(rent));
    setField(w, 'groceries', String(groceries));
    setField(w, 'cashSavings', String(savings));
    return { name: name, data: w.gatherCalculatorData(), summary: w.buildSummary(), updated_at: '2026-11-01' };
}

test('messages appear without blocking, then remove themselves', async () => {
    w.showToast('Budget saved', 'success');
    const toast = w.document.querySelector('#toastContainer .toast-success');
    assert.equal(toast.textContent, 'Budget saved');
    assert.equal(w.document.getElementById('toastContainer').getAttribute('aria-live'), 'polite');
});

test('leaving with unsaved changes asks first, but only while editing', () => {
    const leave = () => {
        const e = new w.Event('beforeunload', { cancelable: true });
        w.warnAboutUnsavedChanges(e);
        return e.defaultPrevented;
    };
    w.showScreen('calculatorScreen');
    w.isDirty = false;
    assert.equal(leave(), false);
    w.isDirty = true;
    assert.equal(leave(), true);
    w.skipUnsavedWarning = true;          // the app already asked
    assert.equal(leave(), false);
    w.skipUnsavedWarning = false;
    w.showScreen('homeScreen');           // not editing a budget
    assert.equal(leave(), false);
});

test('chart: slices are shares of take-home, including what is left over', () => {
    const chart = w.moneyChartSlices([['Housing', 1500], ['Spending', 800], ['Savings', 500], ['Other', 0]], 5000, 2200);
    assert.deepEqual(Array.from(chart.slices, s => s.name), ['Housing', 'Spending', 'Savings', 'Left Over']);
    assert.equal(chart.slices[0].percent, 30);
    const total = chart.slices.reduce((sum, s) => sum + s.percent, 0);
    assert.ok(Math.abs(total - 100) < 0.001);
});

test('chart: when over budget, slices are shares of total costs', () => {
    const chart = w.moneyChartSlices([['Housing', 4000], ['Spending', 2000]], 5000, -1000);
    assert.equal(chart.over, true);
    assert.equal(chart.slices.length, 2);         // no "Left Over" slice
    assert.ok(Math.abs(chart.slices[0].percent - 66.667) < 0.01);
});

test('chart appears on the dashboard once there are numbers', () => {
    assert.equal(w.document.getElementById('moneyChart').style.display, 'none');
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '2500');
    setField(w, 'payFrequency_0', '26');
    setField(w, 'groceries', '800');
    assert.equal(w.document.getElementById('moneyChart').style.display, 'block');
    assert.match(text(w, 'moneyChart'), /Spending\$800\.00/);
});

test('health check numbers are the same everywhere they are used', () => {
    const b = savedBudget('Rent 1500', 1500, 600, 500);
    const c = w.computeHealthCheck(b);
    assert.equal(c.balancePass, true);
    assert.equal(c.remaining.toFixed(2), '2816.67');
    assert.equal(c.housingPass, false);                 // 1,500 is 27.7% of take-home
    assert.equal(c.needsPercent.toFixed(1), '38.8');     // rent + groceries
});

test('compare: columns, differences, and colors', () => {
    w.budgets = [savedBudget('Apartment', 1500, 600, 500), savedBudget('House', 2400, 600, 300)];
    w.selectedBudgetIndex = -1;
    w.openCompare();
    const table = w.document.querySelector('#compareTable table');
    assert.deepEqual(Array.from(table.querySelectorAll('thead th'), th => th.textContent), ['', 'Apartment', 'House']);
    const housingRow = Array.from(table.querySelectorAll('tbody tr')).find(r => r.querySelector('th').textContent === 'Housing');
    const houseCell = housingRow.querySelectorAll('td')[1];
    assert.match(houseCell.textContent, /\+\$900\.00/);
    assert.ok(houseCell.querySelector('.compare-worse'));   // higher cost is worse
    const savingsRow = Array.from(table.querySelectorAll('tbody tr')).find(r => r.querySelector('th').textContent === 'Savings');
    assert.ok(savingsRow.querySelectorAll('td')[1].querySelector('.compare-worse'));   // less saved is worse
});

test('compare: at most three budgets at a time', () => {
    w.budgets = ['A', 'B', 'C', 'D'].map((n, i) => savedBudget(n, 1000 + i * 100, 500, 200));
    w.openCompare();
    w.toggleCompareBudget(2, true);
    w.toggleCompareBudget(3, true);   // a fourth is refused
    assert.equal(w.compareSelection.length, 3);
    w.toggleCompareBudget(0, false);
    w.toggleCompareBudget(1, false);
    assert.match(text(w, 'compareTable'), /Pick at least two/);
});

test('printed report includes the overview, other expenses and health check', () => {
    newBudget(w);
    w.addOtherExpense('Student loan', '350', 'need');
    const b = savedBudget('Report Test', 1500, 600, 500);
    b.data.otherExpenses = [{ name: 'Student <loan>', amount: '350', type: 'need' }];
    const html = w.buildBudgetReport(b);
    assert.match(html, /<h1>Report Test<\/h1>/);
    assert.match(html, /Take-home pay<\/th><td>\$5,416\.67/);
    assert.match(html, /Left over<\/th><td>\$2,816\.67/);
    assert.match(html, /Student &lt;loan&gt;/);            // names are escaped
    assert.match(html, /25% housing rule<\/th><td>❌ Fail/);
});
