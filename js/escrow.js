// Self-Escrow screen: plan a separate "bills" checking account. Fixed bills are paid from escrow;
// the rest of take-home pay goes to a spending account (and savings, if not escrowed).
// Choices are saved with the budget as data.escrow = { items: { key: { on, schedule, month, route } }, savingsAccountName }.
// Savings items have a route: 'direct' (paycheck direct deposit to a savings account, the default),
// 'escrow' (paid from the self-escrow account) or 'spending' (moved over from the spending account).

var escrowSettings = { items: {} };

var SAVINGS_ROUTES = [['direct', 'Paycheck direct deposit'], ['escrow', 'Self-escrow account'], ['spending', 'Spending account']];

// How a savings item is paid, from the user's saved choice (older budgets only saved on/off)
function savingsRoute(key) {
    var saved = escrowSettings.items[key] || {};
    if (saved.route) return saved.route;
    return saved.on === true ? 'escrow' : 'direct';
}

// What the paycheck's direct-deposit savings account is called (e.g. "Vanguard")
function savingsAccountName() {
    return (escrowSettings.savingsAccountName || '').trim();
}

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// How often a lump bill is paid: number of payments a year
var ESCROW_SCHEDULES = [['monthly', 'Monthly', 12], ['quarterly', 'Quarterly', 4], ['twice', 'Twice a year', 2], ['yearly', 'Once a year', 1]];

// The field's label without "(Monthly)", e.g. "Eating Out"
function fieldLabel(id) {
    var label = document.querySelector('label[for="' + id + '"]');
    return label ? label.textContent.replace(/\s*\((Monthly|Annual)\)\s*$/, '').trim() : id;
}

// Every bill in the budget with its amount. lump: paid in a few larger payments rather than monthly.
// escrow: whether it's in escrow unless the user changes it. Keys stay stable between visits.
function escrowBillList() {
    var bills = [];
    function add(key, group, name, monthly, opts) {
        if (!(monthly > 0)) return;
        opts = opts || {};
        bills.push({ key: key, group: group, name: name, monthly: monthly, lump: !!opts.lump,
            escrow: opts.escrow !== false, schedule: opts.schedule || 'monthly', month: opts.month || 1, savings: !!opts.savings, direct: false });
    }

    if (document.getElementById('housingMode').value === 'rent') {
        add('rent', 'Housing', 'Rent', val('monthlyRent'));
        add('rentersInsurance', 'Housing', "Renter's insurance", val('rentersInsurance') / 12, { lump: true, schedule: 'yearly', month: 1 });
    } else {
        if (document.getElementById('housingMode').value !== 'paid') add('mortgage', 'Housing', 'Mortgage payment', loanPayment(Math.max(0, val('houseValue') - val('mortgageDownPayment')), val('mortgageRate'), val('mortgageTerm')));
        add('propertyTax', 'Housing', 'Property taxes', propertyTaxAnnual() / 12, { lump: true, schedule: 'yearly', month: 11 });
        add('homeInsurance', 'Housing', 'Homeowners insurance', val('homeInsurance') / 12, { lump: true, schedule: 'yearly', month: 1 });
        add('waste', 'Housing', 'Waste management', val('waste') / 12, { lump: true, schedule: 'yearly', month: 1 });
    }

    add('carPayment', 'Transportation', 'Car payment', loanPayment(Math.max(0, val('carPrice') - val('downPayment')), val('carRate'), val('loanTerm')));
    add('carInsurance', 'Transportation', 'Car insurance', val('carInsuranceAnnual') / 12, { lump: true, schedule: 'twice', month: 1 });
    add('carTaxes', 'Transportation', 'Vehicle taxes', val('carTaxes') / 12, { lump: true, schedule: 'yearly', month: 1 });

    var children = getChildIndices();
    for (var c = 0; c < children.length; c++) {
        var idx = children[c];
        var who = document.getElementById('childName_' + idx).value.trim() || 'Person ' + (c + 1);
        add('child' + c + '_tuition', 'Education', who + ': tuition', val('tuition_' + idx) / 12, { lump: true, schedule: 'twice', month: 8 });
        add('child' + c + '_lunch', 'Education', who + ': lunch / meals', val('lunch_' + idx) / 12);
        add('child' + c + '_afterschool', 'Education', who + ': afterschool', val('afterschool_' + idx) / 12);
    }

    ['internet', 'phone', 'tv', 'gas', 'electric', 'water'].forEach(function (id) {
        add(id, 'Utilities', fieldLabel(id), val(id));
    });

    var others = getOtherExpenseIndices();
    for (var o = 0; o < others.length; o++) {
        var name = document.getElementById('otherName_' + others[o]).value.trim() || 'Other expense';
        var isNeed = document.getElementById('otherType_' + others[o]).value === 'need';
        add('other:' + name, 'Other', name, val('otherAmount_' + others[o]), { escrow: isNeed });
    }

    ['groceries', 'gasoline', 'eatingOut', 'entertainment', 'shopping', 'hobbies', 'tools', 'miscSpending'].forEach(function (id) {
        add(id, 'Spending', fieldLabel(id), val(id), { escrow: false });
    });
    savingsItems().forEach(function (item) {
        add(item.key, 'Savings', item.name, item.monthly, { escrow: false, savings: true });
    });

    // Apply the user's saved choices
    bills.forEach(function (b) {
        var saved = escrowSettings.items[b.key];
        if (saved) {
            if (typeof saved.on === 'boolean') b.escrow = saved.on;
            if (b.lump && saved.schedule) b.schedule = saved.schedule;
            if (b.lump && saved.month) b.month = saved.month;
        }
        if (b.savings) {
            b.route = savingsRoute(b.key);
            b.escrow = b.route === 'escrow';
            b.direct = b.route === 'direct';
        }
        if (!b.lump) b.schedule = 'monthly';
    });
    return bills;
}

