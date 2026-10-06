// Screen switching, the home list, and the read-only Summary and Health Check screens.

// ── Screen Navigation ──

function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    document.getElementById(screenId).classList.add('active');
}

async function goHome() {
    showScreen('loadingScreen');
    selectedBudget = null;
    selectedBudgetIndex = -1;
    document.getElementById('actionButtons').classList.remove('show');
    try {
        budgets = await loadBudgets();
    } catch (e) {
        console.error('Error loading budgets:', e);
        budgets = [];
    }
    displayBudgets();
    showScreen('homeScreen');
}

function showCalcTab(evt, tabName) {
    var contents = document.querySelectorAll('#calculatorScreen .tab-content');
    for (var i = 0; i < contents.length; i++) contents[i].classList.remove('active');
    var tabs = document.querySelectorAll('#calculatorScreen .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    document.getElementById(tabName).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// ── Home Screen ──

function displayBudgets() {
    var container = document.getElementById('budgetList');

    if (budgets.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#6c757d; padding:20px;">No budgets yet. Create your first one below!</p>';
        return;
    }

    var html = '';
    for (var i = 0; i < budgets.length; i++) {
        var b = budgets[i];
        var s = b.summary || {};
        var date = b.updated_at ? new Date(b.updated_at).toLocaleDateString() : '';
        html += '<div class="budget-item" onclick="selectBudget(' + i + ')">';
        html += '<button class="delete-btn" onclick="handleDelete(event, ' + i + ')" title="Delete budget">✕</button>';
        html += '<div class="budget-item-header">';
        html += '<div class="budget-name">' + escapeHtml(b.name) + '</div>';
        html += '<div class="budget-date">' + escapeHtml(date) + '</div>';
        html += '</div>';
        html += '<div class="budget-preview">';
        html += '<div class="preview-item"><div class="preview-label">Take Home</div><div class="preview-value">' + escapeHtml(s.takeHome || '$0.00') + '</div></div>';
        html += '<div class="preview-item"><div class="preview-label">Housing</div><div class="preview-value">' + escapeHtml(s.housing || '$0.00') + '</div></div>';
        html += '<div class="preview-item"><div class="preview-label">Spending</div><div class="preview-value">' + escapeHtml(s.spending || '$0.00') + '</div></div>';
        html += '<div class="preview-item"><div class="preview-label">Remaining</div><div class="preview-value">' + escapeHtml(s.remainingBalance || '$0.00') + '</div></div>';
        html += '</div></div>';
    }
    container.innerHTML = html;
}

function selectBudget(index) {
    var items = document.querySelectorAll('.budget-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
    items[index].classList.add('selected');
    selectedBudgetIndex = index;
    selectedBudget = budgets[index];
    document.getElementById('actionButtons').classList.add('show');
}

async function handleDelete(event, index) {
    event.stopPropagation();
    if (!confirm('Delete "' + budgets[index].name + '"?')) return;
    try {
        await deleteBudgetFromDb(budgets[index].id);
        budgets.splice(index, 1);
        selectedBudget = null;
        selectedBudgetIndex = -1;
        document.getElementById('actionButtons').classList.remove('show');
        displayBudgets();
    } catch (e) {
        alert('Error deleting budget: ' + e.message);
    }
}

// ── Summary Screen ──

function showSummary() {
    if (!selectedBudget) { alert('Please select a budget first'); return; }
    setText('summaryTitle', selectedBudget.name + ' - Summary');
    var s = selectedBudget.summary || {};
    var data = [
        {label: 'Monthly Take Home', value: s.takeHome || '$0.00'},
        {label: 'Housing Total', value: s.housing || '$0.00'},
        {label: 'Transportation', value: s.transportation || '$0.00'},
        {label: 'Education', value: s.education || '$0.00'},
        {label: 'Utilities', value: s.utilities || '$0.00'},
        {label: 'Spending', value: s.spending || '$0.00'},
        {label: 'Savings', value: s.savings || '$0.00'},
        {label: 'Remaining Balance', value: s.remainingBalance || '$0.00'}
    ];
    var html = '';
    for (var i = 0; i < data.length; i++) {
        html += '<div class="summary-item"><h3>' + data[i].label + '</h3>';
        html += '<div class="amount">' + escapeHtml(data[i].value) + '</div></div>';
    }
    document.getElementById('summaryGrid').innerHTML = html;
    showScreen('summaryScreen');
}

// ── Evaluation Screen ──

function evaluateBudget() {
    if (!selectedBudget) { alert('Please select a budget first'); return; }
    setText('evaluationTitle', selectedBudget.name + ' - Financial Health Check');

    var s = selectedBudget.summary || {};
    var takeHome = parseMoney(s.takeHome);
    var housing = parseMoney(s.housing);
    var spending = parseMoney(s.spending);
    // Summary savings includes any leftover balance; judge the rule on what was actually budgeted
    var remaining = parseMoney(s.remainingBalance);
    var savings = parseMoney(s.savings) - (remaining > 0 ? remaining : 0);

    var housingLimit = takeHome * 0.25;
    var housingPercent = takeHome > 0 ? (housing / takeHome) * 100 : 0;
    var housingPass = housing <= housingLimit;

    setText('housingCosts', '$' + formatCurrency(housing));
    setText('housingLimit', '$' + formatCurrency(housingLimit));
    setText('housingPercent', housingPercent.toFixed(1) + '%');
    var hStatus = document.getElementById('housingRuleStatus');
    hStatus.textContent = housingPass ? '✅ PASS' : '❌ FAIL';
    hStatus.className = 'rule-status ' + (housingPass ? 'status-pass' : 'status-fail');

    // Groceries and gasoline sit on the Spending tab but are needs; read them from the saved inputs
    var data = selectedBudget.data || {};
    var essentials = calculateEssentialSpending(function (id) { return parseMoney(data[id]); });
    var wants = spending - essentials;
    var needs = housing + parseMoney(s.transportation) + parseMoney(s.education) + parseMoney(s.utilities) + essentials;
    // Paycheck retirement is real savings that never reaches take-home, so add it to both sides
    var paycheckRetirement = parseMoney(s.paycheckRetirement);
    savings += paycheckRetirement;
    var income = takeHome + paycheckRetirement;
    var needsPercent = income > 0 ? (needs / income) * 100 : 0;
    var wantsPercent = income > 0 ? (wants / income) * 100 : 0;
    var savingsPercent = income > 0 ? (savings / income) * 100 : 0;
    var budgetPass = needsPercent <= 50 && wantsPercent <= 30 && savingsPercent >= 20;

    setText('needsAmount', '$' + formatCurrency(needs) + ' (' + needsPercent.toFixed(1) + '%)');
    setText('wantsAmount', '$' + formatCurrency(wants) + ' (' + wantsPercent.toFixed(1) + '%)');
    setText('savingsAmount', '$' + formatCurrency(savings) + ' (' + savingsPercent.toFixed(1) + '%)');
    var bStatus = document.getElementById('budgetRuleStatus');
    bStatus.textContent = budgetPass ? '✅ PASS' : '❌ NEEDS WORK';
    bStatus.className = 'rule-status ' + (budgetPass ? 'status-pass' : 'status-fail');

    showScreen('evaluationScreen');
}

