// Compares mortgage rates with Freddie Mac's current weekly averages (js/mortgage-rates.js).
// Freddie Mac only publishes 30- and 15-year averages, so 10- and 20-year terms get a
// clearly labelled guide instead.

function roundRate(rate) {
    return Math.round(rate * 100) / 100;
}

// The current average rate for a loan term in years, with a label saying where it comes from
function marketRateFor(term) {
    if (typeof MORTGAGE_RATES === 'undefined') return null;
    var r30 = MORTGAGE_RATES.rate30, r15 = MORTGAGE_RATES.rate15;
    if (term <= 12) {
        return { rate: r15, termLabel: '10-year', estimate: true,
            label: "15-year average shown as a guide (Freddie Mac doesn't track 10-year loans, which are usually priced close to 15-year)" };
    }
    if (term <= 17) return { rate: r15, termLabel: '15-year', estimate: false, label: '15-year average' };
    if (term <= 25) {
        return { rate: roundRate((r15 + r30) / 2), termLabel: '20-year', estimate: true,
            label: "estimate halfway between the 15- and 30-year averages (Freddie Mac doesn't track 20-year loans)" };
    }
    return { rate: r30, termLabel: '30-year', estimate: false, label: '30-year average' };
}

function marketRatesDate() {
    var d = new Date(MORTGAGE_RATES.asOf + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function marketRatesAreStale() {
    var ageDays = (Date.now() - new Date(MORTGAGE_RATES.asOf + 'T00:00:00').getTime()) / 86400000;
    return ageDays > 14;
}

// How a rate compares with the market: { level: 'ok' | 'info' | 'warn', text }
function checkRateAgainstMarket(userRate, term) {
    var market = marketRateFor(term);
    if (!market || !(userRate > 0)) return null;
    var diff = roundRate(userRate - market.rate);
    var avg = market.rate.toFixed(2) + '%';
    if (Math.abs(diff) < 0.125) {
        return { level: 'ok', text: 'In line with the current ' + market.termLabel + ' average of ' + avg + '.' };
    }
    var direction = diff > 0 ? 'above' : 'below';
    var points = Math.abs(diff).toFixed(2) + (Math.abs(diff) === 1 ? ' point ' : ' points ');
    if (Math.abs(diff) > 1.5) {
        return { level: 'warn', text: points + direction + ' the current ' + market.termLabel + ' average of ' + avg +
            '. That\'s a big difference, so double-check the rate.' };
    }
    return { level: 'info', text: points + direction + ' the current ' + market.termLabel + ' average of ' + avg + '.' };
}
