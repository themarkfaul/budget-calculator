// Income tab: take-home pay in each mode, Social Security / Medicare, paycheck retirement.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget, money, text } = require('./load-app');

let w;
before(() => { w = loadApp(); });
beforeEach(() => newBudget(w));

test('estimate mode: salary with 401(k), HSA, own federal rate and state tax', () => {
    setField(w, 'salary_0', '100000');
    setField(w, 'retirement_0', '10');
    setField(w, 'hsa_0', '3000');
    setField(w, 'filingStatus_0', 'rate');
    setField(w, 'taxRate_0', '12');
    setField(w, 'stateIncomeTax_0', '4');

    const e = w.computeEarner(0);
    // Social Security and Medicare apply to pay minus payroll HSA ($97,000), not minus the 401(k)
    assert.equal((e.socialSecurity / 12).toFixed(2), '501.17');
    assert.equal((e.medicare / 12).toFixed(2), '117.21');
    // Income tax: 16% of $87,000 (pay minus 401(k) and HSA)
    assert.equal((e.incomeTax / 12).toFixed(2), '1160.00');
    assert.equal(text(w, 'earnerResult_0'), '5,471.63');
});

test('estimate mode: hourly pay defaults to 40 hours a week', () => {
    setField(w, 'payType_0', 'hourly');
    setField(w, 'hourlyRate_0', '25');
    setField(w, 'filingStatus_0', 'rate');   // no federal tax, to isolate the hours math
    // $52,000 a year, minus Social Security and Medicare only
    assert.equal(text(w, 'earnerResult_0'), '4,001.83');
});

test('federal tax from 2026 brackets matches the IRS tables', () => {
    // Expected values use the "base amount plus %" figures printed in Rev. Proc. 2025-32
    assert.equal(w.federalIncomeTax(60000 + 16100, 'single', 2026), 5800 + 0.22 * (60000 - 50400));
    assert.equal(w.federalIncomeTax(150000 + 32200, 'married', 2026), 11600 + 0.22 * (150000 - 100800));
    assert.equal(w.federalIncomeTax(80000 + 24150, 'hoh', 2026), 7740 + 0.22 * (80000 - 67450));
    assert.ok(Math.abs(w.federalIncomeTax(300000 + 16100, 'single', 2026) - (58448 + 0.35 * (300000 - 256225))) < 0.01);
    assert.equal(w.federalIncomeTax(10000, 'single', 2026), 0);   // below the standard deduction
});

test('new people default to the single-filer bracket estimate', () => {
    assert.equal(w.document.getElementById('filingStatus_0').value, 'single');
    setField(w, 'salary_0', '100000');
    setField(w, 'retirement_0', '10');
    setField(w, 'hsa_0', '3000');
    const e = w.computeEarner(0);
    // $87,000 after 401(k) and HSA, minus the $16,100 standard deduction = $70,900 taxable
    assert.equal(e.federalTax.toFixed(2), (5800 + 0.22 * (70900 - 50400)).toFixed(2));
});

test('married filing jointly taxes two earners together on combined income', () => {
    setField(w, 'salary_0', '150000');
    setField(w, 'filingStatus_0', 'married');
    const second = w.addIncomeEarner('Spouse');
    setField(w, 'salary_' + second, '50000');
    setField(w, 'filingStatus_' + second, 'married');

    const a = w.computeEarner(0), b = w.computeEarner(second);
    const joint = w.federalIncomeTax(200000, 'married', 2026);   // one joint return
    assert.ok(Math.abs(a.federalTax + b.federalTax - joint) < 0.01);
    assert.ok(Math.abs(a.federalTax - joint * 0.75) < 0.01);       // shared by income: 150k of 200k
});

test('own-rate mode hides the bracket hint and shows the rate box', () => {
    setField(w, 'filingStatus_0', 'rate');
    w.updateEarnerMode(0);
    assert.equal(w.document.getElementById('earner_0').dataset.filing, 'rate');
});

test('Social Security stops at the yearly wage base', () => {
    setField(w, 'salary_0', '250000');
    const e = w.computeEarner(0);
    assert.ok(Math.abs(e.socialSecurity - w.SOCIAL_SECURITY_WAGE_BASE * 0.062) < 0.01);
});

test('additional 0.9% Medicare applies above $200,000', () => {
    setField(w, 'salary_0', '250000');
    const e = w.computeEarner(0);
    assert.ok(Math.abs(e.medicare - (250000 * 0.0145 + 50000 * 0.009)) < 0.01);
});

test('take-home mode: paycheck amount times pay frequency', () => {
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '2200');
    setField(w, 'payFrequency_0', '26');
    setField(w, 'retirementPerCheck_0', '300');
    assert.equal(text(w, 'earnerResult_0'), '4,766.67');
    assert.equal(text(w, 'paycheckRetirementResult'), '650.00');
});

test('budgets saved before SS/Medicare were added keep their take-home', () => {
    w.loadBudgetDataIntoCalculator({ data: {
        _earnerCount: 1, _earnerIdx_0: 0, salary_0: '100,000', retirement_0: '10', hsa_0: '3,000', taxRate_0: '22'
    } });
    assert.equal(w.document.getElementById('ficaIncluded_0').checked, true);
    assert.equal(w.document.getElementById('filingStatus_0').value, 'rate');
    assert.equal(text(w, 'earnerResult_0'), '5,655.00');
});

test('budgets saved with a typed-in federal rate keep it after brackets were added', () => {
    w.loadBudgetDataIntoCalculator({ data: {
        _earnerCount: 1, _earnerIdx_0: 0, incomeMode_0: 'estimate', payType_0: 'salary',
        salary_0: '100,000', taxRate_0: '12', stateIncomeTax_0: '4'
    } });
    assert.equal(w.document.getElementById('filingStatus_0').value, 'rate');
    assert.equal(w.document.getElementById('ficaIncluded_0').checked, false);
    // 100,000 − SS 6,200 − Medicare 1,450 − 16% income tax 16,000 = 76,350 a year
    assert.equal(text(w, 'earnerResult_0'), '6,362.50');
});

test('retirement entered on both tabs shows a warning', () => {
    setField(w, 'salary_0', '100000');
    setField(w, 'retirement_0', '10');
    assert.equal(w.document.getElementById('retirementWarning').style.display, 'none');
    setField(w, 'retirement401k', '500');
    assert.equal(w.document.getElementById('retirementWarning').style.display, 'block');
});

test('two earners add together', () => {
    setField(w, 'incomeMode_0', 'net');
    setField(w, 'netPay_0', '1000');
    setField(w, 'payFrequency_0', '12');
    const idx = w.addIncomeEarner('Second');
    setField(w, 'incomeMode_' + idx, 'net');
    setField(w, 'netPay_' + idx, '2000');
    setField(w, 'payFrequency_' + idx, '12');
    assert.equal(money(text(w, 'incomeResult')), 3000);
});
