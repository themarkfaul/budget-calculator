// Actual vs. Planned: upload a bank or card CSV and compare what was really spent each month
// with the budget, line by line. Also spots bills that went up (car insurance, internet, ...)
// and new recurring charges that aren't in the budget, and offers to update the budget.
//
// The CSV is read in the browser (parsing and merchant rules come from csv-import.js). Only these
// are saved, with the budget, as data.actual:
//   map:       { MERCHANT: budget line key | 'unbudgeted' | 'skip' }  (how each company is sorted)
//   months:    { 'YYYY-MM': { from, to, m: { MERCHANT: [total, count] }, seen: [fingerprints] } }
//              from/to: first and last day of the month the uploaded files covered;
//              seen: short one-way fingerprints of charges already added, so uploading the
//              same file twice doesn't count anything twice
//   dismissed: alert ids the user has dealt with
// No transaction descriptions, dates or account details are kept.

var ACTUAL_MAX_MONTHS = 24;
var ACTUAL_GROUP_ORDER = ['Housing', 'Transportation', 'Education', 'Utilities', 'Other', 'Spending'];
var ACTUAL_NONE = 'unbudgeted';
var ACTUAL_SKIP = 'skip';

var actualData = emptyActualData();
var actualMonth = '';

function emptyActualData() {
    return { map: {}, months: {}, dismissed: [] };
}

function loadActualData(saved) {
    actualData = emptyActualData();
    if (saved && typeof saved === 'object') {
        if (saved.map && typeof saved.map === 'object') actualData.map = JSON.parse(JSON.stringify(saved.map));
        if (saved.months && typeof saved.months === 'object') actualData.months = JSON.parse(JSON.stringify(saved.months));
        if (Array.isArray(saved.dismissed)) actualData.dismissed = saved.dismissed.slice();
    }
    actualMonth = actualMonthKeys().slice(-1)[0] || '';
    renderActualBanner();
}

// Saved only once something has been uploaded
function gatherActualData() {
    return actualMonthKeys().length ? JSON.parse(JSON.stringify(actualData)) : undefined;
}

function actualMonthKeys() {
    return Object.keys(actualData.months).sort();
}

// ── Budget lines ──

// Every budget line a charge can count toward (not savings), plus the standard spending and
// utility lines even when nothing is budgeted for them yet
function actualLines() {
    var lines = escrowBillList().filter(function (b) { return !b.savings; });
    var have = {};
    lines.forEach(function (l) { have[l.key] = true; });
    IMPORT_CATEGORIES.forEach(function (g) {
        g.options.forEach(function (o) {
            if (o[0] === ACTUAL_SKIP || have[o[0]]) return;
            lines.push({ key: o[0], group: g.group, name: fieldLabel(o[0]), monthly: 0, schedule: 'monthly', month: 1, escrow: false, lump: false });
            have[o[0]] = true;
        });
    });
    return lines;
}

function actualLineMap() {
    var map = {};
    actualLines().forEach(function (l) { map[l.key] = l; });
    return map;
}

// What a line is expected to cost in a given month (lump bills only in their due months)
function plannedInMonth(line, ym) {
    return billDueIn(line, parseInt(ym.slice(5), 10));
}

// One payment of a bill, e.g. a twice-a-year car insurance premium
function plannedPayment(line) {
    return line.monthly * 12 / paymentsPerYear(line.schedule);
}

