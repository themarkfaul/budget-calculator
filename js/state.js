// Shared state for the budget app. Loaded first; the other js/ files read and update these.

var selectedBudgetIndex = -1;
var selectedBudget = null;
var budgets = [];
var currentEditingBudget = null;
var isEditMode = false;
var incomeEarnerCount = 0;
var childCount = 0;
var isDirty = false;
