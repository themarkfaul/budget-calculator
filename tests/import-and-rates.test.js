// CSV import parsing and categories, the Social Security limit table, and mortgage rate checks.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./load-app');

let w;
before(() => { w = loadApp(); });

function importCsv(csv) {
    const rows = w.parseCsv(csv);
    const result = w.readTransactions(rows, w.detectColumns(rows));
    return plain({
        credits: result.credits,
        purchases: result.purchases.map(t => {
            const key = w.merchantKey(t.description);
            return [key, t.amount, w.categorize(t.description, t.bankCategory, {}, key)];
        })
    });
}

test('CSV: card export with negative purchases and a category column (Chase style)', () => {
    const r = importCsv(
        'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n' +
        '09/28/2026,09/29/2026,KROGER #432,Groceries,Sale,-142.18,\n' +
        '09/25/2026,09/26/2026,THORNTONS #0123,Gas,Sale,-48.50,\n' +
        '09/20/2026,09/21/2026,Payment Thank You-Mobile,,Payment,1200.00,\n' +
        '09/18/2026,09/19/2026,NETFLIX.COM,Bills & Utilities,Sale,-15.49,\n' +
        '09/01/2026,09/02/2026,AMAZON MKTPL*ZZ99,Shopping,Return,20.00,\n');
    assert.deepEqual(r.purchases, [
        ['KROGER', 142.18, 'groceries'],
        ['THORNTONS', 48.5, 'gasoline'],
        ['NETFLIX.COM', 15.49, 'tv']
    ]);
    assert.equal(r.credits, 2);   // the payment and the return
});

test('CSV: positive purchases (Amex style)', () => {
    const r = importCsv(
        'Date,Description,Amount\n' +
        "08/30/2026,MCDONALD'S F1234 LEXINGTON KY,12.45\n" +
        '08/15/2026,AUTOPAY PAYMENT - THANK YOU,-800.00\n' +
        '08/10/2026,HOME DEPOT #2307,88.00\n' +
        '07/28/2026,KENTUCKY UTILITIES CO,134.22\n');
    assert.deepEqual(r.purchases.map(p => p[2]), ['eatingOut', 'tools', 'electric']);
    assert.equal(r.credits, 1);
});

test('CSV: separate debit and credit columns (Capital One style)', () => {
    const r = importCsv(
        'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n' +
        '2026-09-20,2026-09-21,1234,VERIZON WIRELESS,Phone/Cable,95.00,\n' +
        '2026-09-10,2026-09-11,1234,CAPITAL ONE MOBILE PYMT,Payment/Credit,,400.00\n' +
        '2026-08-25,2026-08-26,1234,COLUMBIA GAS OF KENTUCKY,Utilities,41.30,\n');
    assert.deepEqual(r.purchases.map(p => p[2]), ['phone', 'gas']);
    assert.equal(r.credits, 1);
});

test('CSV: no header row, with bank wording stripped (Wells Fargo style)', () => {
    const r = importCsv(
        '"09/15/2026","-75.12","*","","PURCHASE AUTHORIZED ON 09/14 ALDI 72010 LEXINGTON KY"\n' +
        '"09/14/2026","2500.00","*","","PAYROLL DIRECT DEP ACME CORP"\n' +
        '"09/01/2026","-15.49","*","","RECURRING PAYMENT AUTHORIZED ON 09/01 NETFLIX.COM CA"\n');
    // "RECURRING PAYMENT" must not trip the payment skip rule
    assert.deepEqual(r.purchases.map(p => p[2]), ['groceries', 'tv']);
    assert.equal(r.credits, 1);
});

test('CSV: unrecognized columns give a clear error', () => {
    assert.throws(() => w.detectColumns(w.parseCsv('Name,Notes\nfoo,bar\n')), /columns weren't recognized/);
});

test('Social Security wage base by year', () => {
    assert.equal(w.getSocialSecurityWageBase(2025), 176100);
    assert.equal(w.getSocialSecurityWageBase(2026), 184500);
    assert.ok(w.getSocialSecurityWageBase(2100) >= 184500);   // latest known year
    assert.equal(w.getSocialSecurityWageBase(1990), 176100);  // earliest known year
});

test('mortgage rates by term, with guides for 10 and 20 years', () => {
    assert.equal(w.marketRateFor(30).rate, 7.28);
    assert.equal(w.marketRateFor(15).rate, 6.6);
    assert.equal(w.marketRateFor(20).rate, 6.94);
    assert.equal(w.marketRateFor(20).estimate, true);
    assert.equal(w.marketRateFor(10).rate, 6.6);
    assert.equal(w.marketRateFor(10).estimate, true);
});

test('entered rates are compared with the market', () => {
    assert.equal(w.checkRateAgainstMarket(7.3, 30).level, 'ok');
    assert.equal(w.checkRateAgainstMarket(6.25, 30).level, 'info');
    assert.match(w.checkRateAgainstMarket(6.25, 30).text, /1\.03 points below/);
    assert.equal(w.checkRateAgainstMarket(3, 30).level, 'warn');
    assert.equal(w.checkRateAgainstMarket(0, 30), null);
});