// The budget field behind a line, and whether that field is a yearly amount.
// Calculated lines (mortgage, property tax, car loan) have none.
function budgetFieldFor(key) {
    var fixed = {
        rent: ['monthlyRent', false], rentersInsurance: ['rentersInsurance', true], homeInsurance: ['homeInsurance', true],
        waste: ['waste', true], carInsurance: ['carInsuranceAnnual', true], carTaxes: ['carTaxes', true]
    };
    if (fixed[key]) return { id: fixed[key][0], annual: fixed[key][1] };
    if (['internet', 'phone', 'tv', 'gas', 'electric', 'water', 'groceries', 'gasoline', 'eatingOut', 'entertainment',
        'shopping', 'hobbies', 'tools', 'miscSpending'].indexOf(key) >= 0) return { id: key, annual: false };
    if (key.indexOf('other:') === 0) {
        var name = key.slice(6);
        var others = getOtherExpenseIndices();
        for (var i = 0; i < others.length; i++) {
            if ((document.getElementById('otherName_' + others[i]).value.trim() || 'Other expense') === name) {
                return { id: 'otherAmount_' + others[i], annual: false };
            }
        }
        return null;
    }
    var child = key.match(/^child(\d+)_(tuition|lunch|afterschool)$/);
    if (child) {
        var idx = getChildIndices()[parseInt(child[1], 10)];
        return idx === undefined ? null : { id: child[2] + '_' + idx, annual: true };
    }
    return null;
}

// ── Sorting charges into budget lines ──

// Checked before the general CSV rules, so bills paid by autopay aren't skipped as "payments"
var ACTUAL_TRANSFER_RULE = compileImportRules([[ACTUAL_SKIP, ['transfer', 'xfer', 'zelle', 'venmo', 'cash app',
    'thank you', 'payroll', 'direct dep', 'atm', 'withdrawal']]])[0];
var ACTUAL_BILL_RULES = compileImportRules([
    ['carInsurance', ['geico', 'progressive', 'state farm', 'allstate', 'liberty mutual', 'usaa', 'nationwide',
        'farmers ins', 'travelers', 'erie ins', 'american family', 'the general', 'root ins', 'auto insurance', 'car insurance']],
    ['homeInsurance', ['homeowners', 'home insurance', 'lemonade']],
    ['mortgage', ['mortgage', 'mtg pmt', 'home loan', 'rocket mortgage', 'mr cooper', 'loan servicing']],
    ['rent', ['rent', 'apartments', 'property management', 'property mgmt']]
]).concat(IMPORT_RULES.filter(function (r) { return ['tv', 'internet', 'phone', 'electric', 'gas', 'water'].indexOf(r[0]) >= 0; }));

