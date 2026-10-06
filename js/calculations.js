// Housing, transportation, utilities, spending and savings math, plus the dashboard totals.

// ── Calculations ──

function calculateHousing() {
    var houseValue = val('houseValue');
    var mortgageRate = val('mortgageRate');
    var mortgageDown = val('mortgageDownPayment');
    var mortgageTerm = val('mortgageTerm');
    var homeInsurance = val('homeInsurance');
    var propertyValue = val('propertyValue');
    var stateTaxRate = val('stateTaxRate');
    var countyTaxRate = val('countyTaxRate');
    var localTaxRate = val('localTaxRate');
    var waste = val('waste');

    var mortgagePayment = loanPayment(Math.max(0, houseValue - mortgageDown), mortgageRate, mortgageTerm);

    // Compare the entered rate with Freddie Mac's current average for this term (30-year if blank)
    var rateCheckEl = document.getElementById('housingRateCheck');
    var check = checkRateAgainstMarket(mortgageRate, mortgageTerm || 30);
    rateCheckEl.className = 'rate-check' + (check ? ' rate-check-' + check.level : '');
    rateCheckEl.textContent = check ? check.text : '';

    var propertyTaxes = propertyValue * (stateTaxRate + countyTaxRate + localTaxRate) / 100;
    var totalHousing = mortgagePayment + (homeInsurance / 12) + (propertyTaxes / 12) + (waste / 12);

    setText('mortgagePaymentResult', formatCurrency(mortgagePayment));
    setText('housingResult', formatCurrency(totalHousing));
    return totalHousing;
}

function calculateTransportation() {
    var carPrice = val('carPrice');
    var rate = val('carRate');
    var downPayment = val('downPayment');
    var term = val('loanTerm');
    var carInsurance = val('carInsuranceAnnual');
    var carTaxes = val('carTaxes');

    var carPayment = loanPayment(Math.max(0, carPrice - downPayment), rate, term);

    var totalTransportation = carPayment + (carInsurance / 12) + (carTaxes / 12);
    setText('carPaymentResult', formatCurrency(carPayment));
    setText('transportationResult', formatCurrency(totalTransportation));
    return totalTransportation;
}

function calculateUtilities() {
    var ids = ['internet', 'phone', 'tv', 'gas', 'electric', 'water'];
    var total = 0;
    for (var i = 0; i < ids.length; i++) total += val(ids[i]);
    setText('utilitiesResult', formatCurrency(total));
    return total;
}

function calculateSpending() {
    var ids = ['eatingOut', 'entertainment', 'shopping', 'hobbies', 'tools', 'miscSpending'];
    var wants = 0;
    for (var i = 0; i < ids.length; i++) wants += val(ids[i]);
    var essentials = calculateEssentialSpending(val);
    setText('essentialSpendingResult', formatCurrency(essentials));
    setText('wantsSpendingResult', formatCurrency(wants));
    setText('spendingResult', formatCurrency(essentials + wants));
    return essentials + wants;
}

// Spending-tab items that are needs, not wants; getValue reads a field by id
var ESSENTIAL_SPENDING_IDS = ['groceries', 'gasoline'];

function calculateEssentialSpending(getValue) {
    var total = 0;
    for (var i = 0; i < ESSENTIAL_SPENDING_IDS.length; i++) total += getValue(ESSENTIAL_SPENDING_IDS[i]);
    return total;
}

function calculateSavings() {
    var ids = ['emergencyFund', 'retirement401k', 'iraContribution', 'investmentAccount', 'collegeFund', 'cashSavings'];
    var total = 0;
    for (var i = 0; i < ids.length; i++) total += val(ids[i]);
    setText('savingsResult', formatCurrency(total));
    return total;
}

