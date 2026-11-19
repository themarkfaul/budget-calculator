// Actual vs. Planned: uploading bank CSVs, matching charges to budget lines, bill increase alerts.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, plain } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => newBudget(w));

function household() {
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '3000');
    setField(w, 'payFrequency_0', '26');
    setField(w, 'carInsuranceAnnual', '1200');          // $100 a month
    w.onEscrowChange('carInsurance', 'schedule', 'monthly');
    setField(w, 'internet', '80');
    setField(w, 'groceries', '600');
    setField(w, 'eatingOut', '100');
}

const SEPTEMBER = [
    'Date,Description,Amount',
    '09/01/2026,PROGRESSIVE INS AUTOPAY,-100.00',
    '09/04/2026,SPECTRUM 855-707-7328,-80.00',
    '09/06/2026,KROGER #123 LOUISVILLE KY,-250.00',
    '09/09/2026,PLANET FITNESS,-24.99',
    '09/30/2026,KROGER #123 LOUISVILLE KY,-300.00'
].join('\n');

const OCTOBER = [
    'Date,Description,Amount',
    '10/01/2026,PROGRESSIVE INS AUTOPAY,-139.00',
    '10/04/2026,SPECTRUM 855-707-7328,-80.00',
    '10/05/2026,KROGER #123 LOUISVILLE KY,-210.50',
    '10/09/2026,PLANET FITNESS,-24.99',
    '10/12/2026,CHIPOTLE 2231,-18.25',
    '10/15/2026,ONLINE TRANSFER TO SAVINGS,-500.00',
    '10/20/2026,KROGER #123 LOUISVILLE KY,-190.00',
    '10/28/2026,DIRECT DEP ACME PAYROLL,2000.00',
    '10/31/2026,CHIPOTLE 2231,-12.00'
].join('\n');

test('charges are matched to budget lines and compared month by month', () => {
    household();
    const r = w.addActualCsv(OCTOBER);
    assert.equal(r.added, 8);   // the paycheck deposit isn't a charge
    assert.equal(w.actualData.map['PROGRESSIVE INS'], 'carInsurance');   // autopay still counts as the bill
    assert.equal(w.actualData.map['SPECTRUM'], 'internet');
    assert.equal(w.actualData.map['ONLINE TRANSFER'], 'skip');

    const c = w.actualComparison('2026-10');
    const row = name => c.rows.find(x => x.line.name === name);
    assert.equal(row('Groceries').planned, 600);
    assert.equal(row('Groceries').actual, 400.5);
    assert.equal(row('Eating Out').actual, 30.25);
    assert.equal(row('Car insurance').actual, 139);
    assert.equal(w.differenceText(600, 400.5), '$199.50 under');
    assert.equal(w.differenceText(100, 139), '$39.00 over');
    assert.equal(w.differenceText(80, 80.4), 'On plan');
    // The transfer isn't spending; the total is everything else
    assert.equal(c.actualTotal, 139 + 80 + 400.5 + 24.99 + 30.25);
});

test('uploading the same file again doesn\'t count anything twice', () => {
    household();
    w.addActualCsv(OCTOBER);
    const again = w.addActualCsv(OCTOBER);
    assert.equal(again.added, 0);
    assert.equal(again.duplicates, 8);
    assert.equal(w.lineActual('2026-10', 'groceries'), 400.5);
    // Two identical charges on the same day are both real
    w.addActualCsv('Date,Description,Amount\n10/12/2026,CHIPOTLE 2231,-18.25\n10/12/2026,CHIPOTLE 2231,-18.25');
    assert.equal(w.lineActual('2026-10', 'eatingOut'), 30.25 + 18.25);
});

test('a bill that went up is flagged, and "Update my budget" raises it and the Self-Escrow deposit', () => {
    household();
    w.addActualCsv(SEPTEMBER);
    w.addActualCsv(OCTOBER);
    const alerts = plain(w.actualAlerts());
    const up = alerts.find(a => a.type === 'increase');
    assert.equal(up.key, 'carInsurance');
    assert.equal(up.diff, 39);
    assert.equal(up.perYear, 39 * 12);
    assert.equal(up.previous.amount, 100);
    assert.ok(!alerts.some(a => a.key === 'internet'));   // unchanged bills aren't flagged

    const depositBefore = w.escrowTotals(6500).escrow;
    w.applyBillIncrease(up.id);
    assert.equal(w.val('carInsuranceAnnual'), 139 * 12);
    assert.equal((w.escrowTotals(6500).escrow - depositBefore).toFixed(2), '39.00');
    assert.ok(!w.actualAlerts().some(a => a.type === 'increase'));
});

