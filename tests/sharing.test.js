// Sharing with a spouse, saving a budget two people can edit, and the Self-Escrow screen.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget } = require('./load-app');

let w;
before(() => { w = loadApp(); });

const ME = { id: 'user-me', email: 'Me@Example.com' };
const SPOUSE_ID = 'user-spouse';

beforeEach(() => {
    w.currentUser = ME;
    w.householdShares = [];
    w.budgets = [
        { id: 'b1', user_id: ME.id, name: 'Ours', summary: {}, data: {} },
        { id: 'b2', user_id: SPOUSE_ID, name: 'Theirs', summary: {}, data: {} }
    ];
    w.confirm = () => true;
});

const items = () => Array.from(w.document.querySelectorAll('#budgetList .budget-item'));

test('budgets shared with me are labelled with the owner and have no delete button', () => {
    w.householdShares = [{ owner_id: SPOUSE_ID, owner_email: 'spouse@example.com', shared_with_email: 'me@example.com' }];
    w.displayBudgets();
    const [mine, theirs] = items();
    assert.ok(mine.querySelector('.delete-btn'));
    assert.equal(mine.querySelector('.share-tag'), null);
    assert.equal(theirs.querySelector('.delete-btn'), null);
    assert.equal(theirs.querySelector('.share-tag').textContent, '👥 From spouse@example.com');
    assert.equal(w.sharesToMe().length, 1);
    assert.equal(w.sharesFromMe().length, 0);
});

test('my budgets show "Shared" once I share with someone', () => {
    w.householdShares = [{ owner_id: ME.id, owner_email: 'me@example.com', shared_with_email: 'spouse@example.com' }];
    w.displayBudgets();
    assert.equal(items()[0].querySelector('.share-tag').textContent, '👥 Shared');
    assert.equal(w.sharesFromMe().length, 1);
});

test('deleting a budget someone shared with me is refused', async () => {
    let deleted = false;
    w.deleteBudgetFromDb = async () => { deleted = true; };
    await w.handleDelete({ stopPropagation() {} }, 1);
    assert.equal(deleted, false);
});

test('email checks for sharing', () => {
    assert.equal(w.normalizeEmail('  Spouse@Example.COM '), 'spouse@example.com');
    assert.ok(w.isValidEmail('spouse@example.com'));
    assert.ok(!w.isValidEmail('spouse'));
    assert.ok(!w.isValidEmail('spouse@example'));
});

test('saving asks before replacing changes someone else saved, then overwrites if OK', async () => {
    newBudget(w);
    w.currentEditingBudget = { id: 'b1', name: 'Ours', updated_at: '2026-11-17T10:00:00+00:00' };
    w.isEditMode = true;
    const calls = [];
    w.saveBudgetToDb = async budget => {
        calls.push({ updated_at: budget.updated_at, overwrite: !!budget.overwrite });
        if (!budget.overwrite) { const e = new Error('conflict'); e.code = 'BUDGET_CONFLICT'; throw e; }
        return { id: 'b1', name: 'Ours', updated_at: '2026-11-17T11:00:00+00:00' };
    };
    let asked = 0;
    w.confirm = () => { asked++; return true; };
    await w.handleSave();
    assert.equal(asked, 1);
    assert.deepEqual(calls, [
        { updated_at: '2026-11-17T10:00:00+00:00', overwrite: false },
        { updated_at: '2026-11-17T10:00:00+00:00', overwrite: true }
    ]);
    assert.equal(w.currentEditingBudget.updated_at, '2026-11-17T11:00:00+00:00');

    // Cancel keeps the other person's version: no second save
    calls.length = 0;
    w.currentEditingBudget = { id: 'b1', name: 'Ours', updated_at: 'old' };
    w.confirm = () => false;
    await w.handleSave();
    assert.equal(calls.length, 1);
    assert.equal(w.currentEditingBudget.updated_at, 'old');
});

test('Self-Escrow is its own screen, not a calculator tab', () => {
    const screen = w.document.getElementById('escrowScreen');
    assert.ok(screen.classList.contains('screen'));
    assert.equal(w.document.querySelector('#calculatorScreen #escrowBills'), null);
    assert.equal(w.document.querySelector('#calculatorScreen .tab[onclick*="escrow"]'), null);

    w.selectedBudget = w.budgets[0];
    w.openEscrow();
    assert.ok(screen.classList.contains('active'));
    assert.equal(w.document.getElementById('escrowTitle').textContent, '🧾 Self-Escrow: Ours');
    assert.ok(w.isEditingBudget());
    w.backToBudgetFromEscrow();
    assert.ok(w.document.getElementById('calculatorScreen').classList.contains('active'));
});

test('the Self-Escrow safety margin is still saved, restored and cleared with the budget', () => {
    newBudget(w);
    setField(w, 'escrowExtraCushion', '750');
    const data = w.gatherCalculatorData();
    assert.equal(data.escrowExtraCushion, '750');
    newBudget(w);
    assert.equal(w.document.getElementById('escrowExtraCushion').value, '');
    w.loadBudgetDataIntoCalculator({ data });
    assert.equal(w.document.getElementById('escrowExtraCushion').value, '750');
});
