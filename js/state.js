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

// Browser "Leave site?" prompt when closing, refreshing or navigating away from unsaved changes
function warnAboutUnsavedChanges(e) {
    var editing = document.getElementById('calculatorScreen').classList.contains('active');
    if (!isDirty || !editing || skipUnsavedWarning) return;
    e.preventDefault();
    e.returnValue = '';
}
