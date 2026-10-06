// Income tab: people, how they enter pay, and take-home / Social Security / Medicare math.

// ── Income Earner Management ──

function addIncomeEarner(name) {
    var idx = incomeEarnerCount;
    incomeEarnerCount++;
    var container = document.getElementById('incomeEarnersContainer');
    var block = document.createElement('div');
    block.className = 'earner-block';
    block.id = 'earner_' + idx;
    block.innerHTML =
        '<div class="earner-header">' +
            '<h2>💰</h2>' +
            '<input type="text" class="earner-name-input" id="earnerName_' + idx + '" placeholder="Person ' + (idx + 1) + ' name">' +
            '<button class="remove-earner-btn" onclick="removeIncomeEarner(' + idx + ')">✕ Remove</button>' +
        '</div>' +
        '<div class="input-group">' +
            earnerSelect(idx, 'incomeMode', 'How do you want to enter pay?', [
                ['estimate', 'Estimate from salary or hourly rate'],
                ['net', 'I know my take-home pay']
            ]) +
        '</div>' +
        '<div class="mode-net input-group">' +
            earnerInput(idx, 'netPay', 'Take-Home Pay per Paycheck ($)', '2200') +
            earnerSelect(idx, 'payFrequency', 'How Often Are You Paid?', [
                ['26', 'Every two weeks'], ['52', 'Weekly'], ['24', 'Twice a month'], ['12', 'Monthly']
            ]) +
            earnerInput(idx, 'grossPay', 'Gross Pay per Paycheck ($, optional)', '3000') +
            earnerInput(idx, 'retirementPerCheck', 'Retirement per Paycheck ($, optional)', '300') +
        '</div>' +
        '<div class="mode-estimate">' +
            '<div class="input-group">' +
                earnerSelect(idx, 'payType', 'Pay Type', [['salary', 'Annual salary'], ['hourly', 'Hourly']]) +
                '<div class="pay-salary">' + earnerInput(idx, 'salary', 'Annual Salary ($)', '75000') + '</div>' +
                '<div class="pay-hourly">' + earnerInput(idx, 'hourlyRate', 'Hourly Rate ($)', '25') + '</div>' +
                '<div class="pay-hourly">' + earnerInput(idx, 'hoursPerWeek', 'Hours per Week', '40', 'data-plain') + '</div>' +
                earnerInput(idx, 'retirement', 'Retirement Contribution (%)', '10', 'data-percent') +
                earnerInput(idx, 'hsa', 'HSA via Payroll ($ annually)', '3000') +
                earnerInput(idx, 'taxRate', 'Federal Income Tax Rate (%)', '12', 'data-percent') +
                earnerInput(idx, 'stateIncomeTax', 'State/Local Income Tax Rate (%)', '4', 'data-percent') +
            '</div>' +
            '<label class="checkbox-row"><input type="checkbox" id="ficaIncluded_' + idx + '"> My tax rate already includes Social Security and Medicare</label>' +
        '</div>' +
        '<div class="earner-breakdown" id="earnerBreakdown_' + idx + '"></div>' +
        '<div class="input-group">' +
            earnerInput(idx, 'carAllowance', 'Monthly Car Allowance, not on paycheck ($)', '500') +
        '</div>' +
        '<div class="earner-subtotal">Monthly Take Home: $<span id="earnerResult_' + idx + '">0.00</span></div>';
    container.appendChild(block);
    document.getElementById('earnerName_' + idx).value = name || '';

    var onChange = function () { updateEarnerMode(idx); calculateAll(); };
    block.addEventListener('input', onChange);
    block.addEventListener('change', onChange);
    setupMoneyFormatting(block);
    updateEarnerMode(idx);

    updateRemoveButtons();
    isDirty = true;
    return idx;
}

// Every per-person income field, saved as "<field>_<idx>"
var EARNER_FIELDS = ['incomeMode', 'netPay', 'payFrequency', 'grossPay', 'retirementPerCheck',
    'payType', 'salary', 'hourlyRate', 'hoursPerWeek', 'retirement', 'hsa', 'taxRate',
    'stateIncomeTax', 'ficaIncluded', 'carAllowance'];
var EARNER_FIELD_PATTERN = new RegExp('^(' + EARNER_FIELDS.join('|') + ')_\\d+$');

// Yearly limit lives in js/tax-limits.js, which a GitHub workflow keeps current
var SOCIAL_SECURITY_WAGE_BASE = getSocialSecurityWageBase(new Date().getFullYear());
var SOCIAL_SECURITY_RATE = 0.062;
var MEDICARE_RATE = 0.0145;
var ADDITIONAL_MEDICARE_RATE = 0.009;
var ADDITIONAL_MEDICARE_THRESHOLD = 200000;  // per person; employers withhold above this regardless of filing status

function earnerInput(idx, field, label, placeholder, attrs) {
    var id = field + '_' + idx;
    return '<div class="input-field"><label for="' + id + '">' + label + '</label>' +
        '<input type="text" inputmode="decimal" id="' + id + '" placeholder="' + placeholder + '" ' + (attrs || '') + '></div>';
}

function earnerSelect(idx, field, label, options) {
    var id = field + '_' + idx;
    var html = '<div class="input-field"><label for="' + id + '">' + label + '</label><select id="' + id + '">';
    for (var i = 0; i < options.length; i++) html += '<option value="' + options[i][0] + '">' + options[i][1] + '</option>';
    return html + '</select></div>';
}

function getFieldValue(el) {
    if (el.type === 'checkbox') return el.checked ? 'true' : '';
    return el.value;
}

