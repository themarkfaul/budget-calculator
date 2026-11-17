// Shared state for the budget app. Loaded first; the other js/ files read and update these.

var selectedBudgetIndex = -1;
var selectedBudget = null;
var budgets = [];
var currentEditingBudget = null;
var isEditMode = false;
var incomeEarnerCount = 0;
var childCount = 0;
var isDirty = false;
var skipUnsavedWarning = false;   // set when the app already asked before leaving the page

// Every saved number field of a budget: the calculator tabs plus the Self-Escrow screen
var BUDGET_INPUTS = '#calculatorScreen input[inputmode="decimal"], #escrowScreen input[inputmode="decimal"]';

// True while a budget is open, on the calculator or its Self-Escrow screen
function isEditingBudget() {
    return document.getElementById('calculatorScreen').classList.contains('active') ||
        document.getElementById('escrowScreen').classList.contains('active');
}

// Browser "Leave site?" prompt when closing, refreshing or navigating away from unsaved changes
function warnAboutUnsavedChanges(e) {
    if (!isDirty || !isEditingBudget() || skipUnsavedWarning) return;
    e.preventDefault();
    e.returnValue = '';
}
