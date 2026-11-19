// Plan Ahead: what-if changes build a new budget, compared with today, with ideas to make it fit.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, text, plain } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => { newBudget(w); w.resetPlan(); });

function household() {
    const i = w.getEarnerIndices()[0];
    setField(w, 'salary_' + i, '120000');
    setField(w, 'retirement_' + i, '5');
    setField(w, 'housingMode', 'rent');
    setField(w, 'monthlyRent', '1800');
    setField(w, 'groceries', '700');
    setField(w, 'eatingOut', '400');
    setField(w, 'entertainment', '200');
    setField(w, 'shopping', '300');
    w.addSavingsItem('collegeFund');
    setField(w, 'collegeFund', '100');
    return i;
}

function change(type, values) {
    const c = w.addPlanChange(type);
    Object.assign(c.values, values);
    return c;
}

test('a boat and a country club go on the Other tab as wants, plus savings for the initiation fee', () => {
    household();
    w.showPlanScreen();
    change('boat', { price: '60000', down: '12000', rate: '8', term: '10', insurance: '1200', upkeep: '300' });
    change('club', { dues: '400', minimum: '1200', initiation: '6000', months: '12' });
    w.buildPlan();
    const others = w.getOtherExpenseIndices().map(i => [w.document.getElementById('otherName_' + i).value, w.val('otherAmount_' + i), w.document.getElementById('otherType_' + i).value]);
    const boatLoan = w.loanPayment(48000, 8, 10);
    assert.deepEqual(plain(others.map(o => o[0])), ['Boat loan', 'Boat insurance, storage & upkeep', 'Country club']);
    assert.equal(others[0][1].toFixed(2), boatLoan.toFixed(2));
    assert.equal(others[1][1], 400);
    assert.equal(others[2][1], 500);
    assert.ok(others.every(o => o[2] === 'want'));
    assert.ok(w.savingsItems().some(s => s.name === 'Country club initiation fee' && s.monthly === 500));
    // It's a new, unsaved budget; the original is kept for the comparison and for undo
    assert.equal(w.currentEditingBudget, null);
    assert.equal(w.planBase.data.otherExpenses.length, 0);
    assert.match(text(w, 'planCompare'), /With your plan/);
});

test('buying a house replaces rent, and the Self-Escrow plan follows', () => {
    household();
    w.showPlanScreen();
    change('house', { price: '450000', down: '90000', rate: '6', term: '30', taxRate: '1', insurance: '2400' });
    w.buildPlan();
    assert.equal(w.document.getElementById('housingMode').value, 'own');
    const keys = w.escrowBillList().map(b => b.key);
    assert.ok(keys.includes('mortgage') && keys.includes('propertyTax') && !keys.includes('rent'));
    const housing = w.loanPayment(360000, 6, 30) + 4500 / 12 + 200;
    assert.equal(w.calculateHousing().toFixed(2), housing.toFixed(2));
    assert.equal(w.planChangeCost(w.planChanges[0]).toFixed(2), (housing - 1800).toFixed(2));   // net of the rent it replaces
});

test('rebuilding starts from the original budget, so changes never stack', () => {
    household();
    w.showPlanScreen();
    const c = change('invest', { extra: '300' });
    w.buildPlan();
    assert.equal(w.val('investmentAccount'), 300);
    c.values.extra = '500';
    w.buildPlan();
    assert.equal(w.val('investmentAccount'), 500);
});

test('college goal sets the monthly College Fund amount', () => {
    household();
    w.showPlanScreen();
    const c = change('college', { goal: '90000', saved: '18000', years: '12' });
    assert.equal(w.planChangeCost(c), 500 - 100);   // $72,000 over 144 months, minus today's $100
    w.buildPlan();
    assert.equal(w.val('collegeFund'), 500);
});

test('a higher 401(k) lowers take-home pay through the tax math', () => {
    const i = household();
    const takeHomeBefore = w.calculateIncome();
    w.showPlanScreen();
    change('retirement', { who: String(i), percent: '10' });
    w.buildPlan();
    assert.equal(w.val('retirement_' + i), 10);
    const drop = takeHomeBefore - w.calculateIncome();
    assert.ok(drop > 0 && drop < 6000 / 12, 'take-home falls by less than the extra 5% because of the tax saving');
});

test('when the plan doesn\'t fit, it suggests trims that cover the gap, and can apply them', () => {
    household();
    w.showPlanScreen();
    change('other', { name: 'Horse', amount: '3000', type: 'want' });
    w.buildPlan();
    const remainingBefore = w.computeHealthCheck(w.planSnapshot()).remaining;
    assert.ok(w.planCuts.length >= 3);
    assert.equal(w.planCuts[0].name, 'Horse');   // biggest want first
    assert.equal(w.planCuts[0].saves, 750);
    assert.match(text(w, 'planIdeas'), /Trim some wants/);
    const planned = w.planCuts.reduce((s, c) => s + c.saves, 0);
    w.applyPlanCuts();
    const freed = w.computeHealthCheck(w.planSnapshot()).remaining - remainingBefore;
    assert.equal(Math.round(freed), planned);
    assert.equal(w.val('eatingOut') < 400, true);
});

test('changing an existing amount, and discarding the plan restores the original', () => {
    household();
    w.showPlanScreen();
    change('change', { line: 'eatingOut', amount: '250' });
    assert.equal(w.planChangeCost(w.planChanges[0]), -150);
    w.buildPlan();
    assert.equal(w.val('eatingOut'), 250);
    w.discardPlan();
    assert.equal(w.val('eatingOut'), 400);
    assert.equal(w.planBase, null);
});
