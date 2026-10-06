// Startup: require sign-in, wire up the calculator inputs, and load the budget list.

(async function () {
    var user = await requireAuth();
    if (!user) return;

    setText('userEmail', user.email);

    var inputs = document.querySelectorAll('#calculatorScreen input[inputmode="decimal"]');
    for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', calculateAll);
    }
    setupMoneyFormatting();
    document.getElementById('calculatorScreen').addEventListener('input', function () { isDirty = true; });

    try {
        budgets = await loadBudgets();
    } catch (e) {
        console.error('Error loading budgets:', e);
        budgets = [];
    }

    displayBudgets();
    showScreen('homeScreen');
})();
