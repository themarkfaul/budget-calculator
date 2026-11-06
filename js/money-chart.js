// Dashboard donut chart: where each month's take-home pay goes. Plain SVG, no libraries.

var MONEY_CHART_COLORS = {
    'Housing': '#667eea', 'Transportation': '#f97316', 'Education': '#0ea5e9', 'Utilities': '#eab308',
    'Spending': '#ec4899', 'Other': '#8b5cf6', 'Savings': '#10b981', 'Left Over': '#94d3a2'
};

// Slices as shares of take-home pay (or of total costs when over budget, since they exceed it)
function moneyChartSlices(categories, takeHome, remaining) {
    var slices = categories.filter(function (c) { return c[1] > 0; })
        .map(function (c) { return { name: c[0], amount: c[1] }; });
    if (remaining > 0) slices.push({ name: 'Left Over', amount: remaining });
    var total = slices.reduce(function (sum, s) { return sum + s.amount; }, 0);
    var over = remaining < 0;
    var base = over ? total : takeHome;
    slices.forEach(function (s) { s.percent = base > 0 ? (s.amount / base) * 100 : 0; });
    return { slices: slices, total: total, over: over };
}

function renderMoneyChart(categories, takeHome, remaining) {
    var el = document.getElementById('moneyChart');
    var chart = moneyChartSlices(categories, takeHome, remaining);
    if (chart.total <= 0) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';

    // Circle with circumference 100, so each slice's dash length is its percent
    var svg = '<svg viewBox="0 0 42 42" class="money-chart-svg" role="img" aria-label="Where your money goes">' +
        '<circle cx="21" cy="21" r="15.915" fill="none" stroke="#e9ecef" stroke-width="6"></circle>';
    var offset = 25;   // start at 12 o'clock
    for (var i = 0; i < chart.slices.length; i++) {
        var s = chart.slices[i];
        svg += '<circle cx="21" cy="21" r="15.915" fill="none" stroke="' + MONEY_CHART_COLORS[s.name] +
            '" stroke-width="6" stroke-dasharray="' + s.percent.toFixed(3) + ' ' + (100 - s.percent).toFixed(3) +
            '" stroke-dashoffset="' + offset.toFixed(3) + '"><title>' + s.name + ': ' + s.percent.toFixed(1) + '%</title></circle>';
        offset -= s.percent;
    }
    var centerLabel = chart.over ? 'Over by' : 'Take-home';
    var centerValue = chart.over ? '$' + formatCurrency(-remaining) : '$' + formatCurrency(takeHome);
    svg += '<text x="21" y="20" class="money-chart-center-label">' + centerLabel + '</text>' +
        '<text x="21" y="24.5" class="money-chart-center-value">' + centerValue + '</text></svg>';

    var legend = '';
    for (var j = 0; j < chart.slices.length; j++) {
        var item = chart.slices[j];
        legend += '<div class="money-chart-row"><span class="money-chart-swatch" style="background:' +
            MONEY_CHART_COLORS[item.name] + '"></span><span class="money-chart-name">' + item.name +
            '</span><span class="money-chart-amount">$' + formatCurrency(item.amount) +
            '</span><span class="money-chart-percent">' + item.percent.toFixed(0) + '%</span></div>';
    }

    el.innerHTML = '<h3 class="money-chart-title">Where your money goes</h3>' +
        '<div class="money-chart-body">' + svg + '<div class="money-chart-legend">' + legend + '</div></div>' +
        (chart.over ? '<p class="money-chart-note">Percentages are shares of total costs, which are more than take-home pay.</p>' : '');
}
