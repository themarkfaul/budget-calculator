// Startup: require sign-in, wire up the calculator inputs, and load the budget list.

(async function () {
    var user = await requireAuth();
    if (!user) return;

    currentUser = user;
    setText('userEmail', user.email);
    setSuggestionMode((user.user_metadata || {}).suggestionMode);

    var inputs = document.querySelectorAll(BUDGET_INPUTS);
    for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', calculateAll);
    }
    setupMoneyFormatting();
    setupSuggestions();
    setupSuggestions(document.getElementById('escrowScreen'));
    renderOtherSuggestions();
    ['calculatorScreen', 'escrowScreen'].forEach(function (id) {
        document.getElementById(id).addEventListener('input', function () { isDirty = true; });
    });
    window.addEventListener('beforeunload', warnAboutUnsavedChanges);

    try {
        budgets = await loadBudgets();
    } catch (e) {
        console.error('Error loading budgets:', e);
        budgets = [];
    }
    await refreshHouseholdShares();

    displayBudgets();
    showScreen('homeScreen');
})();
