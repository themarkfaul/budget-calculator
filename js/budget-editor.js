// Opening, loading, saving and closing budgets in the calculator.

// ── Calculator ──

function editBudget() {
    if (!selectedBudget) { alert('Please select a budget first'); return; }
    currentEditingBudget = selectedBudget;
    isEditMode = true;
    setText('calculatorTitle', 'Editing: ' + selectedBudget.name);
    loadBudgetDataIntoCalculator(selectedBudget);
    isDirty = false;
    showScreen('calculatorScreen');
}

function createNewBudget() {
    var listHtml = '';
    if (budgets.length > 0) {
        listHtml = '<div class="copy-from-header">Or copy from existing budget</div>';
        for (var i = 0; i < budgets.length; i++) {
            var b = budgets[i];
            var s = b.summary || {};
            listHtml += '<div class="new-budget-option" onclick="startFromExisting(' + i + ')">';
            listHtml += '<div class="new-budget-icon">📋</div>';
            listHtml += '<div><div class="new-budget-option-title">' + escapeHtml(b.name) + '</div>';
            listHtml += '<div class="new-budget-option-desc">Take home: ' + escapeHtml(s.takeHome || '$0.00') + ' · Remaining: ' + formatSignedMoney(parseMoney(s.remainingBalance)) + '</div>';
            listHtml += '</div></div>';
        }
    }
    document.getElementById('copyFromList').innerHTML = listHtml;
    showScreen('newBudgetScreen');
}

function startBlankBudget() {
    currentEditingBudget = null;
    isEditMode = false;
    setText('calculatorTitle', 'Create New Budget');
    clearCalculatorFields();
    addIncomeEarner('');
    addChild('');
    isDirty = false;
    showScreen('calculatorScreen');
}

function startFromExisting(index) {
    var source = budgets[index];
    currentEditingBudget = null;
    isEditMode = false;
    setText('calculatorTitle', 'New Budget (from ' + source.name + ')');
    loadBudgetDataIntoCalculator(source);
    isDirty = false;
    showScreen('calculatorScreen');
}

// ── Data Load/Save/Clear ──

function loadBudgetDataIntoCalculator(budget) {
    clearCalculatorFields();
    if (!budget.data) { calculateAll(); return; }

    // Restore income earners — skip repeated or invalid saved slots (left by older versions)
    var earnerCount = budget.data._earnerCount || 1;
    var seen = {};
    for (var i = 0; i < earnerCount; i++) {
        var savedIdx = budget.data['_earnerIdx_' + i];
        if (savedIdx === undefined) savedIdx = i;
        savedIdx = parseInt(savedIdx);
        if (isNaN(savedIdx) || seen[savedIdx]) continue;
        seen[savedIdx] = true;
        var name = budget.data['earnerName_' + savedIdx] || '';
        var newIdx = addIncomeEarner(name);
        for (var f = 0; f < EARNER_FIELDS.length; f++) {
            var savedVal = budget.data[EARNER_FIELDS[f] + '_' + savedIdx];
            if (savedVal !== undefined) {
                var input = document.getElementById(EARNER_FIELDS[f] + '_' + newIdx);
                if (input) setFieldValue(input, savedVal);
            }
        }
        // Budgets saved before Social Security/Medicare were calculated used one all-in
        // tax rate; keep their take-home unchanged until the user unchecks this
        if (budget.data['incomeMode_' + savedIdx] === undefined) {
            document.getElementById('ficaIncluded_' + newIdx).checked = true;
        }
        updateEarnerMode(newIdx);
    }

    // Restore children — skip repeated or invalid saved slots (left by older versions)
    var cFields = ['tuition', 'lunch', 'afterschool'];
    var cCount = budget.data._childCount || 1;
    var cSeen = {};
    for (var i = 0; i < cCount; i++) {
        var savedCIdx = budget.data['_childIdx_' + i];
        if (savedCIdx === undefined) savedCIdx = i;
        savedCIdx = parseInt(savedCIdx);
        if (isNaN(savedCIdx) || cSeen[savedCIdx]) continue;
        cSeen[savedCIdx] = true;
        var cName = budget.data['childName_' + savedCIdx] || '';
        var newCIdx = addChild(cName);
        for (var f = 0; f < cFields.length; f++) {
            var savedVal = budget.data[cFields[f] + '_' + savedCIdx];
            if (savedVal !== undefined) {
                var input = document.getElementById(cFields[f] + '_' + newCIdx);
                if (input) input.value = savedVal;
            }
        }
    }

    // Restore all other fields
    for (var fieldId in budget.data) {
        if (fieldId.charAt(0) === '_') continue;
        if (fieldId.indexOf('earnerName_') === 0) continue;
        if (fieldId.indexOf('childName_') === 0) continue;
        if (EARNER_FIELD_PATTERN.test(fieldId)) continue;
        if (fieldId.match(/^(tuition|lunch|afterschool)_\d+$/)) continue;
        var input = document.getElementById(fieldId);
        if (input) input.value = budget.data[fieldId];
    }

    calculateAll();
    formatAllInputs();
}

function formatAllInputs() {
    var inputs = document.querySelectorAll('#calculatorScreen input[inputmode="decimal"]:not([data-percent]):not([data-plain])');
    for (var i = 0; i < inputs.length; i++) {
        inputs[i].value = formatMoneyValue(inputs[i].value);
    }
}

