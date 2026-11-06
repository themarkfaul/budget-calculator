// Screen switching, the home list, and the read-only Summary and Health Check screens.

// ── Screen Navigation ──

// Sign Out button: ask about unsaved changes before signing out, not after
function handleSignOut() {
    var editing = document.getElementById('calculatorScreen').classList.contains('active');
    if (editing && isDirty && !confirm('You have unsaved changes to this budget. Sign out without saving?')) return;
    skipUnsavedWarning = true;
    signOut();
}

function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    document.getElementById(screenId).classList.add('active');
    refreshMortgageHandoff();
}

async function goHome() {
    showScreen('loadingScreen');
    selectedBudget = null;
    selectedBudgetIndex = -1;
    hideBudgetActions();
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
    hideBudgetActions();
    document.getElementById('compareBtn').style.display = budgets.length >= 2 ? 'inline-block' : 'none';

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
        var remaining = parseMoney(s.remainingBalance);
        html += '<div class="preview-item"><div class="preview-label">Remaining</div><div class="preview-value preview-' +
            balanceStatus(remaining) + '">' + formatSignedMoney(remaining) + '</div></div>';
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

    // Show Summary / Edit / Evaluate directly under the selected budget
    var actions = document.getElementById('actionButtons');
    items[index].after(actions);
    actions.classList.add('show');
}

// Hide the budget buttons and park them outside the list, so redrawing the list can't remove them
function hideBudgetActions() {
    var actions = document.getElementById('actionButtons');
    actions.classList.remove('show');
    document.getElementById('budgetList').after(actions);
}

async function handleDelete(event, index) {
    event.stopPropagation();
    if (!confirm('Delete "' + budgets[index].name + '"?')) return;
    try {
        await deleteBudgetFromDb(budgets[index].id);
        budgets.splice(index, 1);
        selectedBudget = null;
        selectedBudgetIndex = -1;
        hideBudgetActions();
        displayBudgets();
    } catch (e) {
        showToast("Couldn't delete the budget: " + e.message, 'error');
    }
}

// ── Summary Screen ──

function showSummary() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    setText('summaryTitle', selectedBudget.name + ' - Summary');
    var s = selectedBudget.summary || {};
    var data = [
        {label: 'Monthly Take Home', value: s.takeHome || '$0.00'},
        {label: 'Housing Total', value: s.housing || '$0.00'},
        {label: 'Transportation', value: s.transportation || '$0.00'},
        {label: 'Education', value: s.education || '$0.00'},
        {label: 'Utilities', value: s.utilities || '$0.00'},
        {label: 'Spending', value: s.spending || '$0.00'},
        {label: 'Other', value: s.other || '$0.00'},
        {label: 'Savings', value: '$' + formatCurrency(plannedSavings(s))}
    ];
    var remaining = parseMoney(s.remainingBalance);
    var status = balanceStatus(remaining);
    var html = '';
    for (var i = 0; i < data.length; i++) {
        html += '<div class="summary-item"><h3>' + data[i].label + '</h3>';
        html += '<div class="amount">' + escapeHtml(data[i].value) + '</div></div>';
    }
    html += '<div class="summary-item balance-' + status + '"><h3>' +
        { left: 'Left Over', over: 'Over Budget', even: 'Remaining' }[status] + '</h3>' +
        '<div class="amount">' + formatSignedMoney(remaining) + '</div></div>';
    var toSavings = parseMoney(s.leftoverToSavings), toSpending = parseMoney(s.leftoverToSpending);
    if (status === 'left' && toSavings + toSpending > 0) {
        html += '<div class="summary-item balance-left"><h3>Remaining for Savings</h3><div class="amount">$' + formatCurrency(toSavings) + '</div></div>';
        html += '<div class="summary-item balance-left"><h3>Remaining for Spending</h3><div class="amount">$' + formatCurrency(toSpending) + '</div></div>';
    }
    document.getElementById('summaryGrid').innerHTML = html;
    showScreen('summaryScreen');
}