// Best guess for a charge's budget line; anything without a matching line is "not in my budget"
function guessActualLine(description, bankCategory, lineMap) {
    var text = cleanDescription(description).toLowerCase().replace(/['’]/g, '');
    if (ACTUAL_TRANSFER_RULE[1].test(text)) return ACTUAL_SKIP;
    // A line the user named, e.g. an "Other" expense called "Netflix" or "Planet Fitness"
    for (var key in lineMap) {
        if (key.indexOf('other:') !== 0) continue;
        var name = lineMap[key].name.toLowerCase().replace(/['’]/g, '').trim();
        if (name.length >= 3 && text.indexOf(name) >= 0) return key;
    }
    var found = null;
    for (var i = 0; i < ACTUAL_BILL_RULES.length && !found; i++) {
        if (ACTUAL_BILL_RULES[i][1].test(text)) found = ACTUAL_BILL_RULES[i][0];
    }
    if (!found) found = categorize(description, bankCategory || '', {}, '');
    if (found === ACTUAL_SKIP) return ACTUAL_SKIP;
    if (found === 'mortgage' && !lineMap.mortgage && lineMap.rent) found = 'rent';
    return lineMap[found] ? found : ACTUAL_NONE;
}

// ── Upload ──

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function monthKeyOf(date) { return date.getFullYear() + '-' + pad2(date.getMonth() + 1); }
function daysInMonth(ym) { return new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5), 10), 0).getDate(); }
function roundCents(n) { return Math.round(n * 100) / 100; }

// Short one-way fingerprint (FNV-1a), so the saved data can't be read back into transactions
function chargeFingerprint(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
}

// Adds a CSV's charges to the months they fall in. Returns what happened, for the message.
function addActualCsv(text) {
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('That file has no transactions in it.');
    var result = readTransactions(rows, detectColumns(rows));
    if (!result.purchases.length) throw new Error('No purchases were found in that file.');

    var lineMap = actualLineMap();
    var seen = {}, repeats = {};
    Object.keys(actualData.months).forEach(function (ym) {
        seen[ym] = {};
        (actualData.months[ym].seen || []).forEach(function (f) { seen[ym][f] = true; });
    });
    var minDate = result.purchases[0].date, maxDate = minDate, added = 0, duplicates = 0;

    result.purchases.forEach(function (t) {
        if (t.date < minDate) minDate = t.date;
        if (t.date > maxDate) maxDate = t.date;
        var ym = monthKeyOf(t.date);
        var base = ym + '-' + pad2(t.date.getDate()) + '|' + t.amount.toFixed(2) + '|' + t.description;
        repeats[base] = (repeats[base] || 0) + 1;   // two identical charges the same day are both real
        var fp = chargeFingerprint(base + '|' + repeats[base]);
        var month = actualData.months[ym] || (actualData.months[ym] = { from: 31, to: 0, m: {}, seen: [] });
        seen[ym] = seen[ym] || {};
        if (seen[ym][fp]) { duplicates++; return; }
        seen[ym][fp] = true;
        month.seen.push(fp);
        var merchant = merchantKey(t.description);
        var entry = month.m[merchant] || (month.m[merchant] = [0, 0]);
        entry[0] = roundCents(entry[0] + t.amount);
        entry[1]++;
        if (!actualData.map[merchant]) actualData.map[merchant] = guessActualLine(t.description, t.bankCategory, lineMap);
        added++;
    });

    // Which days of each month the file covered, to mark partial months
    for (var d = new Date(minDate.getFullYear(), minDate.getMonth(), 1); d <= maxDate; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        var key = monthKeyOf(d);
        var m = actualData.months[key] || (actualData.months[key] = { from: 31, to: 0, m: {}, seen: [] });
        m.from = Math.min(m.from, key === monthKeyOf(minDate) ? minDate.getDate() : 1);
        m.to = Math.max(m.to, key === monthKeyOf(maxDate) ? maxDate.getDate() : daysInMonth(key));
    }
    var keys = actualMonthKeys();
    while (keys.length > ACTUAL_MAX_MONTHS) delete actualData.months[keys.shift()];
    actualMonth = monthKeyOf(maxDate);
    return { added: added, duplicates: duplicates, credits: result.credits, from: minDate, to: maxDate };
}

function chooseActualFile() {
    var input = document.getElementById('actualFileInput');
    input.value = '';
    input.click();
}

function handleActualFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
        try {
            var r = addActualCsv(String(reader.result));
            isDirty = true;
            renderActual();
            var msg = r.added ? 'Added ' + r.added + ' charge' + (r.added === 1 ? '' : 's') + ' from ' + r.from.toLocaleDateString() + ' to ' + r.to.toLocaleDateString() + '.'
                : 'Nothing new: every charge in that file was already added.';
            if (r.added && r.duplicates) msg += ' ' + r.duplicates + ' were already added.';
            showToast(msg + (r.added ? ' Save the budget to keep them.' : ''), r.added ? 'success' : 'info');
        } catch (e) {
            showToast(e.message, 'error');
        }
    };
    reader.onerror = function () { showToast("That file couldn't be read.", 'error'); };
    reader.readAsText(file);
}

// ── Comparison ──

function monthLabel(ym) {
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names[parseInt(ym.slice(5), 10) - 1] + ' ' + ym.slice(0, 4);
}

function isPartialMonth(ym) {
    var m = actualData.months[ym];
    return !m || m.from > 3 || m.to < daysInMonth(ym) - 3;
}

// Total charged to a budget line in a month
function lineActual(ym, key) {
    var month = actualData.months[ym];
    if (!month) return 0;
    var total = 0;
    for (var merchant in month.m) if (actualData.map[merchant] === key) total += month.m[merchant][0];
    return roundCents(total);
}

