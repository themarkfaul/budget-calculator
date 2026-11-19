// Offline copy of the budget list, and "Download my data".
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./load-app');

let w;
before(() => { w = loadApp(); });

const ME = { id: 'user-me', email: 'me@example.com' };
const list = [
    { id: 'b1', user_id: ME.id, name: 'Ours', summary: { takeHome: '$1.00' }, data: { tv: '60' }, updated_at: '2026-11-17T10:00:00Z' },
    { id: 'b2', user_id: 'user-spouse', name: 'Theirs', summary: {}, data: {} }
];

beforeEach(() => {
    w.localStorage.clear();
    w.currentUser = ME;
    w.householdShares = [];
    w.refreshHouseholdShares = async () => {};
});

test('budgets load from the network and a copy is kept on the device', async () => {
    w.loadBudgets = async () => list;
    const got = await w.loadBudgetsOrCache();
    assert.equal(got.length, 2);
    assert.equal(w.showingCachedBudgets, false);
    assert.equal(w.readBudgetCache().budgets[0].name, 'Ours');
});

test('with no connection, the device copy is shown with an offline banner', async () => {
    w.loadBudgets = async () => list;
    await w.loadBudgetsOrCache();
    w.loadBudgets = async () => { throw new TypeError('Failed to fetch'); };
    const got = await w.loadBudgetsOrCache();
    assert.deepEqual(plain(got).map(b => b.name), ['Ours', 'Theirs']);
    assert.ok(w.showingCachedBudgets);
    const banner = w.document.getElementById('offlineBanner');
    assert.equal(banner.style.display, 'block');
    assert.match(banner.textContent, /You're offline/);
});

test('a real error (not offline) is still reported, and no copy means no fallback', async () => {
    w.loadBudgets = async () => { throw new Error('permission denied'); };
    await assert.rejects(w.loadBudgetsOrCache(), /permission denied/);
    w.loadBudgets = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(w.loadBudgetsOrCache(), /Failed to fetch/);
});

test('signing out clears the device copy', async () => {
    w.loadBudgets = async () => list;
    await w.loadBudgetsOrCache();
    w.localStorage.setItem('unrelated', 'keep');
    w.clearBudgetCaches();
    assert.equal(w.readBudgetCache(), null);
    assert.equal(w.localStorage.getItem('unrelated'), 'keep');
});

test('data export holds only my own budgets, with settings and sharing', () => {
    w.householdShares = [{ owner_id: ME.id, owner_email: ME.email, shared_with_email: 'spouse@example.com' }];
    const out = plain(w.buildDataExport(list.filter(w.isOwnBudget)));
    assert.equal(out.app, 'My Budget AI');
    assert.equal(out.account.email, ME.email);
    assert.deepEqual(out.sharedWith, ['spouse@example.com']);
    assert.deepEqual(out.budgets.map(b => b.name), ['Ours']);
    assert.deepEqual(out.budgets[0].data, { tv: '60' });
    assert.equal(w.dataExportFileName(new w.Date(2026, 10, 7)), 'my-budget-ai-data-2026-11-07.json');
});

test('a downloaded backup can be read back for restoring', () => {
    w.currentUser = ME;
    const file = JSON.stringify(w.buildDataExport([list[0]]));
    const backup = w.parseDataBackup(file);
    assert.deepEqual(plain(backup.budgets), [{ name: 'Ours', data: { tv: '60' }, summary: { takeHome: '$1.00' } }]);
    // Other files are refused with a plain message
    assert.throws(() => w.parseDataBackup('not json'), /isn't a My Budget AI backup/);
    assert.throws(() => w.parseDataBackup('{"budgets":[]}'), /isn't a My Budget AI backup/);
    assert.throws(() => w.parseDataBackup('{"app":"My Budget AI","budgets":[{"name":"x","data":"bad"}]}'), /no budgets/);
});

test('restored budgets never take an existing name', () => {
    const names = w.restoredNames([{ name: 'Ours' }, { name: 'New' }, { name: 'Ours' }], ['Ours', 'ours (restored)']);
    assert.deepEqual(plain(names), ['Ours (restored 2)', 'New', 'Ours (restored 3)']);
});
