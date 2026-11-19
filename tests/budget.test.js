// Expense tabs, dashboard balance, left-over split, health check, and save/load.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, money, text, plain } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => newBudget(w));

// $2,500 every two weeks = $5,416.67 a month
function withTakeHome() {
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '2500');
    setField(w, 'payFrequency_0', '26');
}

test('loan payments match standard amortization', () => {
    assert.equal(w.loanPayment(280000, 7.28, 30).toFixed(2), '1915.79');
    assert.equal(w.loanPayment(12000, 6.875, 5).toFixed(2), '236.91');
    assert.equal(w.loanPayment(12000, 0, 5), 200);   // no interest: principal / months
    assert.equal(w.loanPayment(12000, 6, 0), 0);
});

test('housing: owning uses the mortgage, taxes and insurance', () => {
    setField(w, 'houseValue', '300000');
    setField(w, 'mortgageDownPayment', '60000');
    setField(w, 'mortgageRate', '6');
    setField(w, 'mortgageTerm', '30');
    assert.equal(text(w, 'mortgagePaymentResult'), '1,438.92');
    setField(w, 'homeInsurance', '1200');
    assert.equal(text(w, 'housingResult'), '1,538.92');
});

test('housing: renting uses rent plus renter\'s insurance only', () => {
    setField(w, 'houseValue', '300000');           // ignored while renting
    setField(w, 'mortgageRate', '6');
    setField(w, 'mortgageTerm', '30');
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '1500');
    setField(w, 'rentersInsurance', '180');
    assert.equal(text(w, 'housingResult'), '1,515.00');
    assert.equal(w.document.getElementById('housingTab').dataset.mode, 'rent');
});

test('other expenses split into needs and wants', () => {
    w.addOtherExpense('Student loan', '350', 'need');
    w.addOtherExpense('Pet care', '80', 'want');
    w.addOtherExpense('Childcare', '900', 'need');
    const other = w.calculateOtherExpenses();
    assert.equal(other.needs, 1250);
    assert.equal(other.wants, 80);
    assert.equal(text(w, 'dashOther'), '$1,330.00');
});

test('dashboard: money left over', () => {
    withTakeHome();
    setField(w, 'groceries', '800');
    setField(w, 'cashSavings', '500');
    assert.equal(text(w, 'dashRemainingLabel'), 'Left Over');
    assert.equal(text(w, 'dashRemaining'), '$4,116.67');
    // Leftover is not added to the Savings card
    assert.equal(text(w, 'dashSavings'), '$500.00');
    assert.match(w.document.getElementById('dashRemainingCard').className, /balance-left/);
});

test('dashboard: over budget shows a negative amount and names the biggest costs', () => {
    withTakeHome();
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '5000');
    setField(w, 'groceries', '800');
    assert.equal(text(w, 'dashRemainingLabel'), 'Over Budget');
    assert.equal(text(w, 'dashRemaining'), '-$383.33');
    assert.match(text(w, 'dashBalanceMessage'), /spending \$383\.33 more/);
    assert.match(text(w, 'dashBalanceMessage'), /Housing \(\$5,000\.00\)/);
});

test('left-over split always adds up to the leftover', () => {
    withTakeHome();
    setField(w, 'leftoverSplitOn', true);
    for (const percent of [0, 5, 35, 50, 75, 100]) {
        setField(w, 'leftoverSavingsPercent', String(percent));
        const split = w.leftoverAllocation(5416.67);
        assert.equal(Math.round((split.toSavings + split.toSpending) * 100) / 100, 5416.67);
        assert.ok(split.toSpending >= 0);
    }
});