// { rows: [{ line, planned, actual, merchants }], unbudgeted, plannedTotal, actualTotal }
function actualComparison(ym) {
    var lines = actualLines();
    var byKey = {};
    lines.forEach(function (l) { byKey[l.key] = { line: l, planned: plannedInMonth(l, ym), actual: 0, merchants: [] }; });
    var unbudgeted = { actual: 0, merchants: [] };
    var month = actualData.months[ym] || { m: {} };
    Object.keys(month.m).forEach(function (merchant) {
        var target = actualData.map[merchant] || ACTUAL_NONE;
        if (target === ACTUAL_SKIP) return;
        var row = byKey[target] || unbudgeted;
        row.actual = roundCents(row.actual + month.m[merchant][0]);
        row.merchants.push({ name: merchant, amount: month.m[merchant][0], count: month.m[merchant][1] });
    });
    var rows = lines.map(function (l) { return byKey[l.key]; }).filter(function (r) { return r.planned > 0 || r.actual > 0; });
    rows.sort(function (a, b) { return ACTUAL_GROUP_ORDER.indexOf(a.line.group) - ACTUAL_GROUP_ORDER.indexOf(b.line.group); });
    var plannedTotal = rows.reduce(function (s, r) { return s + r.planned; }, 0);
    var actualTotal = rows.reduce(function (s, r) { return s + r.actual; }, 0) + unbudgeted.actual;
    return { rows: rows, unbudgeted: unbudgeted, plannedTotal: plannedTotal, actualTotal: roundCents(actualTotal) };
}

function differenceText(planned, actual) {
    var diff = actual - planned;
    if (Math.abs(diff) < 1) return 'On plan';
    return money(Math.abs(diff)) + (diff > 0 ? ' over' : ' under');
}

// ── Alerts: bills that went up, and new recurring charges ──

// Gas, electric and water swing with the seasons, so they need a bigger change to count
var ACTUAL_VARIABLE_BILLS = { gas: true, electric: true, water: true };

function actualAlerts() {
    var months = actualMonthKeys();
    var alerts = [];
    if (!months.length) return alerts;
    var dismissed = {};
    actualData.dismissed.forEach(function (id) { dismissed[id] = true; });

    actualLines().forEach(function (line) {
        if (line.group === 'Spending' || !(line.monthly > 0)) return;
        // The latest month this bill was charged, and the one before it
        var latest = null, previous = null;
        for (var i = months.length - 1; i >= 0; i--) {
            var amount = lineActual(months[i], line.key);
            if (!(amount > 0)) continue;
            if (!latest) latest = { ym: months[i], amount: amount };
            else { previous = { ym: months[i], amount: amount }; break; }
        }
        if (!latest) return;
        var expected = plannedPayment(line);
        var diff = latest.amount - expected;
        var variable = ACTUAL_VARIABLE_BILLS[line.key];
        if (diff < (variable ? 15 : 5) || diff < expected * (variable ? 0.2 : 0.05)) return;
        var id = 'up:' + line.key + '|' + latest.ym;
        if (dismissed[id]) return;
        alerts.push({
            id: id, type: 'increase', key: line.key, name: line.name, ym: latest.ym, planned: expected, actual: latest.amount,
            diff: diff, perYear: diff * paymentsPerYear(line.schedule), previous: previous, escrow: line.escrow,
            canUpdate: !!budgetFieldFor(line.key), schedule: line.schedule,
            // A six-month premium charged against a monthly plan looks like a huge increase
            maybeLump: line.schedule === 'monthly' && latest.amount >= expected * 2.5
        });
    });

    // A company not in the budget charging about the same amount two months running
    var last = months[months.length - 1], before = months[months.length - 2];
    if (before && monthsApart(before, last) === 1) {
        var lastM = actualData.months[last].m, beforeM = actualData.months[before].m;
        Object.keys(lastM).forEach(function (merchant) {
            // Companies the rules didn't recognize land in Miscellaneous or "not in my budget"
            var target = actualData.map[merchant] || ACTUAL_NONE;
            if ((target !== ACTUAL_NONE && target !== 'miscSpending') || !beforeM[merchant]) return;
            var a = lastM[merchant], b = beforeM[merchant];
            if (a[1] > 2 || b[1] > 2) return;   // several charges a month is shopping, not a subscription
            if (Math.abs(a[0] - b[0]) > Math.max(1, 0.1 * Math.max(a[0], b[0]))) return;
            var id = 'new:' + merchant;
            if (dismissed[id]) return;
            alerts.push({ id: id, type: 'new', merchant: merchant, name: niceMerchantName(merchant), ym: last, actual: a[0] });
        });
    }
    return alerts;
}

