// Escrow tab: which bills go in escrow, the monthly deposit, cushion, paychecks, and saving.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, text } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => newBudget(w));

// A household like the one the feature was designed around
function household() {
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '3000');
    setField(w, 'payFrequency_0', '26');                 // $6,500 a month
    setField(w, 'houseValue', '300000');
    setField(w, 'mortgageDownPayment', '60000');
    setField(w, 'mortgageRate', '6');
    setField(w, 'mortgageTerm', '30');                  // $1,438.92 a month
    setField(w, 'propertyValue', '300000');
    setField(w, 'stateTaxRate', '1');                   // $3,000 a year
    setField(w, 'homeInsurance', '1200');               // $1,200 a year
    setField(w, 'carInsuranceAnnual', '1200');          // $1,200 a year
    setField(w, 'electric', '150');
    setField(w, 'groceries', '800');                    // spending account by default
    setField(w, 'eatingOut', '300');
    setField(w, 'cashSavings', '500');
    w.addOtherExpense('Student loan', '350', 'need');   // need: escrow by default
    w.addOtherExpense('Golf', '100', 'want');           // want: spending account
}

const keys = list => Array.from(list, b => b.key);

test('fixed bills and needs go in escrow by default; spending and savings do not', () => {
    household();
    const bills = w.escrowBillList();
    const escrowed = keys(bills.filter(b => b.escrow));
    assert.deepEqual(escrowed, ['mortgage', 'propertyTax', 'homeInsurance', 'carInsurance', 'electric', 'other:Student loan']);
    assert.deepEqual(keys(bills.filter(b => !b.escrow)), ['other:Golf', 'groceries', 'eatingOut', 'cashSavings']);
});

test('monthly escrow deposit, savings transfers and spending account', () => {
    household();
    const t = w.escrowTotals(6500);
    // 1,438.92 mortgage + 250 tax + 100 home ins + 100 car ins + 150 electric + 350 loan
    assert.equal(t.escrow.toFixed(2), '2388.92');
    assert.equal(t.savingsTransfers, 500);
    assert.equal(t.spendingAccount.toFixed(2), (6500 - 2388.92 - 500).toFixed(2));
    assert.equal(text(w, 'escrowDeposit'), '$2,388.92');
});

test('lump bills: payments fall in their due months and the year balances out', () => {
    const bill = { escrow: true, monthly: 250, schedule: 'twice', month: 5 };   // $1,500 in May and Nov
    const due = Array.from({ length: 12 }, (_, i) => w.billDueIn(bill, i + 1));
    assert.equal(due[4], 1500);
    assert.equal(due[10], 1500);
    assert.equal(due.reduce((a, b) => a + b, 0), 3000);
    const quarterly = { escrow: true, monthly: 100, schedule: 'quarterly', month: 2 };
    assert.deepEqual([2, 5, 8, 11].map(m => w.billDueIn(quarterly, m)), [300, 300, 300, 300]);
    assert.equal(w.billDueIn(quarterly, 3), 0);
});

test('cushion: enough that the balance never goes below zero', () => {
    const bills = [
        { escrow: true, monthly: 100, schedule: 'monthly', month: 1 },
        { escrow: true, monthly: 250, schedule: 'yearly', month: 1 }   // $3,000 due in January
    ];
    // Starting in January: first month's $100 + $3,000 are due before any deposit
    const fromJan = w.computeEscrowPlan(bills, 1, 0);
    assert.equal(fromJan.deposit, 350);
    assert.equal(fromJan.cushion, 3100);
    // Starting in February: by next January 11 deposits have built up, so less is needed
    const fromFeb = w.computeEscrowPlan(bills, 2, 0);
    assert.ok(fromFeb.cushion < fromJan.cushion);
    for (const plan of [fromJan, fromFeb]) {
        assert.ok(plan.months.every(m => m.balanceAfterBills >= -0.005));
        assert.ok(plan.months.some(m => Math.abs(m.balanceAfterBills) < 0.005));   // it reaches exactly zero
    }
    // An extra safety margin is added on top
    assert.equal(w.computeEscrowPlan(bills, 1, 500).cushion, 3600);
});

test('unchecking a bill moves it to the spending account', () => {
    household();
    w.onEscrowChange('electric', 'on', false);
    assert.equal(w.escrowTotals(6500).escrow.toFixed(2), '2238.92');
    w.onEscrowChange('groceries', 'on', true);
    assert.equal(w.escrowTotals(6500).escrow.toFixed(2), '3038.92');
});

test('deposits are split per paycheck for each person', () => {
    household();
    w.addIncomeEarner('Spouse');
    const spouse = w.getEarnerIndices()[1];
    setField(w, 'incomeMode_' + spouse, 'net');
    setField(w, 'netPay_' + spouse, '3250');
    setField(w, 'payFrequency_' + spouse, '12');        // $3,250 a month, paid monthly
    const rows = w.escrowPaycheckRows(2400, 0);
    // Take-home split 6,500 : 3,250 → two-thirds and one-third of the escrow deposit
    assert.equal(rows[0].escrow.toFixed(2), (2400 * (2 / 3) * 12 / 26).toFixed(2));
    assert.equal(rows[1].escrow.toFixed(2), (2400 / 3).toFixed(2));
    assert.equal(rows[0].paycheck, 3000);
    assert.equal((rows[0].escrow + rows[0].spending).toFixed(2), '3000.00');
});