test('health check: balanced budget, housing rule and 50/30/20', () => {
    withTakeHome();
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '1500');
    setField(w, 'rentersInsurance', '180');
    setField(w, 'groceries', '600');    // essential: counts as a need
    setField(w, 'eatingOut', '200');    // want
    setField(w, 'cashSavings', '500');
    w.addOtherExpense('Student loan', '350', 'need');
    w.addOtherExpense('Pet care', '80', 'want');
    w.addOtherExpense('Childcare', '900', 'need');

    w.selectedBudget = { name: 'Test', data: w.gatherCalculatorData(), summary: w.buildSummary() };
    w.evaluateBudget();
    assert.equal(text(w, 'balanceRuleStatus'), '✅ PASS');
    assert.equal(text(w, 'balanceRemaining'), '$1,271.67');
    assert.equal(text(w, 'housingRuleStatus'), '❌ FAIL');          // $1,515 is 28% of take-home
    assert.equal(text(w, 'needsAmount'), '$3,365.00 (62.1%)');      // rent + groceries + loan + childcare
    assert.equal(text(w, 'wantsAmount'), '$280.00 (5.2%)');         // eating out + pet care
    assert.equal(text(w, 'savingsAmount'), '$500.00 (9.2%)');
});

test('health check counts paycheck retirement as savings', () => {
    withTakeHome();
    setField(w, 'retirementPerCheck_0', '300');   // $650 a month
    setField(w, 'cashSavings', '300');
    w.selectedBudget = { name: 'Test', data: w.gatherCalculatorData(), summary: w.buildSummary() };
    w.evaluateBudget();
    // ($300 + $650) / ($5,416.67 + $650)
    assert.equal(text(w, 'savingsAmount'), '$950.00 (15.7%)');
});

test('saving and reopening a budget restores everything', () => {
    withTakeHome();
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '1500');
    setField(w, 'groceries', '600');
    setField(w, 'leftoverSplitOn', true);
    setField(w, 'leftoverSavingsPercent', '75');
    w.addOtherExpense('Daycare "Little Stars"', '900', 'need');
    const saved = w.gatherCalculatorData();
    const dashboardBefore = text(w, 'dashRemaining');

    newBudget(w);
    assert.equal(w.document.querySelectorAll('#otherExpensesContainer .other-row').length, 0);
    w.loadBudgetDataIntoCalculator({ data: saved });

    // Reopening formats money with commas ("1500" → "1,500"), so compare without them
    const withoutCommas = data => JSON.parse(JSON.stringify(plain(data)).replace(/(\d),(\d{3})/g, '$1$2'));
    assert.deepEqual(withoutCommas(w.gatherCalculatorData()), withoutCommas(saved));
    assert.equal(text(w, 'dashRemaining'), dashboardBefore);
    assert.equal(w.document.getElementById('otherName_0').value, 'Daycare "Little Stars"');
});

test('summaries saved by older versions are read correctly', () => {
    // Older versions added leftover money into savings and wrote negatives as "$-866.50"
    assert.equal(w.plannedSavings({ savings: '$4,466.67', remainingBalance: '$3,966.67' }), 500);
    assert.equal(w.plannedSavings({ savings: '$500.00', remainingBalance: '$3,966.67', leftoverInSavings: false }), 500);
    assert.equal(w.parseMoney('$-866.50'), -866.5);
    assert.equal(w.formatSignedMoney(-866.5), '-$866.50');
});

test('owning a home outright: no mortgage, only tax, insurance and waste', () => {
    newBudget(w);
    setField(w, 'houseValue', '300000');
    setField(w, 'mortgageRate', '6');
    setField(w, 'mortgageTerm', '30');
    setField(w, 'homeInsurance', '1200');
    setField(w, 'propertyValue', '300000');
    setField(w, 'stateTaxRate', '1');
    setField(w, 'housingMode', 'paid');
    assert.equal(w.calculateHousing(), 100 + 250);
    assert.equal(w.escrowBillList().some(b => b.key === 'mortgage'), false);
    const data = w.gatherCalculatorData();
    assert.equal(data.housingMode, 'paid');
    newBudget(w);
    w.loadBudgetDataIntoCalculator({ data });
    assert.equal(w.document.getElementById('housingMode').value, 'paid');
    assert.equal(w.calculateHousing(), 350);
});