function clearCalculatorFields() {
    // Remove all earner blocks
    document.getElementById('incomeEarnersContainer').innerHTML = '';
    incomeEarnerCount = 0;

    // Remove all child blocks
    document.getElementById('childrenContainer').innerHTML = '';
    childCount = 0;

    // Clear all other inputs
    var inputs = document.querySelectorAll('#calculatorScreen input[inputmode="decimal"]');
    for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
    var nameInputs = document.querySelectorAll('.earner-name-input');
    for (var i = 0; i < nameInputs.length; i++) nameInputs[i].value = '';
}

function gatherCalculatorData() {
    var data = {};

    // Save earner data with index mapping
    var indices = getEarnerIndices();
    data._earnerCount = indices.length;
    for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        data['_earnerIdx_' + i] = idx;
        var nameInput = document.getElementById('earnerName_' + idx);
        if (nameInput && nameInput.value) data['earnerName_' + idx] = nameInput.value;

        for (var f = 0; f < EARNER_FIELDS.length; f++) {
            var input = document.getElementById(EARNER_FIELDS[f] + '_' + idx);
            var value = input ? getFieldValue(input) : '';
            if (value !== '') data[EARNER_FIELDS[f] + '_' + idx] = value;
        }
    }

    // Save child data with index mapping
    var childIndices = getChildIndices();
    data._childCount = childIndices.length;
    for (var i = 0; i < childIndices.length; i++) {
        var cIdx = childIndices[i];
        data['_childIdx_' + i] = cIdx;
        var cNameInput = document.getElementById('childName_' + cIdx);
        if (cNameInput && cNameInput.value) data['childName_' + cIdx] = cNameInput.value;

        var cFields = ['tuition', 'lunch', 'afterschool'];
        for (var f = 0; f < cFields.length; f++) {
            var cInput = document.getElementById(cFields[f] + '_' + cIdx);
            if (cInput && cInput.value !== '') data[cFields[f] + '_' + cIdx] = cInput.value;
        }
    }

    // Save all other inputs
    var otherInputs = document.querySelectorAll('#calculatorScreen input[inputmode="decimal"]');
    for (var i = 0; i < otherInputs.length; i++) {
        var id = otherInputs[i].id;
        if (EARNER_FIELD_PATTERN.test(id)) continue;
        if (id.match(/^(tuition|lunch|afterschool)_\d+$/)) continue;
        if (otherInputs[i].value !== '') data[id] = otherInputs[i].value;
    }

    return data;
}

function buildSummary() {
    var takeHome = calculateIncome();
    var housing = calculateHousing();
    var transportation = calculateTransportation();
    var education = calculateEducation();
    var utilities = calculateUtilities();
    var spending = calculateSpending();
    var savings = calculateSavings();
    var totalExpenses = housing + transportation + education + utilities + spending + savings;
    var remaining = takeHome - totalExpenses;

    return {
        takeHome: '$' + formatCurrency(takeHome),
        housing: '$' + formatCurrency(housing),
        transportation: '$' + formatCurrency(transportation),
        education: '$' + formatCurrency(education),
        utilities: '$' + formatCurrency(utilities),
        spending: '$' + formatCurrency(spending),
        savings: '$' + formatCurrency(savings),
        leftoverInSavings: false,
        totalExpenses: '$' + formatCurrency(totalExpenses),
        remainingBalance: formatSignedMoney(remaining),
        paycheckRetirement: '$' + formatCurrency(calculatePaycheckRetirement())
    };
}

async function handleSave() {
    var saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        var budgetObj = {
            name: isEditMode && currentEditingBudget ? currentEditingBudget.name : null,
            id: isEditMode && currentEditingBudget ? currentEditingBudget.id : null,
            data: gatherCalculatorData(),
            summary: buildSummary()
        };

        if (!budgetObj.name) {
            var name = prompt('Enter a name for this budget:', 'My Budget');
            if (!name) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; return; }
            budgetObj.name = name;
        }

        var saved = await saveBudgetToDb(budgetObj);
        currentEditingBudget = saved;
        isEditMode = true;
        setText('calculatorTitle', 'Editing: ' + saved.name);
        isDirty = false;
        alert('Budget saved!');
    } catch (e) {
        alert('Error saving: ' + e.message);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save';
}

async function handleSaveAs() {
    var name = prompt('Enter a name for this copy:', 'My Budget Copy');
    if (!name) return;

    var saveAsBtn = document.getElementById('saveAsBtn');
    saveAsBtn.disabled = true;
    saveAsBtn.textContent = 'Saving...';

    try {
        var budgetObj = {
            name: name,
            data: gatherCalculatorData(),
            summary: buildSummary()
        };
        var saved = await saveBudgetToDb(budgetObj);
        currentEditingBudget = saved;
        isEditMode = true;
        setText('calculatorTitle', 'Editing: ' + saved.name);
        isDirty = false;
        alert('Budget saved as "' + name + '"!');
    } catch (e) {
        alert('Error saving: ' + e.message);
    }

    saveAsBtn.disabled = false;
    saveAsBtn.textContent = '📄 Save As';
}

function closeBudget() {
    if (!isDirty || confirm('Close without saving? Unsaved changes will be lost.')) {
        goHome();
    }
}