function setFieldValue(el, value) {
    if (el.type === 'checkbox') el.checked = value === 'true' || value === true;
    else el.value = value;
}

// Show only the fields for this person's chosen income mode and pay type
function updateEarnerMode(idx) {
    var block = document.getElementById('earner_' + idx);
    if (!block) return;
    block.dataset.mode = document.getElementById('incomeMode_' + idx).value;
    block.dataset.payType = document.getElementById('payType_' + idx).value;
}

// Annual figures for one person, plus monthly take-home and paycheck retirement
function computeEarner(idx) {
    var mode = document.getElementById('incomeMode_' + idx).value;
    var carAllowance = val('carAllowance_' + idx);

    if (mode === 'net') {
        var periods = parseInt(document.getElementById('payFrequency_' + idx).value);
        var net = val('netPay_' + idx) * periods;
        var gross = val('grossPay_' + idx) * periods;
        return {
            mode: mode,
            gross: gross,
            deductions: gross > 0 ? gross - net : 0,
            monthlyTakeHome: net / 12 + carAllowance,
            monthlyPaycheckRetirement: val('retirementPerCheck_' + idx) * periods / 12
        };
    }

    var gross;
    if (document.getElementById('payType_' + idx).value === 'hourly') {
        var hours = val('hoursPerWeek_' + idx) || 40;
        gross = val('hourlyRate_' + idx) * hours * 52;
    } else {
        gross = val('salary_' + idx);
    }
    var retirement = gross * (val('retirement_' + idx) / 100);
    var hsa = val('hsa_' + idx);

    // Payroll HSA is exempt from Social Security and Medicare; 401(k) contributions are not
    var ficaWages = Math.max(0, gross - hsa);
    var socialSecurity = 0, medicare = 0;
    if (!document.getElementById('ficaIncluded_' + idx).checked) {
        socialSecurity = Math.min(ficaWages, SOCIAL_SECURITY_WAGE_BASE) * SOCIAL_SECURITY_RATE;
        medicare = ficaWages * MEDICARE_RATE +
            Math.max(0, ficaWages - ADDITIONAL_MEDICARE_THRESHOLD) * ADDITIONAL_MEDICARE_RATE;
    }
    var taxableIncome = Math.max(0, gross - retirement - hsa);
    var incomeTax = taxableIncome * (val('taxRate_' + idx) + val('stateIncomeTax_' + idx)) / 100;
    var net = gross - retirement - hsa - socialSecurity - medicare - incomeTax;

    return {
        mode: mode,
        gross: gross,
        socialSecurity: socialSecurity,
        medicare: medicare,
        incomeTax: incomeTax,
        retirement: retirement,
        hsa: hsa,
        monthlyTakeHome: net / 12 + carAllowance,
        monthlyPaycheckRetirement: retirement / 12
    };
}

function renderEarnerBreakdown(idx, e) {
    var el = document.getElementById('earnerBreakdown_' + idx);
    if (!el) return;
    if (e.gross <= 0) { el.innerHTML = ''; return; }
    var rows = e.mode === 'net' ? [
        ['Gross pay', e.gross],
        ['Taxes and deductions', -e.deductions]
    ] : [
        ['Gross pay', e.gross],
        ['Social Security', -e.socialSecurity],
        ['Medicare', -e.medicare],
        ['Income tax', -e.incomeTax],
        ['Retirement', -e.retirement],
        ['HSA', -e.hsa]
    ];
    var html = '<div class="breakdown-title">Monthly paycheck breakdown</div>';
    for (var i = 0; i < rows.length; i++) {
        if (i > 0 && rows[i][1] === 0) continue;
        var amount = rows[i][1] / 12;
        html += '<div class="breakdown-row"><span>' + rows[i][0] + '</span><span>' +
            (amount < 0 ? '−$' : '$') + formatCurrency(Math.abs(amount)) + '</span></div>';
    }
    el.innerHTML = html;
}

function removeIncomeEarner(idx) {
    var block = document.getElementById('earner_' + idx);
    if (block) block.remove();
    updateRemoveButtons();
    isDirty = true;
    calculateAll();
}

function updateRemoveButtons() {
    var blocks = document.querySelectorAll('#incomeEarnersContainer .earner-block');
    var btns = document.querySelectorAll('#incomeEarnersContainer .remove-earner-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].style.display = blocks.length > 1 ? 'inline-block' : 'none';
    }
}

function getEarnerIndices() {
    var blocks = document.querySelectorAll('#incomeEarnersContainer .earner-block');
    var indices = [];
    for (var i = 0; i < blocks.length; i++) {
        var id = blocks[i].id.replace('earner_', '');
        indices.push(parseInt(id));
    }
    return indices;
}


function calculateIncome() {
    var indices = getEarnerIndices();
    var totalTakeHome = 0;

    for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        var earner = computeEarner(idx);
        renderEarnerBreakdown(idx, earner);
        setText('earnerResult_' + idx, formatCurrency(earner.monthlyTakeHome));
        totalTakeHome += earner.monthlyTakeHome;
    }

    setText('incomeResult', formatCurrency(totalTakeHome));
    return totalTakeHome;
}

// Monthly retirement taken out of paychecks (already excluded from take-home)
function calculatePaycheckRetirement() {
    var indices = getEarnerIndices();
    var total = 0;
    for (var i = 0; i < indices.length; i++) {
        total += computeEarner(indices[i]).monthlyPaycheckRetirement;
    }
    setText('paycheckRetirementResult', formatCurrency(total));
    document.getElementById('retirementWarning').style.display =
        total > 0 && val('retirement401k') > 0 ? 'block' : 'none';
    return total;
}