test('other income adds to take-home and is saved with the budget', () => {
    newBudget(w);
    const idx = w.getEarnerIndices()[0];
    setField(w, 'incomeMode_' + idx, 'net');
    setField(w, 'netPay_' + idx, '2000');
    setField(w, 'payFrequency_' + idx, '24');          // $4,000 a month
    w.addOtherIncome('Rental income', '1,200');
    w.addOtherIncome('Side job', '300');
    assert.equal(w.calculateIncome(), 5500);
    assert.equal(w.buildSummary().takeHome, '$5,500.00');
    assert.match(w.document.getElementById('dashTakeHome').getAttribute('data-explain'), /Rental income: \$1,200\.00/);
    // Not on a paycheck, so it goes to the spending account, not the per-paycheck split
    assert.equal(w.escrowPaycheckRows(0, 0)[0].paycheck, 2000);

    const data = w.gatherCalculatorData();
    assert.deepEqual(plain(data.otherIncome), [{ name: 'Rental income', amount: '1,200' }, { name: 'Side job', amount: '300' }]);
    assert.equal(data.otherIncomeAmount_0, undefined);
    newBudget(w);
    assert.equal(w.calculateIncome(), 0);
    w.loadBudgetDataIntoCalculator({ data });
    assert.equal(w.calculateIncome(), 5500);
});

test('savings: starts with Cash Savings; other kinds are added with buttons', () => {
    newBudget(w);
    const names = () => plain(w.savingsItems().map(i => i.name));
    assert.deepEqual(names(), ['Cash Savings']);
    const chips = () => Array.from(w.document.querySelectorAll('#savingsSuggestions .suggestion-chip'), b => b.textContent);
    assert.ok(chips().includes('+ Emergency Fund'));
    assert.ok(!chips().includes('+ Cash Savings'));

    w.addSuggestedSavings('emergencyFund');
    assert.ok(!chips().includes('+ Emergency Fund'));   // each kind once
    setField(w, 'emergencyFund', '400');
    setField(w, 'cashSavings', '100');
    const custom = w.addSavingsItem(undefined, 'Boat', '50');
    w.calculateAll();
    assert.equal(w.calculateSavings(), 550);
    assert.deepEqual(names(), ['Cash Savings', 'Emergency Fund', 'Boat']);

    // Saved and reopened, including the custom line and its key (Self-Escrow choices use it)
    w.onEscrowChange(custom, 'route', 'spending');
    const data = w.gatherCalculatorData();
    assert.equal(data.emergencyFund, undefined);
    newBudget(w);
    w.loadBudgetDataIntoCalculator({ data });
    assert.deepEqual(names(), ['Cash Savings', 'Emergency Fund', 'Boat']);
    assert.equal(w.calculateSavings(), 550);
    assert.equal(w.escrowBillList().find(b => b.name === 'Boat').route, 'spending');

    w.removeSavingsItem('emergencyFund');
    assert.equal(w.calculateSavings(), 150);
    assert.ok(chips().includes('+ Emergency Fund'));
});

test('budgets saved with the old fixed savings fields load into the list', () => {
    newBudget(w);
    w.loadBudgetDataIntoCalculator({ data: { cashSavings: '300', investmentAccount: '270', collegeFund: '200',
        escrow: { items: { collegeFund: { route: 'spending' } } } } });
    assert.deepEqual(plain(w.savingsItems().map(i => [i.name, i.monthly])),
        [['Cash Savings', 300], ['Investment Account', 270], ['College Fund', 200]]);
    assert.equal(w.escrowBillList().find(b => b.key === 'collegeFund').route, 'spending');
    // An old budget with no savings still shows the Cash Savings line
    w.loadBudgetDataIntoCalculator({ data: { groceries: '600' } });
    assert.deepEqual(plain(w.savingsItems().map(i => i.name)), ['Cash Savings']);
});