function paymentsPerYear(schedule) {
    for (var i = 0; i < ESCROW_SCHEDULES.length; i++) if (ESCROW_SCHEDULES[i][0] === schedule) return ESCROW_SCHEDULES[i][2];
    return 12;
}

// Amount of a bill due in a given month (1-12)
function billDueIn(bill, month) {
    var times = paymentsPerYear(bill.schedule);
    if (times === 12) return bill.monthly;
    var gap = 12 / times;
    var due = ((month - bill.month) % 12 + 12) % 12 % gap === 0;
    return due ? bill.monthly * 12 / times : 0;
}

// Monthly deposit, 12-month forecast starting this month, and the cushion needed so the
// balance never goes below zero. Conservatively, each month's bills are paid before that
// month's deposits arrive.
function computeEscrowPlan(bills, startMonth, extraCushion) {
    var escrowBills = bills.filter(function (b) { return b.escrow; });
    var deposit = escrowBills.reduce(function (sum, b) { return sum + b.monthly; }, 0);
    var months = [];
    var balance = 0, lowest = 0;
    for (var i = 0; i < 12; i++) {
        var month = ((startMonth - 1 + i) % 12) + 1;
        var billsDue = escrowBills.reduce(function (sum, b) { return sum + billDueIn(b, month); }, 0);
        balance -= billsDue;
        lowest = Math.min(lowest, balance);
        balance += deposit;
        months.push({ month: month, deposit: deposit, bills: billsDue, balanceAfterBills: balance - deposit });
    }
    var cushion = Math.max(0, -lowest) + (extraCushion || 0);
    months.forEach(function (m) { m.balanceAfterBills += cushion; m.balanceEnd = m.balanceAfterBills + m.deposit; });
    return { deposit: deposit, cushion: cushion, months: months, lowestMonth: months.reduce(function (a, m) { return m.balanceAfterBills < a.balanceAfterBills ? m : a; }, months[0]) };
}