// ── Evaluation Screen ──

// Health check numbers for a saved budget (no screen updates), used by the Health Check
// screen, the side-by-side comparison and the printed report.
function computeHealthCheck(budget) {
    var s = budget.summary || {};
    var data = budget.data || {};
    var takeHome = parseMoney(s.takeHome);
    var housing = parseMoney(s.housing);
    var spending = parseMoney(s.spending);
    var remaining = parseMoney(s.remainingBalance);

    // Groceries and gasoline sit on the Spending tab but are needs; read them from the saved inputs
    var essentials = calculateEssentialSpending(function (id) { return parseMoney(data[id]); });
    var needs = housing + parseMoney(s.transportation) + parseMoney(s.education) + parseMoney(s.utilities) +
        essentials + parseMoney(s.otherNeeds);
    // Left-over money the user planned via the dashboard split counts toward wants and savings
    var wants = spending - essentials + parseMoney(s.leftoverToSpending) + parseMoney(s.otherWants);
    // Paycheck retirement is real savings that never reaches take-home, so add it to both sides
    var paycheckRetirement = parseMoney(s.paycheckRetirement);
    var savings = plannedSavings(s) + parseMoney(s.leftoverToSavings) + paycheckRetirement;
    var income = takeHome + paycheckRetirement;
    var pct = function (amount) { return income > 0 ? (amount / income) * 100 : 0; };

    var housingLimit = takeHome * 0.25;
    var check = {
        takeHome: takeHome,
        costs: takeHome - remaining,
        remaining: remaining,
        balance: balanceStatus(remaining),
        housing: housing,
        housingLimit: housingLimit,
        housingPercent: takeHome > 0 ? (housing / takeHome) * 100 : 0,
        housingPass: housing <= housingLimit,
        needs: needs, wants: wants, savings: savings,
        needsPercent: pct(needs), wantsPercent: pct(wants), savingsPercent: pct(savings)
    };
    check.balancePass = check.balance !== 'over';
    check.ruleOf503020Pass = check.needsPercent <= 50 && check.wantsPercent <= 30 && check.savingsPercent >= 20;
    return check;
}

function evaluateBudget() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    setText('evaluationTitle', selectedBudget.name + ' - Financial Health Check');
    var c = computeHealthCheck(selectedBudget);

    // Balanced budget: costs plus planned savings fit within take-home pay
    setText('balanceTakeHome', '$' + formatCurrency(c.takeHome));
    setText('balanceCosts', '$' + formatCurrency(c.costs));
    setText('balanceRemainingLabel', c.balance === 'over' ? 'Short Each Month' : 'Left Over');
    setText('balanceRemaining', '$' + formatCurrency(Math.abs(c.remaining)));
    setRuleStatus('balanceRuleStatus', c.balancePass, '✅ PASS', '❌ OVER BUDGET');

    setText('housingCosts', '$' + formatCurrency(c.housing));
    setText('housingLimit', '$' + formatCurrency(c.housingLimit));
    setText('housingPercent', c.housingPercent.toFixed(1) + '%');
    setRuleStatus('housingRuleStatus', c.housingPass, '✅ PASS', '❌ FAIL');

    setText('needsAmount', '$' + formatCurrency(c.needs) + ' (' + c.needsPercent.toFixed(1) + '%)');
    setText('wantsAmount', '$' + formatCurrency(c.wants) + ' (' + c.wantsPercent.toFixed(1) + '%)');
    setText('savingsAmount', '$' + formatCurrency(c.savings) + ' (' + c.savingsPercent.toFixed(1) + '%)');
    setRuleStatus('budgetRuleStatus', c.ruleOf503020Pass, '✅ PASS', '❌ NEEDS WORK');

    showScreen('evaluationScreen');
}

function setRuleStatus(id, pass, passText, failText) {
    var el = document.getElementById(id);
    el.textContent = pass ? passText : failText;
    el.className = 'rule-status ' + (pass ? 'status-pass' : 'status-fail');
}

