// Budget side of "Use in my budget" on the mortgage calculator: shows a banner with the
// calculator's numbers and fills in the Housing tab when the user taps Apply.

// Opens the calculator. In a browser it opens a new tab so unsaved budget changes stay put.
// Installed home-screen apps (notably on iPhone) don't share storage with a browser tab,
// so there it opens in the same window after a warning about unsaved changes.
function openMortgageCalculator() {
    var installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (installed) {
        if (isDirty && !confirm('You have unsaved changes to this budget. Leave without saving?')) return;
        window.location.href = '/mortgage.html';
    } else {
        window.open('/mortgage.html', '_blank');
    }
}

function describePendingMortgage(p) {
    var parts = ['$' + formatMoneyValue(p.price) + ' home', '$' + (formatMoneyValue(p.down) || '0') + ' down',
        p.rate + '% for ' + p.term + ' years'];
    if (p.insurance > 0) parts.push('$' + formatMoneyValue(p.insurance) + '/yr insurance');
    return parts.join(', ');
}

function refreshMortgageHandoff() {
    var pending = readPendingMortgage();
    var onCalculator = document.getElementById('calculatorScreen').classList.contains('active');
    var onHome = document.getElementById('homeScreen').classList.contains('active');

    var banner = document.getElementById('mortgageHandoff');
    if (pending && onCalculator) {
        setText('mortgageHandoffSummary', describePendingMortgage(pending));
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
    document.getElementById('mortgageHandoffHome').style.display = pending && onHome ? 'block' : 'none';
}

function applyPendingMortgage() {
    var p = readPendingMortgage();
    if (!p) { refreshMortgageHandoff(); return; }

    var values = { houseValue: p.price, mortgageDownPayment: p.down, mortgageRate: p.rate, mortgageTerm: p.term };
    if (p.insurance > 0) values.homeInsurance = p.insurance;
    // Property tax is worked out from this value and the tax rates, so start it at the price if blank
    if (!val('propertyValue')) values.propertyValue = p.price;
    for (var id in values) document.getElementById(id).value = String(values[id]);

    clearPendingMortgage();
    isDirty = true;
    calculateAll();
    formatAllInputs();
    refreshMortgageHandoff();

    // Show the Housing tab so the user sees what changed
    var housingTabButton = document.querySelector('#calculatorScreen .tab[onclick*="housingTab"]');
    if (housingTabButton) housingTabButton.click();
}

function dismissPendingMortgage() {
    clearPendingMortgage();
    refreshMortgageHandoff();
}

// The calculator in another tab writes to localStorage; react as soon as it does
window.addEventListener('storage', function (e) {
    if (e.key === PENDING_MORTGAGE_KEY) refreshMortgageHandoff();
});