function onEscrowChange(key, field, value) {
    var item = escrowSettings.items[key] || (escrowSettings.items[key] = {});
    item[field] = field === 'on' ? value : field === 'month' ? parseInt(value, 10) : value;
    if (field === 'route') item.on = value === 'escrow';
    isDirty = true;
    calculateAll();
}

// One listener for every bill row; each control carries its bill key and setting in data- attributes
function onEscrowBillsChange(e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.field) return;
    onEscrowChange(el.dataset.key, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value);
}

function escrowAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}

function savingsRouteOptions(selected) {
    return SAVINGS_ROUTES.map(function (r) {
        var label = r[0] === 'direct' && savingsAccountName() ? 'Paycheck direct deposit (' + savingsAccountName() + ')' : r[1];
        return '<option value="' + r[0] + '"' + (r[0] === selected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');
}

function escrowRowHtml(b) {
    var key = escrowAttr(b.key);
    var html = '<div class="escrow-row' + (b.escrow ? ' escrow-row-on' : '') + (b.direct ? ' escrow-row-direct' : '') + '">';
    if (b.savings) {
        // Savings: choose where the money comes from instead of a simple on/off
        html += '<span class="escrow-check">' + escapeHtml(b.name) + '</span><span class="escrow-amount">$' + formatCurrency(b.monthly) + '/mo</span>' +
            '<span class="escrow-schedule"><select data-key="' + key + '" data-field="route" aria-label="How ' + escrowAttr(b.name) + ' is paid">' +
            savingsRouteOptions(b.route) + '</select></span>';
        return html + '</div>';
    }
    html += '<label class="escrow-check"><input type="checkbox" data-key="' + key + '" data-field="on"' + (b.escrow ? ' checked' : '') + '> ' +
        escapeHtml(b.name) + '</label><span class="escrow-amount">$' + formatCurrency(b.monthly) + '/mo</span>';
    if (b.lump) {
        html += '<span class="escrow-schedule"><select data-key="' + key + '" data-field="schedule" aria-label="How often ' + escrowAttr(b.name) + ' is paid">';
        ESCROW_SCHEDULES.forEach(function (s) {
            html += '<option value="' + s[0] + '"' + (s[0] === b.schedule ? ' selected' : '') + '>' + s[1] + '</option>';
        });
        html += '</select>';
        if (b.schedule !== 'monthly') {
            html += '<select data-key="' + key + '" data-field="month" aria-label="First month ' + escrowAttr(b.name) + ' is due">';
            MONTH_NAMES.forEach(function (m, i) {
                html += '<option value="' + (i + 1) + '"' + (i + 1 === b.month ? ' selected' : '') + '>' + m + '</option>';
            });
            html += '</select><span class="escrow-due">$' + formatCurrency(b.monthly * 12 / paymentsPerYear(b.schedule)) + ' each</span>';
        }
        html += '</span>';
    }
    return html + '</div>';
}

// Splits monthly amounts across each person's paychecks, in proportion to take-home pay
function escrowPaycheckRows(escrowMonthly, savingsMonthly) {
    var indices = getEarnerIndices();
    var earners = indices.map(function (idx, i) {
        return {
            name: document.getElementById('earnerName_' + idx).value.trim() || 'Person ' + (i + 1),
            takeHome: computeEarner(idx).monthlyTakeHome,
            perYear: parseInt(document.getElementById('payFrequency_' + idx).value, 10) || 12
        };
    });
    var total = earners.reduce(function (sum, e) { return sum + e.takeHome; }, 0);
    return earners.filter(function (e) { return e.takeHome > 0; }).map(function (e) {
        var share = total > 0 ? e.takeHome / total : 0;
        var perCheck = function (monthly) { return monthly * share * 12 / e.perYear; };
        var paycheck = e.takeHome * 12 / e.perYear;
        var escrow = perCheck(escrowMonthly), savings = perCheck(savingsMonthly);
        return { name: e.name, perYear: e.perYear, takeHome: e.takeHome, share: share, paycheck: paycheck,
            escrow: escrow, savings: savings, spending: paycheck - escrow - savings };
    });
}

var PAY_FREQUENCY_NAMES = { 52: 'weekly', 26: 'every two weeks', 24: 'twice a month', 12: 'monthly' };

// Totals for the dashboard summary and Compare: { escrow, savingsTransfers, spendingAccount }
function escrowTotals(takeHome) {
    var bills = escrowBillList();
    var escrow = 0, savings = 0;
    bills.forEach(function (b) {
        if (b.escrow) escrow += b.monthly;
        else if (b.direct) savings += b.monthly;
    });
    return { bills: bills, escrow: escrow, savingsTransfers: savings, spendingAccount: takeHome - escrow - savings };
}

function renderEscrowPlan(takeHome) {
    var totals = escrowTotals(takeHome);
    var bills = totals.bills;
    var extraCushion = val('escrowExtraCushion');
    var startMonth = new Date().getMonth() + 1;
    var plan = computeEscrowPlan(bills, startMonth, extraCushion);

    setText('escrowDeposit', '$' + formatCurrency(plan.deposit));
    setText('escrowCushion', '$' + formatCurrency(plan.cushion));
    setText('escrowSavings', '$' + formatCurrency(totals.savingsTransfers));
    setText('escrowSpending', formatSignedMoney(totals.spendingAccount));
    var accountName = savingsAccountName();
    setText('escrowSavingsTitle', accountName ? 'Direct to ' + accountName : 'Direct to Savings');
    syncSavingsRouteSelects();

    var escrowItems = bills.filter(function (b) { return b.escrow; });
    var directItems = bills.filter(function (b) { return b.direct; });
    setExplain('escrowDeposit', escrowItems.length
        ? ['Bills paid from your self-escrow, as monthly amounts:'].concat(itemLines(escrowItems), ['Total: ' + money(plan.deposit) + ' a month'])
        : ['Check bills below to pay them from your self-escrow.']);
    setExplain('escrowSavings', directItems.length
        ? ['Savings set to "Paycheck direct deposit":'].concat(itemLines(directItems), ['Total: ' + money(totals.savingsTransfers) + ' a month'])
        : ['No savings are set to paycheck direct deposit. Choose "Paid by" on the Savings tab or below.']);
    var otherIncome = otherIncomeLines().reduce(function (sum, l) { return sum + l.monthly; }, 0);
    setExplain('escrowSpending', [
        'Take-home pay: ' + money(takeHome) + (otherIncome > 0 ? ' (including ' + money(otherIncome) + ' of other income)' : ''),
        '− Self-escrow deposit: ' + money(plan.deposit),
        '− Direct to savings: ' + money(totals.savingsTransfers),
        '= ' + formatSignedMoney(totals.spendingAccount) + ' a month to your spending account'
    ]);
    var lowest = plan.lowestMonth;
    setExplain('escrowCushion', plan.deposit > 0 ? [
        'Money to have in the account when you start, so bills never bounce.',
        'Without it, the balance would bottom out at ' + formatSignedMoney(lowest.balanceAfterBills - plan.cushion) +
            ' after ' + MONTH_NAMES[lowest.month - 1] + "'s bills.",
        'Covering that: ' + money(plan.cushion - extraCushion),
        '+ Extra safety margin: ' + money(extraCushion),
        '= ' + money(plan.cushion)
    ] : ['Check bills below to see the cushion you need.']);
    document.getElementById('escrowSpendingCard').className = 'summary-item' + (totals.spendingAccount < 0 ? ' balance-over' : '');

    // Bill list, grouped
    var html = '', group = '';
    bills.forEach(function (b) {
        if (b.group !== group) {
            group = b.group;
            html += '<div class="escrow-group">' + group + '</div>';
        }
        html += escrowRowHtml(b);
    });
    document.getElementById('escrowBills').innerHTML = html ||
        '<p class="escrow-empty">Add bills on the other tabs and they\'ll show up here.</p>';

    // What the spending account covers
    var spendingItems = bills.filter(function (b) { return !b.escrow && !b.direct; });
    var spendingBills = spendingItems.reduce(function (sum, b) { return sum + b.monthly; }, 0);
    setText('escrowSpendingBills', '$' + formatCurrency(spendingBills));
    setText('escrowSpendingFree', formatSignedMoney(totals.spendingAccount - spendingBills));

    // Deposits per paycheck
    var rows = escrowPaycheckRows(plan.deposit, totals.savingsTransfers);
    var ph = '';
    rows.forEach(function (r) {
        var pct = Math.round(r.share * 1000) / 10 + '%';
        var perCheckLine = function (monthly, what) {
            return [what + ': ' + money(monthly) + ' a month',
                rows.length > 1 ? '× ' + pct + " (" + r.name + "'s share of household take-home)" : null,
                '× 12 months ÷ ' + r.perYear + ' paychecks a year'].filter(Boolean);
        };
        var paycheckWhy = [r.name + "'s take-home: " + money(r.takeHome) + ' a month', '× 12 ÷ ' + r.perYear + ' paychecks = ' + money(r.paycheck)];
        var escrowWhy = perCheckLine(plan.deposit, 'Self-escrow deposit').concat(['= ' + money(r.escrow) + ' per paycheck']);
        var savingsWhy = ['Direct-deposit savings:'].concat(itemLines(directItems),
            perCheckLine(totals.savingsTransfers, 'Total'), ['= ' + money(r.savings) + ' per paycheck']);
        var spendingWhy = ['Paycheck: ' + money(r.paycheck), '− To self-escrow: ' + money(r.escrow),
            '− To savings: ' + money(r.savings), '= ' + formatSignedMoney(r.spending)];
        ph += '<tr><th scope="row">' + escapeHtml(r.name) + '<div class="escrow-sub">' + (PAY_FREQUENCY_NAMES[r.perYear] || r.perYear + '× a year') +
            ' · <span' + explainAttr(paycheckWhy) + '>$' + formatCurrency(r.paycheck) + ' paycheck</span></div></th>' +
            '<td><span' + explainAttr(escrowWhy) + '>$' + formatCurrency(r.escrow) + '</span></td>' +
            (totals.savingsTransfers > 0 ? '<td><span' + explainAttr(savingsWhy) + '>$' + formatCurrency(r.savings) + '</span></td>' : '') +
            '<td><span' + explainAttr(spendingWhy) + '>' + formatSignedMoney(r.spending) + '</span></td></tr>';
    });
    document.getElementById('escrowPaychecks').innerHTML = rows.length
        ? '<table class="escrow-table"><thead><tr><th></th><th>To self-escrow</th>' + (totals.savingsTransfers > 0 ? '<th>To ' + escapeHtml(accountName || 'savings') + '</th>' : '') +
            '<th>To spending</th></tr></thead><tbody>' + ph + '</tbody></table>'
        : '<p class="escrow-empty">Add income on the Income tab to see deposits per paycheck.</p>';

    // 12-month forecast
    var fh = '';
    plan.months.forEach(function (m, i) {
        var low = m === plan.lowestMonth && plan.deposit > 0;
        var due = escrowItems.filter(function (b) { return billDueIn(b, m.month) > 0; })
            .map(function (b) { return b.name + ': ' + money(billDueIn(b, m.month)); });
        var billsWhy = due.length ? due.concat(['Total: ' + money(m.bills)]) : ['No bills due'];
        var startBalance = i === 0 ? plan.cushion : plan.months[i - 1].balanceEnd;
        var balanceWhy = [(i === 0 ? 'Starting cushion: ' : 'Last month\'s ending balance: ') + money(startBalance),
            '− Bills paid: ' + money(m.bills), '= ' + money(m.balanceAfterBills)];
        var endWhy = ['Balance after bills: ' + money(m.balanceAfterBills), '+ Deposits: ' + money(m.deposit), '= ' + money(m.balanceEnd)];
        fh += '<tr' + (low ? ' class="escrow-low"' : '') + '><th scope="row">' + MONTH_NAMES[m.month - 1] + '</th>' +
            '<td><span' + explainAttr(billsWhy) + '>$' + formatCurrency(m.bills) + '</span></td>' +
            '<td><span' + explainAttr(balanceWhy) + '>$' + formatCurrency(m.balanceAfterBills) + '</span>' + (low ? ' <span class="escrow-low-tag">lowest</span>' : '') + '</td>' +
            '<td><span' + explainAttr(['Your monthly self-escrow deposit']) + '>$' + formatCurrency(m.deposit) + '</span></td>' +
            '<td><span' + explainAttr(endWhy) + '>$' + formatCurrency(m.balanceEnd) + '</span></td></tr>';
    });
    document.getElementById('escrowForecast').innerHTML = plan.deposit > 0
        ? '<table class="escrow-table"><thead><tr><th>Month</th><th>Bills paid</th><th>Balance after bills</th><th>Deposits</th><th>Ending balance</th></tr></thead><tbody>' + fh + '</tbody></table>'
        : '<p class="escrow-empty">Check at least one bill above to see the forecast.</p>';

    renderEscrowCheckup(bills, plan, startMonth, extraCushion);

    return { escrow: plan.deposit, cushion: plan.cushion, savingsTransfers: totals.savingsTransfers, spendingAccount: totals.spendingAccount };
}

function gatherEscrowSettings() {
    return JSON.parse(JSON.stringify(escrowSettings));
}

function loadEscrowSettings(saved) {
    escrowSettings = saved && saved.items ? JSON.parse(JSON.stringify(saved)) : { items: {} };
    var nameInput = document.getElementById('savingsAccountName');
    if (nameInput) nameInput.value = escrowSettings.savingsAccountName || '';
}

// Savings tab: the "Paid by" choice under each savings amount, and the direct-deposit account name
function onSavingsRouteChange(e) {
    var el = e.target;
    if (el.dataset && el.dataset.routeFor) onEscrowChange(el.dataset.routeFor, 'route', el.value);
    if (el.id === 'savingsAccountName') {
        escrowSettings.savingsAccountName = el.value;
        isDirty = true;
        calculateAll();
    }
}

function syncSavingsRouteSelects() {
    var selects = document.querySelectorAll('select[data-route-for]');
    for (var i = 0; i < selects.length; i++) {
        var id = selects[i].dataset.routeFor;
        // Rows on the Savings tab always show their choice; keep the current one while it's open
        if (selects[i] === document.activeElement) continue;
        selects[i].innerHTML = savingsRouteOptions(savingsRoute(id));
    }
}

// Home screen "Self-Escrow" button: open the selected budget straight to its Self-Escrow screen
function openEscrow() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    editBudget();
    showEscrowScreen();
}

// The Self-Escrow screen works on the open budget, so unsaved edits carry across both ways
function showEscrowScreen() {
    setEscrowTitle(currentEditingBudget ? currentEditingBudget.name : '');
    calculateAll();
    showScreen('escrowScreen');
    window.scrollTo(0, 0);
}

function backToBudgetFromEscrow() {
    showScreen('calculatorScreen');
    window.scrollTo(0, 0);
}

function setEscrowTitle(budgetName) {
    setText('escrowTitle', '🧾 Self-Escrow' + (budgetName ? ': ' + budgetName : ' (new budget)'));
}

document.getElementById('escrowBills').addEventListener('change', onEscrowBillsChange);
document.getElementById('savingsTab').addEventListener('change', onSavingsRouteChange);
document.getElementById('savingsTab').addEventListener('input', function (e) {
    if (e.target.id === 'savingsAccountName') onSavingsRouteChange(e);
});

// ── Check-up (like a mortgage servicer's yearly escrow analysis) ──
// Starting from today's real balance, run the next 12 months of bills with the planned deposit.
// The balance should never drop below the safety margin; any shortage is spread over 12 deposits,
// and anything above the margin at the lowest point is a surplus the user can take out.
function escrowCheckup(bills, startMonth, balance, deposit, margin) {
    var escrowBills = bills.filter(function (b) { return b.escrow; });
    var running = balance, lowest = Infinity, lowestMonth = startMonth;
    for (var i = 0; i < 12; i++) {
        var month = ((startMonth - 1 + i) % 12) + 1;
        running -= escrowBills.reduce(function (sum, b) { return sum + billDueIn(b, month); }, 0);
        if (running < lowest) { lowest = running; lowestMonth = month; }
        running += deposit;
    }
    var diff = Math.round((lowest - margin) * 100) / 100;
    return {
        lowest: lowest,
        lowestMonth: lowestMonth,
        shortage: diff < 0 ? -diff : 0,
        surplus: diff > 0 ? diff : 0,
        newDeposit: deposit + (diff < 0 ? -diff / 12 : 0)
    };
}

function renderEscrowCheckup(bills, plan, startMonth, margin) {
    var box = document.getElementById('escrowCheckup');
    var balanceInput = document.getElementById('escrowCurrentBalance');
    if (!box || !balanceInput) return;
    if (balanceInput.value.trim() === '' || plan.deposit <= 0) {
        box.innerHTML = plan.deposit > 0 ? '<p class="escrow-empty">Enter today\'s balance to run the check-up.</p>' : '';
        return;
    }
    var balance = val('escrowCurrentBalance');
    var current = val('escrowCurrentDeposit');
    var c = escrowCheckup(bills, startMonth, balance, plan.deposit, margin);
    var month = MONTH_NAMES[c.lowestMonth - 1];

    var html = '';
    if (current > 0 && Math.abs(current - plan.deposit) >= 0.01) {
        var change = plan.deposit - current;
        html += '<div class="checkup-line"><strong>Your bills now need ' + money(plan.deposit) + ' a month.</strong> You deposit ' + money(current) +
            ', so ' + (change > 0 ? 'raise it by ' : 'you can lower it by ') + money(Math.abs(change)) + '.</div>';
    }
    var why = explainAttr([
        'Balance today: ' + money(balance),
        'Then each month: pay the bills due, then deposit ' + money(plan.deposit),
        'Lowest point: ' + formatSignedMoney(c.lowest) + ' after ' + month + "'s bills",
        'Safety margin to keep: ' + money(margin)
    ]);
    if (c.shortage > 0) {
        html += '<div class="checkup-result checkup-short"><strong>⚠️ Short by <span' + why + '>' + money(c.shortage) + '</span></strong>' +
            '<p>At ' + money(plan.deposit) + ' a month, the account would fall to ' + formatSignedMoney(c.lowest) + ' after ' + month + "'s bills" +
            (margin > 0 ? ', below your ' + money(margin) + ' safety margin' : '') + '.</p>' +
            '<p>Fix it either way:</p><ul><li>Deposit <strong>' + money(c.shortage) + '</strong> once now, or</li>' +
            '<li>Deposit <strong>' + money(c.newDeposit) + '</strong> a month for the next 12 months (' + money(c.shortage / 12) + ' more), then go back to ' + money(plan.deposit) + '.</li></ul></div>';
    } else if (c.surplus >= 1) {
        html += '<div class="checkup-result checkup-over"><strong>✅ Over by <span' + why + '>' + money(c.surplus) + '</span></strong>' +
            '<p>Even at its lowest (after ' + month + "'s bills) the account stays " + money(c.surplus) + ' above ' + (margin > 0 ? 'your safety margin' : 'zero') +
            '. You can move that to your spending or savings account, or leave it as extra cushion.</p></div>';
    } else {
        html += '<div class="checkup-result checkup-over"><strong>✅ <span' + why + '>On track</span></strong><p>Your balance covers the next 12 months of bills at ' + money(plan.deposit) + ' a month.</p></div>';
    }
    box.innerHTML = html;
}