function calculateAll() {
    var takeHome = calculateIncome();
    var housing = calculateHousing();
    var transportation = calculateTransportation();
    var education = calculateEducation();
    var utilities = calculateUtilities();
    var spending = calculateSpending();
    var savings = calculateSavings();
    calculatePaycheckRetirement();

    var totalExpenses = housing + transportation + education + utilities + spending + savings;
    var remaining = takeHome - totalExpenses;

    setText('dashTakeHome', '$' + formatCurrency(takeHome));
    setText('dashHousing', '$' + formatCurrency(housing));
    setText('dashTransportation', '$' + formatCurrency(transportation));
    setText('dashEducation', '$' + formatCurrency(education));
    setText('dashUtilities', '$' + formatCurrency(utilities));
    setText('dashSpending', '$' + formatCurrency(spending));
    setText('dashSavings', '$' + formatCurrency(savings));

    renderBalance(takeHome, remaining, [
        ['Housing', housing], ['Transportation', transportation], ['Education', education],
        ['Utilities', utilities], ['Spending', spending]
    ], savings);
}

// Remaining card and the message under the dashboard: left over, over budget, or even
function renderBalance(takeHome, remaining, costs, savings) {
    var status = balanceStatus(remaining);
    var labels = { left: 'Left Over', over: 'Over Budget', even: 'Remaining' };
    document.getElementById('dashRemainingCard').className = 'summary-item balance-' + status;
    setText('dashRemainingLabel', labels[status]);
    setText('dashRemaining', formatSignedMoney(remaining));

    renderLeftoverPlan(remaining);

    var message = document.getElementById('dashBalanceMessage');
    var totalCosts = takeHome - remaining;
    if (takeHome <= 0 && totalCosts <= 0) {
        message.style.display = 'none';
        return;
    }
    message.style.display = 'block';
    message.className = 'balance-message balance-message-' + status;

    if (status === 'over') {
        var biggest = costs.filter(function (c) { return c[1] > 0; })
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 3)
            .map(function (c) { return c[0] + ' ($' + formatCurrency(c[1]) + ')'; });
        var text = "You're spending $" + formatCurrency(-remaining) + ' more than you bring home each month.';
        if (biggest.length) text += ' Your biggest costs are ' + biggest.join(', ') + '.';
        if (savings > 0) text += ' Planned savings are $' + formatCurrency(savings) + '.';
        message.textContent = text;
    } else if (status === 'left') {
        var split = leftoverAllocation(remaining);
        message.textContent = split.assigned
            ? 'Your $' + formatCurrency(remaining) + ' left over each month is planned: $' +
                formatCurrency(split.toSavings) + ' to savings and $' + formatCurrency(split.toSpending) + ' to spending.'
            : 'You have $' + formatCurrency(remaining) +
                " a month that isn't assigned yet. Use the split below to plan it for savings or spending.";
    } else {
        message.textContent = 'Every dollar is assigned: your costs and savings match your take-home pay.';
    }
}


// ── Left-over split ──

// How this month's left-over money is planned. Nothing is assigned until the user turns the
// split on; when over budget there's nothing to split, but the chosen percent is kept.
function leftoverAllocation(remaining) {
    var on = document.getElementById('leftoverSplitOn').checked;
    if (!on || remaining <= 0) return { assigned: false, toSavings: 0, toSpending: 0, percent: 0 };
    var percent = parseInt(document.getElementById('leftoverSavingsPercent').value, 10);
    var toSavings = Math.round(remaining * percent) / 100;
    var toSpending = Math.max(0, Math.round((remaining - toSavings) * 100) / 100);
    return { assigned: true, toSavings: toSavings, toSpending: toSpending, percent: percent };
}

function renderLeftoverPlan(remaining) {
    var plan = document.getElementById('leftoverPlan');
    if (balanceStatus(remaining) !== 'left') {
        plan.style.display = 'none';
        return;
    }
    plan.style.display = 'block';
    var on = document.getElementById('leftoverSplitOn').checked;
    document.getElementById('leftoverSplitControls').style.display = on ? 'block' : 'none';
    if (!on) return;

    var split = leftoverAllocation(remaining);
    setText('leftoverToSavings', '$' + formatCurrency(split.toSavings) + ' (' + split.percent + '%)');
    setText('leftoverToSpending', '$' + formatCurrency(split.toSpending) + ' (' + (100 - split.percent) + '%)');
}

function onLeftoverSplitToggle() {
    isDirty = true;
    calculateAll();
}