test('escrow choices are saved and restored with the budget', () => {
    household();
    w.onEscrowChange('electric', 'on', false);
    w.onEscrowChange('propertyTax', 'schedule', 'twice');
    w.onEscrowChange('propertyTax', 'month', '5');
    const data = w.gatherCalculatorData();
    const summary = w.buildSummary();
    assert.equal(summary.escrowDeposit, '$2,238.92');

    newBudget(w);
    assert.deepEqual(Object.keys(w.escrowSettings.items), []);
    w.loadBudgetDataIntoCalculator({ data });
    const tax = w.escrowBillList().find(b => b.key === 'propertyTax');
    assert.equal(tax.schedule, 'twice');
    assert.equal(tax.month, 5);
    assert.equal(w.escrowBillList().find(b => b.key === 'electric').escrow, false);
});

test('renters: rent and renter\'s insurance replace the mortgage lines', () => {
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '1500');
    setField(w, 'rentersInsurance', '240');
    const bills = w.escrowBillList();
    assert.deepEqual(keys(bills.filter(b => b.group === 'Housing')), ['rent', 'rentersInsurance']);
    assert.equal(bills.find(b => b.key === 'rentersInsurance').lump, true);
});

test('savings: paycheck direct deposit by default, or paid from self-escrow or the spending account', () => {
    household();
    w.addSavingsItem('investmentAccount');
    setField(w, 'investmentAccount', '270');
    w.addSavingsItem('collegeFund');
    setField(w, 'collegeFund', '200');
    const route = key => w.escrowBillList().find(b => b.key === key);
    assert.equal(route('cashSavings').route, 'direct');
    assert.equal(w.escrowTotals(6500).savingsTransfers, 970);

    w.onEscrowChange('collegeFund', 'route', 'spending');
    assert.equal(w.escrowTotals(6500).savingsTransfers, 770);
    assert.equal(route('collegeFund').escrow, false);

    w.onEscrowChange('investmentAccount', 'route', 'escrow');
    const t = w.escrowTotals(6500);
    assert.equal(t.savingsTransfers, 500);
    assert.equal(t.escrow.toFixed(2), (2388.92 + 270).toFixed(2));
    assert.equal(t.spendingAccount.toFixed(2), (6500 - 2388.92 - 270 - 500).toFixed(2));

    // Budgets saved before routes existed: a checked savings item meant "in escrow"
    w.loadEscrowSettings({ items: { cashSavings: { on: true } } });
    assert.equal(route('cashSavings').route, 'escrow');
});

test('the Savings tab "Paid by" choice and account name carry into the Self-Escrow plan', () => {
    household();
    const select = w.document.querySelector('select[data-route-for="cashSavings"]');
    assert.equal(select.value, 'direct');
    select.value = 'spending';
    select.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(w.escrowBillList().find(b => b.key === 'cashSavings').route, 'spending');

    const name = w.document.getElementById('savingsAccountName');
    name.value = 'Vanguard';
    name.dispatchEvent(new w.Event('input', { bubbles: true }));
    w.onEscrowChange('cashSavings', 'route', 'direct');
    assert.equal(text(w, 'escrowSavingsTitle'), 'Direct to Vanguard');
    assert.match(w.document.getElementById('escrowPaychecks').textContent, /To Vanguard/);
    assert.equal(w.gatherEscrowSettings().savingsAccountName, 'Vanguard');
});

test('calculated numbers explain where they come from', () => {
    household();
    w.addSavingsItem('investmentAccount');
    setField(w, 'investmentAccount', '270');
    const explain = id => w.document.getElementById(id).getAttribute('data-explain');
    assert.match(explain('escrowSavings'), /Cash Savings: \$500\.00\nInvestment Account: \$270\.00\nTotal: \$770\.00/);
    assert.match(explain('escrowSpending'), /Take-home pay: \$6,500\.00/);
    assert.match(explain('dashHousing'), /Mortgage payment: \$1,438\.92/);
    assert.match(explain('dashTakeHome'), /Total: \$6,500\.00/);
    // Paycheck "to savings" cell: items, then monthly × 12 ÷ 26 paychecks
    const cell = Array.from(w.document.querySelectorAll('#escrowPaychecks [data-explain]'))
        .find(el => el.textContent === '$355.38');
    assert.ok(cell, 'savings per paycheck cell');
    assert.match(cell.getAttribute('data-explain'), /Investment Account: \$270\.00[\s\S]*÷ 26 paychecks a year/);
});

test('check-up: shortage spread over 12 deposits, surplus when over, like a servicer analysis', () => {
    const bills = [
        { escrow: true, monthly: 100, schedule: 'monthly', month: 1 },
        { escrow: true, monthly: 250, schedule: 'yearly', month: 3 }   // $3,000 due in March
    ];
    // Starting in January with $500: Jan −100 +350 = 750, Feb 650+350 = 1000, Mar 1000−100−3000 = −2,100 lowest
    const short = w.escrowCheckup(bills, 1, 500, 350, 0);
    assert.equal(short.lowestMonth, 3);
    assert.equal(short.shortage, 2100);
    assert.equal(short.newDeposit, 350 + 175);
    // A safety margin raises what's needed
    assert.equal(w.escrowCheckup(bills, 1, 500, 350, 200).shortage, 2300);
    // Plenty in the account: surplus is how far the lowest point sits above the margin
    const over = w.escrowCheckup(bills, 1, 3000, 350, 0);
    assert.equal(over.shortage, 0);
    assert.equal(over.surplus, 400);
});

test('check-up shows on the Self-Escrow screen once today\'s balance is entered', () => {
    household();
    const box = () => w.document.getElementById('escrowCheckup').textContent;
    assert.match(box(), /Enter today's balance/);
    setField(w, 'escrowCurrentBalance', '0');
    assert.match(box(), /Short by/);
    setField(w, 'escrowCurrentDeposit', '2000');
    assert.match(box(), /Your bills now need \$2,388\.92 a month\. You deposit \$2,000\.00, so raise it by \$388\.92/);
    setField(w, 'escrowCurrentBalance', '20000');
    assert.match(box(), /Over by/);
});
