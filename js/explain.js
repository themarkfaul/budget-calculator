// "Where does this number come from?" Calculated values carry a data-explain attribute with
// the lines of their working; hovering (or tapping, on phones) shows them in a small popup.

function money(v) {
    return '$' + formatCurrency(v);
}

// Lines like "Mortgage payment: $1,438.92" for a list of { name, monthly }
function itemLines(items) {
    return items.map(function (b) { return b.name + ': ' + money(b.monthly); });
}

// Attaches an explanation to an element (by id or element). lines: array of strings.
function setExplain(target, lines) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    if (!lines || !lines.length) {
        el.removeAttribute('data-explain');
        el.removeAttribute('tabindex');
        return;
    }
    el.setAttribute('data-explain', lines.join('\n'));
    el.setAttribute('tabindex', '0');
}

// Same as setExplain, as an HTML attribute string for markup built in code
function explainAttr(lines) {
    if (!lines || !lines.length) return '';
    return ' tabindex="0" data-explain="' + escapeHtml(lines.join('\n')).replace(/"/g, '&quot;') + '"';
}

// ── Dashboard ──

function explainDashboard(takeHome, totals) {
    var bills = escrowBillList();
    var group = function (name) { return bills.filter(function (b) { return b.group === name; }); };
    var withTotal = function (items, total, note) {
        var lines = itemLines(items);
        if (!lines.length) return ['Nothing entered on this tab yet.'];
        if (note) lines.push(note);
        lines.push('Total: ' + money(total) + ' a month');
        return lines;
    };

    var earners = getEarnerIndices().map(function (idx, i) {
        var name = document.getElementById('earnerName_' + idx).value.trim() || 'Person ' + (i + 1);
        return name + ': ' + money(computeEarner(idx).monthlyTakeHome);
    });
    earners = earners.concat(itemLines(otherIncomeLines()));
    setExplain('dashTakeHome', earners.length
        ? earners.concat(['Total: ' + money(takeHome) + ' a month (pay after taxes and paycheck deductions)'])
        : ['Add income on the Income tab.']);
    setExplain('dashHousing', withTotal(group('Housing'), totals.housing, 'Yearly bills are divided by 12.'));
    setExplain('dashTransportation', withTotal(group('Transportation'), totals.transportation, 'Yearly bills are divided by 12.'));
    setExplain('dashEducation', withTotal(group('Education'), totals.education, 'Yearly costs are divided by 12.'));
    setExplain('dashUtilities', withTotal(group('Utilities'), totals.utilities));
    setExplain('dashSpending', withTotal(group('Spending'), totals.spending));
    setExplain('dashOther', withTotal(group('Other'), totals.other));
    setExplain('dashSavings', withTotal(group('Savings'), totals.savings));
    setExplain('dashRemaining', [
        'Take-home: ' + money(takeHome),
        '− Costs: ' + money(totals.costs),
        '− Savings: ' + money(totals.savings),
        '= ' + formatSignedMoney(takeHome - totals.costs - totals.savings) + ' a month'
    ]);
}

// ── Popup ──

function explainTip() {
    var tip = document.getElementById('explainTip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'explainTip';
        tip.className = 'explain-tip';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
    }
    return tip;
}

function showExplain(el) {
    var tip = explainTip();
    tip.textContent = el.getAttribute('data-explain');
    tip.style.display = 'block';
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    var top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    el.setAttribute('aria-describedby', 'explainTip');
}

function hideExplain() {
    var tip = document.getElementById('explainTip');
    if (tip) tip.style.display = 'none';
}

function explainTarget(e) {
    return e.target && e.target.closest ? e.target.closest('[data-explain]') : null;
}

document.addEventListener('mouseover', function (e) { var el = explainTarget(e); if (el) showExplain(el); });
document.addEventListener('mouseout', function (e) { if (explainTarget(e)) hideExplain(); });
document.addEventListener('focusin', function (e) { var el = explainTarget(e); if (el) showExplain(el); });
document.addEventListener('focusout', function (e) { if (explainTarget(e)) hideExplain(); });
window.addEventListener('scroll', hideExplain, true);