function monthsApart(a, b) {
    return (parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10)) * 12 + parseInt(b.slice(5), 10) - parseInt(a.slice(5), 10);
}

function niceMerchantName(merchant) {
    return merchant.toLowerCase().replace(/(^|[\s&.-])([a-z])/g, function (m, sep, c) { return sep + c.toUpperCase(); });
}

function findActualAlert(id) {
    return actualAlerts().filter(function (a) { return a.id === id; })[0];
}

function dismissActualAlert(id) {
    if (actualData.dismissed.indexOf(id) < 0) actualData.dismissed.push(id);
    isDirty = true;
    renderActual();
    renderActualBanner();
}

// Raise the budgeted amount to what the bill now costs; the Self-Escrow deposit follows
function applyBillIncrease(id) {
    var alert = findActualAlert(id);
    if (!alert) return;
    var field = budgetFieldFor(alert.key);
    if (!field) return;
    var newMonthly = alert.actual * paymentsPerYear(alert.schedule) / 12;
    var input = document.getElementById(field.id);
    input.value = formatMoneyValue(String(roundCents(field.annual ? newMonthly * 12 : newMonthly)));
    actualData.dismissed.push(id);
    isDirty = true;
    calculateAll();
    var deposit = escrowBillList().filter(function (b) { return b.escrow; }).reduce(function (s, b) { return s + b.monthly; }, 0);
    var msg = alert.name + ' is now ' + money(newMonthly) + ' a month in your budget. ';
    msg += alert.escrow
        ? 'Your Self-Escrow deposit is now ' + money(deposit) + ' a month: update your direct deposit to match (the Self-Escrow screen shows the amount per paycheck).'
        : 'It\'s paid from your spending account, so no deposit change is needed.';
    showToast(msg, 'success');
    renderActual();
}

// A new recurring charge goes into the Other tab as a want, and later charges count toward it
function addRecurringToBudget(id) {
    var alert = findActualAlert(id);
    if (!alert) return;
    addOtherExpense(alert.name, String(roundCents(alert.actual)), 'want');
    actualData.map[alert.merchant] = 'other:' + alert.name;
    actualData.dismissed.push(id);
    isDirty = true;
    formatAllInputs();
    calculateAll();
    showToast(alert.name + ' was added to the Other tab at ' + money(alert.actual) + ' a month.', 'success');
    renderActual();
}

// ── Screen ──

function openActual() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    editBudget();
    showActualScreen();
}

function showActualScreen() {
    var name = currentEditingBudget ? currentEditingBudget.name : '';
    setText('actualTitle', '📈 Actual vs. Planned' + (name ? ': ' + name : ' (new budget)'));
    if (!actualData.months[actualMonth]) actualMonth = actualMonthKeys().slice(-1)[0] || '';
    calculateAll();
    renderActual();
    showScreen('actualScreen');
    window.scrollTo(0, 0);
}

function backToBudgetFromActual() {
    showScreen('calculatorScreen');
    window.scrollTo(0, 0);
}

function selectActualMonth(ym) {
    actualMonth = ym;
    renderActual();
}

function changeActualMapping(merchant, target) {
    actualData.map[merchant] = target;
    isDirty = true;
    renderActual();
    renderActualBanner();
}

function deleteActualMonth() {
    if (!actualMonth || !confirm('Remove the uploaded charges for ' + monthLabel(actualMonth) + ' from this budget?')) return;
    delete actualData.months[actualMonth];
    actualMonth = actualMonthKeys().slice(-1)[0] || '';
    isDirty = true;
    renderActual();
    renderActualBanner();
    showToast('Removed. Save the budget to keep this change.', 'info');
}

