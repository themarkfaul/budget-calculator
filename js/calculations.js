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
    var effectiveSavings = savings + (remaining > 0 ? remaining : 0);
    setText('dashSavings', '$' + formatCurrency(effectiveSavings));

    var remainEl = document.getElementById('dashRemaining');
    if (remainEl) {
        remainEl.textContent = '$' + formatCurrency(remaining);
        remainEl.className = 'amount ' + (remaining >= 0 ? 'result-positive' : 'result-negative');
    }
}

