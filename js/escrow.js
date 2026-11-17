// Escrow tab: plan a separate "bills" checking account. Fixed bills are paid from escrow;
// the rest of take-home pay goes to a spending account (and savings, if not escrowed).
// Choices are saved with the budget as data.escrow = { items: { key: { on, schedule, month } } }.

var escrowSettings = { items: {} };

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
            escrow: opts.escrow !== false, schedule: opts.schedule || 'monthly', month: opts.month || 1, savings: !!opts.savings });
    }

    if (document.getElementById('housingMode').value === 'rent') {
        add('rent', 'Housing', 'Rent', val('monthlyRent'));
        add('rentersInsurance', 'Housing', "Renter's insurance", val('rentersInsurance') / 12, { lump: true, schedule: 'yearly', month: 1 });
    } else {
        add('mortgage', 'Housing', 'Mortgage payment', loanPayment(Math.max(0, val('houseValue') - val('mortgageDownPayment')), val('mortgageRate'), val('mortgageTerm')));
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
    ['emergencyFund', 'retirement401k', 'iraContribution', 'investmentAccount', 'collegeFund', 'cashSavings'].forEach(function (id) {
        add(id, 'Savings', fieldLabel(id), val(id), { escrow: false, savings: true });
    });

    // Apply the user's saved choices
    bills.forEach(function (b) {
        var saved = escrowSettings.items[b.key];
        if (saved) {
            if (typeof saved.on === 'boolean') b.escrow = saved.on;
            if (b.lump && saved.schedule) b.schedule = saved.schedule;
            if (b.lump && saved.month) b.month = saved.month;
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

function escrowRowHtml(b) {
    var key = escrowAttr(b.key);
    var html = '<div class="escrow-row' + (b.escrow ? ' escrow-row-on' : '') + '">' +
        '<label class="escrow-check"><input type="checkbox" data-key="' + key + '" data-field="on"' + (b.escrow ? ' checked' : '') + '> ' +
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
        return { name: e.name, perYear: e.perYear, paycheck: paycheck, escrow: escrow, savings: savings, spending: paycheck - escrow - savings };
    });
}

var PAY_FREQUENCY_NAMES = { 52: 'weekly', 26: 'every two weeks', 24: 'twice a month', 12: 'monthly' };

// Totals for the dashboard summary and Compare: { escrow, savingsTransfers, spendingAccount }
function escrowTotals(takeHome) {
    var bills = escrowBillList();
    var escrow = 0, savings = 0;
    bills.forEach(function (b) {
        if (b.escrow) escrow += b.monthly;
        else if (b.savings) savings += b.monthly;
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
    var spendingItems = bills.filter(function (b) { return !b.escrow && !b.savings; });
    var spendingBills = spendingItems.reduce(function (sum, b) { return sum + b.monthly; }, 0);
    setText('escrowSpendingBills', '$' + formatCurrency(spendingBills));
    setText('escrowSpendingFree', formatSignedMoney(totals.spendingAccount - spendingBills));

    // Deposits per paycheck
    var rows = escrowPaycheckRows(plan.deposit, totals.savingsTransfers);
    var ph = '';
    rows.forEach(function (r) {
        ph += '<tr><th scope="row">' + escapeHtml(r.name) + '<div class="escrow-sub">' + (PAY_FREQUENCY_NAMES[r.perYear] || r.perYear + '× a year') +
            ' · $' + formatCurrency(r.paycheck) + ' paycheck</div></th><td>$' + formatCurrency(r.escrow) + '</td>' +
            (totals.savingsTransfers > 0 ? '<td>$' + formatCurrency(r.savings) + '</td>' : '') +
            '<td>' + formatSignedMoney(r.spending) + '</td></tr>';
    });
    document.getElementById('escrowPaychecks').innerHTML = rows.length
        ? '<table class="escrow-table"><thead><tr><th></th><th>To self-escrow</th>' + (totals.savingsTransfers > 0 ? '<th>To savings</th>' : '') +
            '<th>To spending</th></tr></thead><tbody>' + ph + '</tbody></table>'
        : '<p class="escrow-empty">Add income on the Income tab to see deposits per paycheck.</p>';

    // 12-month forecast
    var fh = '';
    plan.months.forEach(function (m) {
        var low = m === plan.lowestMonth && plan.deposit > 0;
        fh += '<tr' + (low ? ' class="escrow-low"' : '') + '><th scope="row">' + MONTH_NAMES[m.month - 1] + '</th><td>$' +
            formatCurrency(m.bills) + '</td><td>$' + formatCurrency(m.balanceAfterBills) + (low ? ' <span class="escrow-low-tag">lowest</span>' : '') +
            '</td><td>$' + formatCurrency(m.deposit) + '</td><td>$' + formatCurrency(m.balanceEnd) + '</td></tr>';
    });
    document.getElementById('escrowForecast').innerHTML = plan.deposit > 0
        ? '<table class="escrow-table"><thead><tr><th>Month</th><th>Bills paid</th><th>Balance after bills</th><th>Deposits</th><th>Ending balance</th></tr></thead><tbody>' + fh + '</tbody></table>'
        : '<p class="escrow-empty">Check at least one bill above to see the forecast.</p>';

    return { escrow: plan.deposit, cushion: plan.cushion, savingsTransfers: totals.savingsTransfers, spendingAccount: totals.spendingAccount };
}

function gatherEscrowSettings() {
    return JSON.parse(JSON.stringify(escrowSettings));
}

function loadEscrowSettings(saved) {
    escrowSettings = saved && saved.items ? JSON.parse(JSON.stringify(saved)) : { items: {} };
}

// Home screen "Escrow" button: open the selected budget on the Escrow tab
function openEscrow() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    editBudget();
    var tab = document.querySelector('#calculatorScreen .tab[onclick*="escrowTab"]');
    if (tab) tab.click();
}

document.getElementById('escrowBills').addEventListener('change', onEscrowBillsChange);