function lineOptionsHtml(selected, lines) {
    var html = '';
    ACTUAL_GROUP_ORDER.forEach(function (group) {
        var inGroup = lines.filter(function (l) { return l.group === group; });
        if (!inGroup.length) return;
        html += '<optgroup label="' + group + '">' + inGroup.map(function (l) {
            return '<option value="' + escapeHtml(l.key) + '"' + (l.key === selected ? ' selected' : '') + '>' + escapeHtml(l.name) + '</option>';
        }).join('') + '</optgroup>';
    });
    html += '<optgroup label="Other choices">' +
        '<option value="' + ACTUAL_NONE + '"' + (selected === ACTUAL_NONE ? ' selected' : '') + '>Not in my budget</option>' +
        '<option value="' + ACTUAL_SKIP + '"' + (selected === ACTUAL_SKIP ? ' selected' : '') + '>Don\'t count (transfers, card payments)</option>' +
        '</optgroup>';
    return html;
}

function renderActual() {
    var screen = document.getElementById('actualScreen');
    if (!screen) return;
    var months = actualMonthKeys();
    document.getElementById('actualEmpty').style.display = months.length ? 'none' : '';
    document.getElementById('actualContent').style.display = months.length ? '' : 'none';
    renderActualAlerts();
    if (!months.length) return;

    document.getElementById('actualMonthSelect').innerHTML = months.slice().reverse().map(function (ym) {
        return '<option value="' + ym + '"' + (ym === actualMonth ? ' selected' : '') + '>' + monthLabel(ym) + (isPartialMonth(ym) ? ' (partial)' : '') + '</option>';
    }).join('');
    var month = actualData.months[actualMonth];
    document.getElementById('actualPartialNote').style.display = isPartialMonth(actualMonth) ? '' : 'none';
    setText('actualPartialDays', month.to >= month.from ? MONTH_NAMES[parseInt(actualMonth.slice(5), 10) - 1] + ' ' + month.from + '–' + month.to : 'no days');

    var c = actualComparison(actualMonth);
    var group = '';
    var html = '<table class="actual-table"><thead><tr><th>Item</th><th>Planned</th><th>Actual</th><th>Difference</th></tr></thead><tbody>';
    c.rows.forEach(function (r) {
        if (r.line.group !== group) {
            group = r.line.group;
            html += '<tr class="actual-group"><td colspan="4">' + escapeHtml(group) + '</td></tr>';
        }
        html += actualRowHtml(r.line.name, r.planned, r.actual, r.merchants);
    });
    if (c.unbudgeted.actual > 0) {
        html += '<tr class="actual-group"><td colspan="4">Not in my budget</td></tr>' +
            actualRowHtml('Not in my budget', 0, c.unbudgeted.actual, c.unbudgeted.merchants);
    }
    html += '<tr class="actual-total"><td>Total</td><td>' + money(c.plannedTotal) + '</td><td>' + money(c.actualTotal) + '</td><td>' +
        differenceText(c.plannedTotal, c.actualTotal) + '</td></tr></tbody></table>';
    document.getElementById('actualTable').innerHTML = html;

    var lines = actualLines();
    // Biggest first, with "don't count" items (transfers, card payments) at the end
    var skipped = function (m) { return actualData.map[m] === ACTUAL_SKIP ? 1 : 0; };
    var merchants = Object.keys(month.m).sort(function (a, b) { return skipped(a) - skipped(b) || month.m[b][0] - month.m[a][0]; });
    document.getElementById('actualMerchants').innerHTML = merchants.map(function (merchant) {
        var e = month.m[merchant];
        var target = actualData.map[merchant] || ACTUAL_NONE;
        return '<div class="import-row' + (target === ACTUAL_SKIP ? ' import-row-skipped' : '') + '">' +
            '<div class="import-merchant"><div class="import-merchant-name">' + escapeHtml(merchant) + '</div>' +
            '<div class="import-merchant-meta">' + e[1] + (e[1] === 1 ? ' charge' : ' charges') + ' · ' + money(e[0]) + '</div></div>' +
            '<select data-merchant="' + escapeHtml(merchant) + '" aria-label="Budget line for ' + escapeHtml(merchant) + '">' + lineOptionsHtml(target, lines) + '</select></div>';
    }).join('');
}