test('a small rise isn\'t flagged, and a dismissed alert stays dismissed', () => {
    household();
    w.addActualCsv('Date,Description,Amount\n10/04/2026,SPECTRUM,-83.00');   // +$3: under the $5 minimum
    assert.equal(w.actualAlerts().filter(a => a.type === 'increase').length, 0);
    w.addActualCsv('Date,Description,Amount\n11/04/2026,SPECTRUM,-95.00');
    const alert = w.actualAlerts().find(a => a.key === 'internet');
    assert.equal(alert.ym, '2026-11');
    w.dismissActualAlert(alert.id);
    assert.equal(w.actualAlerts().filter(a => a.key === 'internet').length, 0);
});

test('a new recurring charge can be added to the budget', () => {
    household();
    w.addActualCsv(SEPTEMBER);
    w.addActualCsv(OCTOBER);
    const alert = w.actualAlerts().find(a => a.type === 'new');
    assert.equal(alert.name, 'Planet Fitness');
    w.addRecurringToBudget(alert.id);
    assert.equal(w.actualData.map['PLANET FITNESS'], 'other:Planet Fitness');
    const line = w.actualComparison('2026-10').rows.find(r => r.line.key === 'other:Planet Fitness');
    assert.equal(line.planned.toFixed(2), '24.99');
    assert.equal(line.actual, 24.99);
    assert.ok(!w.actualAlerts().some(a => a.type === 'new'));
});

test('changing where a company counts, saving and reopening the budget', () => {
    household();
    w.addActualCsv(OCTOBER);
    w.changeActualMapping('CHIPOTLE', 'groceries');
    assert.equal(w.lineActual('2026-10', 'groceries'), 400.5 + 30.25);

    const data = w.gatherCalculatorData();
    const saved = JSON.stringify(data.actual);
    assert.ok(!/#123|10\/05|2026-10-05|AUTOPAY/.test(saved), 'no dates or full descriptions kept');
    newBudget(w);
    assert.equal(w.gatherCalculatorData().actual, undefined);
    w.loadBudgetDataIntoCalculator({ data });
    assert.equal(w.lineActual('2026-10', 'groceries'), 400.5 + 30.25);
    assert.equal(w.actualMonth, '2026-10');
});

test('partial months are marked, and yearly bills are planned in their due month', () => {
    household();
    setField(w, 'carInsuranceAnnual', '1200');
    w.onEscrowChange('carInsurance', 'schedule', 'twice');
    w.onEscrowChange('carInsurance', 'month', '4');
    w.addActualCsv('Date,Description,Amount\n04/10/2026,GEICO,-600.00\n04/28/2026,KROGER,-50');
    assert.equal(w.isPartialMonth('2026-04'), true);
    const car = w.actualComparison('2026-04').rows.find(r => r.line.key === 'carInsurance');
    assert.equal(car.planned, 600);
    assert.equal(car.actual, 600);
    assert.equal(w.actualAlerts().filter(a => a.key === 'carInsurance').length, 0);
});

test('the Actual screen and the budget banner show what needs a look', () => {
    household();
    w.addActualCsv(SEPTEMBER);
    w.addActualCsv(OCTOBER);
    w.showActualScreen();
    const doc = w.document;
    assert.match(doc.getElementById('actualTable').textContent, /Groceries\$600\.00\$400\.50\$199\.50 under/);
    assert.match(doc.getElementById('actualAlerts').textContent, /Car insurance went up \$39\.00 a month/);
    assert.equal(doc.querySelectorAll('#actualMerchants select').length, 6);
    w.renderActualBanner();
    assert.equal(doc.getElementById('actualBanner').style.display, '');
    assert.match(doc.getElementById('actualBannerText').textContent, /2 bill changes/);
});
