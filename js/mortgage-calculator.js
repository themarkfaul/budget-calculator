// Standalone mortgage calculator page (mortgage.html).

var rateIsAutoFilled = true;

function selectedTerm() {
    return parseInt(document.getElementById('mcTerm').value);
}

function fillMarketRate() {
    var market = marketRateFor(selectedTerm());
    if (!market) return;
    document.getElementById('mcRate').value = market.rate.toFixed(2);
    rateIsAutoFilled = true;
    calculateMortgage();
}

function renderMarketRate() {
    var el = document.getElementById('mcMarket');
    var market = marketRateFor(selectedTerm());
    if (!market) {
        el.innerHTML = 'Current average rates are unavailable right now.';
        return;
    }
    var html = '<div class="market-rate-value">' + market.rate.toFixed(2) + '%</div>' +
        '<div class="market-rate-label">Current ' + escapeHtml(market.label) + '</div>' +
        '<div class="market-rate-source">Freddie Mac weekly survey, week of ' + marketRatesDate() + '. ' +
        '<a href="' + MORTGAGE_RATES.sourceUrl + '" target="_blank" rel="noopener">Source</a></div>';
    if (marketRatesAreStale()) {
        html += '<div class="market-rate-stale">These averages may be out of date.</div>';
    }
    html += '<button class="btn btn-secondary market-rate-btn" onclick="fillMarketRate()">Use this rate</button>';
    el.innerHTML = html;
}

function onTermChange() {
    renderMarketRate();
    if (rateIsAutoFilled) fillMarketRate();
    else calculateMortgage();
}

function calculateMortgage() {
    var price = val('mcPrice');
    var down = val('mcDown');
    var rate = val('mcRate');
    var term = selectedTerm();
    var loan = Math.max(0, price - down);

    // Down payment as a share of price
    var downPercent = price > 0 ? (down / price) * 100 : 0;
    setText('mcDownPercent', price > 0 && down > 0 ? downPercent.toFixed(1) + '% of the price' : '');

    // Rate check against the market
    var checkEl = document.getElementById('mcRateCheck');
    var check = checkRateAgainstMarket(rate, term);
    checkEl.className = 'rate-check' + (check ? ' rate-check-' + check.level : '');
    checkEl.textContent = check ? check.text : '';

    var payment = loanPayment(loan, rate, term);
    var extras = val('mcTax') / 12 + val('mcInsurance') / 12 + val('mcHoa');
    var totalPaid = payment * term * 12;

    setText('mcPayment', '$' + formatCurrency(payment));
    setText('mcLoan', '$' + formatCurrency(loan));
    setText('mcInterest', '$' + formatCurrency(Math.max(0, totalPaid - loan)));
    setText('mcTotalPaid', '$' + formatCurrency(totalPaid));
    setText('mcTermLabel', term + ' years');

    var totalRow = document.getElementById('mcTotalRow');
    totalRow.style.display = extras > 0 ? 'block' : 'none';
    setText('mcTotal', '$' + formatCurrency(payment + extras));

    document.getElementById('mcPmiNote').style.display = loan > 0 && downPercent < 20 ? 'block' : 'none';
}

// Hands the numbers to the budget through localStorage (see js/mortgage-handoff.js).
// Opened from a budget's Housing tab: close this tab so the user lands back on the budget,
// where a banner offers to apply them. Otherwise go to the app's home screen.
function useInBudget() {
    var message = document.getElementById('mcUseMessage');
    var pending = {
        price: val('mcPrice'),
        down: val('mcDown'),
        rate: val('mcRate'),
        term: selectedTerm(),
        insurance: val('mcInsurance'),
        savedAt: Date.now()
    };
    if (!(pending.price > 0) || !(pending.rate > 0)) {
        message.className = 'mc-use-message rate-check-warn';
        message.textContent = 'Enter a home price and interest rate first.';
        return;
    }
    try {
        localStorage.setItem(PENDING_MORTGAGE_KEY, JSON.stringify(pending));
    } catch (e) {
        message.className = 'mc-use-message rate-check-warn';
        message.textContent = "Your browser blocked saving these numbers. Copy them into the budget's Housing tab instead.";
        return;
    }

    if (window.opener && !window.opener.closed) {
        message.className = 'mc-use-message rate-check-ok';
        message.textContent = 'Sent. Switch back to your budget tab and tap Apply.';
        window.close();
    } else {
        window.location.href = '/app.html';
    }
}

(function () {
    document.getElementById('mcTerm').addEventListener('change', onTermChange);
    document.getElementById('mcRate').addEventListener('input', function () { rateIsAutoFilled = false; });
    var inputs = document.querySelectorAll('input[inputmode="decimal"]');
    for (var i = 0; i < inputs.length; i++) inputs[i].addEventListener('input', calculateMortgage);
    setupMoneyFormatting();
    renderMarketRate();
    fillMarketRate();
})();
