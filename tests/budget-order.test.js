// Budget list order: the user's saved order, new budgets at the end, and moving a budget saves it.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./load-app');

let w, saved;
before(() => { w = loadApp(); });
beforeEach(() => {
    saved = [];
    w.saveUserSettings = async s => { saved.push(s); return {}; };
    w.currentUser = { id: 'me', email: 'me@example.com', user_metadata: {} };
    w.householdShares = [];
    w.setBudgetOrder([]);
});

const make = (...names) => names.map(n => ({ id: 'id-' + n, user_id: 'me', name: n, summary: {}, data: {} }));
const names = list => plain(list.map(b => b.name));
const shown = () => plain(Array.from(w.document.querySelectorAll('#budgetList .budget-name')).map(el => el.textContent.trim()));

test('with no saved order, budgets keep the order they load in', () => {
    assert.deepEqual(names(w.orderBudgets(make('A', 'B', 'C'))), ['A', 'B', 'C']);
});

test('the saved order wins, and budgets not in it (like a new plan) go at the end', () => {
    w.setBudgetOrder(['id-C', 'id-A', 'id-B']);
    // Loaded newest-first, so a just-saved plan arrives first
    assert.deepEqual(names(w.orderBudgets(make('Plan', 'A', 'B', 'C'))), ['C', 'A', 'B', 'Plan']);
    // Deleted budgets in the saved order are simply skipped
    assert.deepEqual(names(w.orderBudgets(make('B', 'C'))), ['C', 'B']);
});

test('moving a budget redraws the list and saves the order to the account', async () => {
    w.budgets = make('A', 'B', 'C', 'D');
    w.displayBudgets();
    assert.match(w.document.getElementById('budgetList').textContent, /Press and hold a budget/);
    await w.moveBudget(3, 0);
    assert.deepEqual(shown(), ['D', 'A', 'B', 'C']);
    assert.deepEqual(plain(saved[0].budgetOrder), ['id-D', 'id-A', 'id-B', 'id-C']);
    assert.deepEqual(plain(w.currentUser.user_metadata.budgetOrder), ['id-D', 'id-A', 'id-B', 'id-C']);
    // Selecting still picks the right budget after the move
    w.selectBudget(0);
    assert.equal(w.selectedBudget.name, 'D');
});

test('if the order can\'t be saved, the list still moves and the user is told', async () => {
    w.saveUserSettings = async () => { throw new Error('boom'); };
    w.budgets = make('A', 'B');
    w.displayBudgets();
    await w.moveBudget(0, 1);
    assert.deepEqual(shown(), ['B', 'A']);
});

test('a quick tap selects; moving before the hold finishes is a scroll, not a drag', () => {
    w.budgets = make('A', 'B', 'C');
    w.displayBudgets();
    const item = w.document.querySelectorAll('#budgetList .budget-item')[1];
    w.onBudgetPointerDown({ target: item, pointerId: 1, clientX: 10, clientY: 100, pointerType: 'touch' });
    w.onBudgetPointerMove({ pointerId: 1, clientX: 10, clientY: 140, preventDefault() {} });
    assert.equal(w.dragState, null);

    // Hold, then let go without moving: nothing changes
    w.onBudgetPointerDown({ target: item, pointerId: 2, clientX: 10, clientY: 100, pointerType: 'touch' });
    w.liftBudget(100);
    assert.ok(item.classList.contains('budget-dragging'));
    w.onBudgetPointerUp({ pointerId: 2 });
    assert.deepEqual(shown(), ['A', 'B', 'C']);
    assert.equal(saved.length, 0);
});

test('one budget can\'t be dragged, and the hint only shows with two or more', () => {
    w.budgets = make('Only');
    w.displayBudgets();
    assert.doesNotMatch(w.document.getElementById('budgetList').textContent, /Press and hold/);
    const item = w.document.querySelector('#budgetList .budget-item');
    w.onBudgetPointerDown({ target: item, pointerId: 3, clientX: 0, clientY: 0, pointerType: 'mouse', button: 0 });
    assert.equal(w.dragState, null);
});