function actualRowHtml(name, planned, actual, merchants) {
    var diff = actual - planned;
    var cls = Math.abs(diff) < 1 ? '' : diff > 0 ? ' actual-over' : ' actual-under';
    var lines = merchants.length ? merchants.map(function (m) { return m.name + ': ' + money(m.amount) + (m.count > 1 ? ' (' + m.count + ' charges)' : ''); })
        : ['No charges in the uploaded files'];
    return '<tr><td>' + escapeHtml(name) + '</td><td>' + money(planned) + '</td><td' + explainAttr(lines) + '>' + money(actual) +
        '</td><td class="actual-diff' + cls + '">' + differenceText(planned, actual) + '</td></tr>';
}

function renderActualAlerts() {
    var box = document.getElementById('actualAlerts');
    if (!box) return;
    var alerts = actualAlerts();
    box.innerHTML = alerts.map(function (a) {
        if (a.type === 'new') {
            return '<div class="actual-alert">' +
                '<div class="actual-alert-title">🔁 New recurring charge: ' + escapeHtml(a.name) + ', ' + money(a.actual) + ' a month</div>' +
                '<p>It was charged in the last two months and isn\'t in your budget.</p>' +
                '<div class="actual-alert-buttons"><button class="btn btn-success" data-alert-action="add" data-alert-id="' + escapeHtml(a.id) + '">Add to my budget</button>' +
                '<button class="btn btn-secondary" data-alert-action="dismiss" data-alert-id="' + escapeHtml(a.id) + '">Ignore</button></div></div>';
        }
        var per = a.schedule === 'monthly' ? ' a month' : ' a payment';
        var details = '<p>Planned: ' + money(a.planned) + per + '. Charged in ' + monthLabel(a.ym) + ': ' + money(a.actual) + '.';
        if (a.previous) details += ' Before that, ' + monthLabel(a.previous.ym) + ': ' + money(a.previous.amount) + '.';
        details += '</p><p>That\'s ' + money(a.perYear) + ' more a year. It\'s worth calling the company to ask why, or getting a quote from a competitor.</p>';
        if (a.maybeLump) details += '<p>If this is a payment for several months at once, set how often it\'s paid on the Self-Escrow screen instead.</p>';
        var id = escapeHtml(a.id);
        return '<div class="actual-alert">' +
            '<div class="actual-alert-title">⚠️ ' + escapeHtml(a.name) + ' went up ' + money(a.diff) + per + '</div>' +
            '<details><summary>Look into it</summary>' + details + '</details>' +
            '<div class="actual-alert-buttons">' +
            (a.canUpdate ? '<button class="btn btn-success" data-alert-action="update" data-alert-id="' + id + '">Update my budget</button>'
                : '<span class="actual-alert-note">This amount is calculated from the Housing or Transportation tab; change it there.</span>') +
            '<button class="btn btn-secondary" data-alert-action="dismiss" data-alert-id="' + id + '">Dismiss</button></div></div>';
    }).join('');
}

// Banner on the budget screen when there's something to review
function renderActualBanner() {
    var banner = document.getElementById('actualBanner');
    if (!banner) return;
    var n = actualMonthKeys().length ? actualAlerts().length : 0;
    banner.style.display = n ? '' : 'none';
    if (n) setText('actualBannerText', n === 1 ? '1 bill change to review' : n + ' bill changes to review');
    var screen = document.getElementById('actualScreen');
    if (screen && screen.classList.contains('active')) renderActualAlerts();
}

document.getElementById('actualAlerts').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-alert-action]');
    if (!btn) return;
    var id = btn.dataset.alertId;
    if (btn.dataset.alertAction === 'update') applyBillIncrease(id);
    else if (btn.dataset.alertAction === 'add') addRecurringToBudget(id);
    else dismissActualAlert(id);
});

document.getElementById('actualMerchants').addEventListener('change', function (e) {
    if (e.target.dataset.merchant) changeActualMapping(e.target.dataset.merchant, e.target.value);
});
