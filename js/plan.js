// Plan Ahead: "what if" changes to a budget (buy a house, a boat, join a club, save for college,
// change 401(k), ...). The changes are applied to a copy of the open budget, which becomes a new
// unsaved budget with its own Self-Escrow plan. A before/after view runs the same health checks as
// Evaluate and suggests where to trim so the new plan works.
//
// planBase: the budget the plan starts from ({ data, name, budget, editMode }), kept so the plan can
// be rebuilt from the original after the user changes it, or undone.

var planBase = null;
var planChanges = [];
var planNextId = 1;
var planBuilt = false;
var planCuts = [];   // suggested trims shown for the current plan
var planBefore = null;   // the original budget's { data, summary }, for the before/after view

function planMarketRate() {
    var m = typeof marketRateFor === 'function' ? marketRateFor(30) : null;
    return m && m.rate ? String(m.rate) : '6.5';
}

function earnerChoices() {
    return getEarnerIndices().map(function (idx, n) {
        var name = document.getElementById('earnerName_' + idx).value.trim() || 'Person ' + (n + 1);
        return [String(idx), name];
    });
}

// Budget lines whose amount can be changed directly, for "Change an amount"
function changeableLines() {
    var lines = actualLines().filter(function (l) { return budgetFieldFor(l.key); });
    savingsItems().forEach(function (s) { lines.push({ key: s.key, group: 'Savings', name: s.name, monthly: s.monthly }); });
    return lines;
}

function lineFieldFor(key) {
    if (document.getElementById('savingsRow_' + key)) return { id: key, annual: false };
    return budgetFieldFor(key);
}

// Each kind of change: the fields it asks for, its monthly cost preview, and how it changes the budget.
// Field: [name, label, kind ('money' | 'percent' | 'years' | 'select' | 'text'), default (value or function)]
var PLAN_TYPES = {
    house: {
        icon: '🏡', title: 'Buy a new house',
        note: 'Replaces your current home or rent in the new budget.',
        fields: [
            ['price', 'Home price', 'money', function () { return val('houseValue') > 0 && document.getElementById('housingMode').value === 'own' ? String(Math.round(val('houseValue') * 1.3)) : '400000'; }],
            ['down', 'Down payment', 'money', function (v) { return String(Math.round(num(v.price || '400000') * 0.2)); }],
            ['rate', 'Interest rate (%)', 'percent', planMarketRate],
            ['term', 'Loan length (years)', 'years', '30'],
            ['taxRate', 'Property tax rate (% a year)', 'percent', function () { var t = val('stateTaxRate') + val('countyTaxRate') + val('localTaxRate'); return t > 0 ? String(Math.round(t * 1000) / 1000) : '1'; }],
            ['insurance', 'Home insurance (a year)', 'money', '2000']
        ],
        monthly: function (v) {
            return loanPayment(Math.max(0, num(v.price) - num(v.down)), num(v.rate), num(v.term)) + num(v.price) * num(v.taxRate) / 100 / 12 + num(v.insurance) / 12;
        },
        // Compared with today's housing, which it replaces
        cost: function (v) { return this.monthly(v) - (planBase ? planBase.housing : 0); },
        apply: function (v) {
            setPlanField('housingMode', 'own');
            setPlanField('houseValue', v.price); setPlanField('propertyValue', v.price);
            setPlanField('mortgageDownPayment', v.down); setPlanField('mortgageRate', v.rate); setPlanField('mortgageTerm', v.term);
            setPlanField('stateTaxRate', v.taxRate); setPlanField('countyTaxRate', '0'); setPlanField('localTaxRate', '0');
            setPlanField('homeInsurance', v.insurance);
        }
    },
    vacation: {
        icon: '🏖️', title: 'Buy a vacation home',
        fields: [
            ['price', 'Price', 'money', '300000'],
            ['down', 'Down payment', 'money', function (v) { return String(Math.round(num(v.price || '300000') * 0.2)); }],
            ['rate', 'Interest rate (%)', 'percent', function () { return String(Math.round((parseFloat(planMarketRate()) + 0.5) * 100) / 100); }],
            ['term', 'Loan length (years)', 'years', '30'],
            ['taxInsurance', 'Property tax + insurance (a year)', 'money', '5000'],
            ['upkeep', 'Upkeep, HOA and utilities (a month)', 'money', '400']
        ],
        monthly: function (v) { return loanPayment(Math.max(0, num(v.price) - num(v.down)), num(v.rate), num(v.term)) + num(v.taxInsurance) / 12 + num(v.upkeep); },
        apply: function (v) {
            addOtherExpense('Vacation home mortgage', money2(loanPayment(Math.max(0, num(v.price) - num(v.down)), num(v.rate), num(v.term))), 'want');
            addOtherExpense('Vacation home tax & insurance', money2(num(v.taxInsurance) / 12), 'want');
            addOtherExpense('Vacation home upkeep', money2(num(v.upkeep)), 'want');
        }
    },
    club: {
        icon: '⛳', title: 'Join a country club',
        fields: [
            ['dues', 'Monthly dues', 'money', '500'],
            ['minimum', 'Food & drink minimum (a year)', 'money', '1200'],
            ['initiation', 'Initiation fee (one time)', 'money', '10000'],
            ['months', 'Months to save for the initiation fee', 'years', '12']
        ],
        monthly: function (v) { return num(v.dues) + num(v.minimum) / 12 + (num(v.months) > 0 ? num(v.initiation) / num(v.months) : 0); },
        apply: function (v) {
            addOtherExpense('Country club', money2(num(v.dues) + num(v.minimum) / 12), 'want');
            if (num(v.initiation) > 0) addSavingsItem(null, 'Country club initiation fee', money2(num(v.initiation) / Math.max(1, num(v.months))));
        }
    },
    boat: {
        icon: '🚤', title: 'Buy a boat',
        fields: [
            ['price', 'Price', 'money', '60000'],
            ['down', 'Down payment', 'money', '12000'],
            ['rate', 'Interest rate (%)', 'percent', '8'],
            ['term', 'Loan length (years)', 'years', '10'],
            ['insurance', 'Insurance (a year)', 'money', '1000'],
            ['upkeep', 'Storage, fuel and upkeep (a month)', 'money', '400']
        ],
        monthly: function (v) { return loanPayment(Math.max(0, num(v.price) - num(v.down)), num(v.rate), num(v.term)) + num(v.insurance) / 12 + num(v.upkeep); },
        apply: function (v) {
            addOtherExpense('Boat loan', money2(loanPayment(Math.max(0, num(v.price) - num(v.down)), num(v.rate), num(v.term))), 'want');
            addOtherExpense('Boat insurance, storage & upkeep', money2(num(v.insurance) / 12 + num(v.upkeep)), 'want');
        }
    },
    college: {
        icon: '🎓', title: 'Save for college',
        note: 'Sets the College Fund line on the Savings tab to what the goal needs (before any investment growth).',
        fields: [
            ['goal', 'College goal', 'money', '100000'],
            ['saved', 'Already saved', 'money', '0'],
            ['years', 'Years until college', 'years', '15']
        ],
        monthly: function (v) { return Math.max(0, num(v.goal) - num(v.saved)) / Math.max(1, num(v.years) * 12); },
        cost: function (v) { return this.monthly(v) - val('collegeFund'); },
        apply: function (v) {
            addSavingsItem('collegeFund');
            setPlanField('collegeFund', money2(this.monthly(v)));
        }
    },
    invest: {
        icon: '📈', title: 'Save more to investments',
        fields: [['extra', 'Extra each month', 'money', '500']],
        monthly: function (v) { return num(v.extra); },
        apply: function (v) {
            addSavingsItem('investmentAccount');
            setPlanField('investmentAccount', money2(val('investmentAccount') + num(v.extra)));
        }
    },
    retirement: {
        icon: '🏦', title: 'Change 401(k) contributions',
        fields: [
            ['who', 'Whose paycheck', 'select', function () { return (earnerChoices()[0] || [''])[0]; }, earnerChoices],
            ['percent', 'New contribution (% of pay)', 'percent', function (v) { var id = 'retirement_' + (v.who || (earnerChoices()[0] || [''])[0]); return document.getElementById(id) && val(id) ? String(val(id) + 2) : '10'; }]
        ],
        noteFor: function (v) {
            var mode = document.getElementById('incomeMode_' + v.who);
            return mode && mode.value === 'net' ? "This person's pay is entered as take-home pay, so the app can't work out the new paycheck. Switch them to \"Estimate from salary\" on the Income tab, or enter the new take-home there after building." : '';
        },
        monthly: null,   // shown from the rebuilt budget: it changes taxes and take-home
        apply: function (v) {
            if (!document.getElementById('retirement_' + v.who)) return;
            setPlanField('retirement_' + v.who, v.percent);
        }
    },
    change: {
        icon: '✏️', title: 'Change an amount',
        fields: [
            ['line', 'Budget line', 'select', function () { var l = changeableLines()[0]; return l ? l.key : ''; }, function () { return changeableLines().map(function (l) { return [l.key, l.group + ': ' + l.name]; }); }],
            ['amount', 'New amount (a month)', 'money', function (v) { var l = changeableLines().filter(function (x) { return x.key === v.line; })[0]; return l ? String(Math.round(l.monthly * 100) / 100) : '0'; }]
        ],
        monthly: function (v) { return num(v.amount); },
        cost: function (v) { var l = changeableLines().filter(function (x) { return x.key === v.line; })[0]; return num(v.amount) - (l ? l.monthly : 0); },
        apply: function (v) {
            var f = lineFieldFor(v.line);
            if (f) setPlanField(f.id, money2(f.annual ? num(v.amount) * 12 : num(v.amount)));
        }
    },
    other: {
        icon: '➕', title: 'Add something else',
        fields: [
            ['name', 'What is it?', 'text', ''],
            ['amount', 'Cost a month', 'money', '100'],
            ['type', 'Need or want', 'select', 'want', function () { return [['need', 'Need'], ['want', 'Want']]; }]
        ],
        monthly: function (v) { return num(v.amount); },
        apply: function (v) { addOtherExpense(v.name.trim() || 'New expense', money2(num(v.amount)), v.type); }
    }
};

function num(s) { return parseFloat(String(s || '').replace(/,/g, '')) || 0; }
function money2(n) { return String(Math.round(n * 100) / 100); }

function setPlanField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    var plain = el.tagName === 'SELECT' || el.hasAttribute('data-percent') || el.hasAttribute('data-plain');
    el.value = plain ? String(value) : formatMoneyValue(String(value));
}

// ── Opening ──

function openPlan() {
    if (!selectedBudget) { showToast('Select a budget first.', 'info'); return; }
    editBudget();
    showPlanScreen();
}

function showPlanScreen() {
    if (!planBase) {
        planBase = { data: gatherCalculatorData(), name: currentEditingBudget ? currentEditingBudget.name : '', budget: currentEditingBudget,
            editMode: isEditMode, housing: calculateHousing() };
        planChanges = [];
        planBuilt = false;
    }
    setText('planTitle', '🔮 Plan Ahead' + (planBase.name ? ': ' + planBase.name : ''));
    renderPlanChoices();
    renderPlanChanges();
    document.getElementById('planResult').style.display = planBuilt ? '' : 'none';
    showScreen('planScreen');
    window.scrollTo(0, 0);
}

function renderPlanChoices() {
    document.getElementById('planChoices').innerHTML = Object.keys(PLAN_TYPES).map(function (type) {
        var t = PLAN_TYPES[type];
        return '<button class="suggestion-chip" data-plan-add="' + type + '">' + t.icon + ' ' + t.title + '</button>';
    }).join('');
}

function addPlanChange(type) {
    var t = PLAN_TYPES[type];
    var change = { id: planNextId++, type: type, values: {} };
    t.fields.forEach(function (f) {
        change.values[f[0]] = typeof f[3] === 'function' ? f[3](change.values) : f[3];
    });
    planChanges.push(change);
    renderPlanChanges();
    return change;
}

function removePlanChange(id) {
    planChanges = planChanges.filter(function (c) { return c.id !== id; });
    renderPlanChanges();
}

function planChangeCost(change) {
    var t = PLAN_TYPES[change.type];
    if (t.cost) return t.cost(change.values);
    return t.monthly ? t.monthly(change.values) : null;
}

function renderPlanChanges() {
    var box = document.getElementById('planChanges');
    if (!planChanges.length) {
        box.innerHTML = '<p class="other-intro" style="text-align:center;">Pick one or more changes above. You can combine them, like a new house and more for college.</p>';
    } else {
        box.innerHTML = planChanges.map(function (c) {
            var t = PLAN_TYPES[c.type];
            var fields = t.fields.map(function (f) {
                var id = 'plan_' + c.id + '_' + f[0];
                var input;
                if (f[2] === 'select') {
                    var options = f[4] ? f[4]() : [];
                    input = '<select id="' + id + '" data-plan-id="' + c.id + '" data-plan-field="' + f[0] + '">' + options.map(function (o) {
                        return '<option value="' + escapeHtml(o[0]) + '"' + (o[0] === c.values[f[0]] ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>';
                    }).join('') + '</select>';
                } else {
                    var attrs = f[2] === 'text' ? 'type="text"' : 'type="text" inputmode="decimal"';
                    input = '<input ' + attrs + ' id="' + id + '" data-plan-id="' + c.id + '" data-plan-field="' + f[0] + '" value="' +
                        escapeHtml(f[2] === 'money' ? formatMoneyValue(c.values[f[0]]) : c.values[f[0]]) + '">';
                }
                return '<div class="input-field"><label for="' + id + '">' + escapeHtml(f[1]) + '</label>' + input + '</div>';
            }).join('');
            var note = t.noteFor ? t.noteFor(c.values) : t.note;
            return '<div class="plan-change" id="planChange_' + c.id + '">' +
                '<div class="plan-change-head"><h3>' + t.icon + ' ' + t.title + '</h3>' +
                '<button class="remove-other-btn" data-plan-remove="' + c.id + '" aria-label="Remove this change">✕</button></div>' +
                (note ? '<p class="plan-note">' + escapeHtml(note) + '</p>' : '') +
                '<div class="input-group">' + fields + '</div>' +
                '<div class="plan-cost" id="planCost_' + c.id + '">' + planCostText(c) + '</div></div>';
        }).join('');
    }
    document.getElementById('planBuildBtn').disabled = !planChanges.length;
}

function planCostText(change) {
    var cost = planChangeCost(change);
    if (cost === null) return 'Changes your taxes and take-home pay: see the result after building.';
    var total = PLAN_TYPES[change.type].monthly(change.values);
    var vs = change.type === 'house' ? ' (' + money(total) + ' a month in all, compared with ' + money(planBase.housing) + ' for housing today)' : '';
    if (Math.abs(cost) < 0.005) return 'No change to your monthly costs.' + vs;
    return (cost > 0 ? 'Adds about ' : 'Saves about ') + money(Math.abs(cost)) + ' a month' + (vs || '.');
}

function onPlanInput(e) {
    var el = e.target;
    if (!el.dataset.planId) return;
    var change = planChanges.filter(function (c) { return c.id === parseInt(el.dataset.planId, 10); })[0];
    if (!change) return;
    change.values[el.dataset.planField] = el.value;
    // Picking another line or person refreshes the fields that depend on it
    if (el.tagName === 'SELECT' && (el.dataset.planField === 'line' || el.dataset.planField === 'who')) {
        var t = PLAN_TYPES[change.type];
        t.fields.forEach(function (f) {
            if (f[0] !== el.dataset.planField && f[2] !== 'select' && typeof f[3] === 'function') change.values[f[0]] = f[3](change.values);
        });
        renderPlanChanges();
        return;
    }
    setText('planCost_' + change.id, planCostText(change));
}

// ── Building the new budget ──

function planSnapshot() {
    return { data: gatherCalculatorData(), summary: buildSummary() };
}

function buildPlan() {
    if (!planChanges.length) return;
    // Always start again from the original budget, so changing the plan doesn't stack changes
    loadBudgetDataIntoCalculator({ data: planBase.data });
    var before = planBefore = planSnapshot();
    planChanges.forEach(function (c) { PLAN_TYPES[c.type].apply.call(PLAN_TYPES[c.type], c.values); });
    calculateAll();
    formatAllInputs();
    currentEditingBudget = null;
    isEditMode = false;
    isDirty = true;
    setText('calculatorTitle', 'New Budget (plan' + (planBase.name ? ' from ' + planBase.name : '') + ')');
    setEscrowTitle('');
    planBuilt = true;
    renderPlanResult(before, planSnapshot());
    var result = document.getElementById('planResult');
    result.style.display = '';
    if (result.scrollIntoView) result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Before / after ──

function renderPlanResult(before, after) {
    var rows = COMPARE_ROWS.map(function (row) { return [row[0], row[1](before.summary), row[1](after.summary), row[2]]; });
    var html = '<table class="compare-table plan-table"><thead><tr><th></th><th>Now</th><th>With your plan</th></tr></thead><tbody>';
    rows.forEach(function (r) {
        if (r[1] === null || r[2] === null) return;
        var cls = r[0] === 'Left over' ? ' class="compare-' + balanceStatus(r[2]) + '"' : '';
        html += '<tr><th scope="row">' + r[0] + '</th><td><div class="compare-value">' + formatSignedMoney(r[1]) + '</div></td>' +
            '<td' + cls + '><div class="compare-value">' + formatSignedMoney(r[2]) + '</div>' + compareDiffHtml(r[2] - r[1], r[3]) + '</td></tr>';
    });
    var b = computeHealthCheck(before), a = computeHealthCheck(after);
    [['Balanced budget', 'balancePass'], ['25% housing rule', 'housingPass'], ['50/30/20 rule', 'ruleOf503020Pass']].forEach(function (rule) {
        html += '<tr class="compare-check-row"><th scope="row">' + rule[0] + '</th><td>' + (b[rule[1]] ? '✅ Pass' : '❌ Not yet') +
            '</td><td>' + (a[rule[1]] ? '✅ Pass' : '❌ Not yet') + '</td></tr>';
    });
    html += '<tr class="compare-check-row"><th scope="row">Needs / wants / savings</th><td>' + split(b) + '</td><td>' + split(a) + '</td></tr>';
    document.getElementById('planCompare').innerHTML = html + '</tbody></table>';

    var verdict;
    if (a.balancePass && a.housingPass && a.ruleOf503020Pass) verdict = '✅ Your plan works: the budget balances and passes every health check.';
    else if (a.balancePass) verdict = '🟡 Your plan balances, but some health checks don\'t pass yet. The ideas below can help.';
    else verdict = '❌ Your plan costs ' + money(-a.remaining) + ' a month more than you take home. The ideas below show where it could come from.';
    setText('planVerdict', verdict);
    document.getElementById('planVerdict').className = 'plan-verdict plan-verdict-' + (a.balancePass ? (a.housingPass && a.ruleOf503020Pass ? 'good' : 'ok') : 'bad');
    renderPlanIdeas(a);
}

function split(c) {
    return Math.round(c.needsPercent) + '% / ' + Math.round(c.wantsPercent) + '% / ' + Math.round(c.savingsPercent) + '%';
}

// ── Ideas to make the plan work ──

// Wants the user could trim, biggest first: day-to-day spending and "want" lines on the Other tab
function trimmableWants() {
    var items = [];
    ['eatingOut', 'entertainment', 'shopping', 'hobbies', 'tools', 'miscSpending'].forEach(function (id) {
        if (val(id) > 0) items.push({ id: id, name: fieldLabel(id), monthly: val(id) });
    });
    getOtherExpenseIndices().forEach(function (idx) {
        if (document.getElementById('otherType_' + idx).value !== 'want' || !(val('otherAmount_' + idx) > 0)) return;
        items.push({ id: 'otherAmount_' + idx, name: document.getElementById('otherName_' + idx).value.trim() || 'Other expense', monthly: val('otherAmount_' + idx) });
    });
    return items.sort(function (x, y) { return y.monthly - x.monthly; });
}

// Trims (25% of each want, biggest first) that together cover a shortfall
function suggestCuts(shortfall) {
    var cuts = [], covered = 0;
    trimmableWants().forEach(function (item) {
        if (covered >= shortfall - 0.005) return;
        var cut = Math.min(Math.round(item.monthly * 0.25), Math.ceil(shortfall - covered));
        if (cut < 5) return;
        cuts.push({ id: item.id, name: item.name, from: item.monthly, to: item.monthly - cut, saves: cut });
        covered += cut;
    });
    return { cuts: cuts, covered: covered };
}

// Lines where the uploaded actual spending has averaged less than planned
function actualSavingsIdeas() {
    if (typeof actualMonthKeys !== 'function') return [];
    var months = actualMonthKeys().filter(function (ym) { return !isPartialMonth(ym); });
    if (months.length < 2) return [];
    var ideas = [];
    actualLines().forEach(function (line) {
        if (line.group !== 'Spending' || !(line.monthly > 0)) return;
        var avg = months.reduce(function (s, ym) { return s + lineActual(ym, line.key); }, 0) / months.length;
        if (line.monthly - avg >= 25) ideas.push({ name: line.name, planned: line.monthly, avg: avg });
    });
    return ideas;
}

function renderPlanIdeas(check) {
    var ideas = [];
    var shortfall = Math.max(0, -check.remaining);
    var wantsOver = check.wantsPercent > 30 ? check.wants - 0.3 * (check.needs + check.wants + check.savings) : 0;
    planCuts = [];

    var target = Math.max(shortfall, wantsOver);
    if (target > 0) {
        var s = suggestCuts(target);
        planCuts = s.cuts;
        if (s.cuts.length) {
            ideas.push('<p><strong>Trim some wants</strong> (about a quarter of each, biggest first) to free ' + money(s.covered) + ' a month:</p><ul>' +
                s.cuts.map(function (c) { return '<li>' + escapeHtml(c.name) + ': ' + money(c.from) + ' → ' + money(c.to) + ' (saves ' + money(c.saves) + ')</li>'; }).join('') +
                '</ul><button class="btn btn-success" data-plan-apply-cuts>Apply these trims to the new budget</button>');
        }
        if (s.covered < target - 0.005) {
            ideas.push('<p>Trimming wants covers ' + money(s.covered) + ' of the ' + money(target) + ' needed. You may also need to lower the plan\'s cost (a smaller loan, a bigger down payment, or a later start date) or raise income.</p>');
        }
    }
    actualSavingsIdeas().forEach(function (i) {
        ideas.push('<p>Your uploaded bank charges show <strong>' + escapeHtml(i.name) + '</strong> averaging ' + money(i.avg) + ' a month, below the ' + money(i.planned) +
            ' planned. Planning closer to what you really spend frees ' + money(i.planned - i.avg) + '.</p>');
    });
    if (!check.housingPass) {
        var tip = 'A lower price, a bigger down payment or a lower rate brings it down.';
        // With a new house in the plan, its whole cost scales with the price (same down payment %)
        var house = planChanges.filter(function (c) { return c.type === 'house'; })[0];
        if (house && num(house.values.price) > 0) {
            var perDollar = PLAN_TYPES.house.monthly(house.values) / num(house.values.price);
            var fits = Math.floor(check.housingLimit / perDollar / 5000) * 5000;
            var downPct = Math.round(num(house.values.down) / num(house.values.price) * 100);
            if (fits > 0) tip = 'With the same ' + downPct + '% down and rate, a home around <strong>' + money(fits).replace('.00', '') + '</strong> keeps housing within 25%.';
        }
        ideas.push('<p><strong>Housing</strong> is ' + Math.round(check.housingPercent) + '% of take-home pay; the guideline is 25% (' + money(check.housingLimit) + '). ' + tip + '</p>');
    }
    if (check.savingsPercent < 20) {
        ideas.push('<p><strong>Savings</strong> are ' + Math.round(check.savingsPercent) + '% of income; the guideline is at least 20%. ' +
            (check.remaining > 0 ? 'Putting some of the ' + money(check.remaining) + ' left over each month into savings would help.' : 'Freeing money above would let you save more.') + '</p>');
    }
    if (check.remaining > 0 && check.ruleOf503020Pass) {
        ideas.push('<p>You\'d still have ' + money(check.remaining) + ' left over each month.</p>');
    }
    document.getElementById('planIdeas').innerHTML = ideas.length ? ideas.join('') : '<p>Nothing to change: this plan fits your budget.</p>';
}

function applyPlanCuts() {
    if (!planCuts.length || !planBefore) return;
    planCuts.forEach(function (c) { setPlanField(c.id, money2(c.to)); });
    calculateAll();
    formatAllInputs();
    isDirty = true;
    renderPlanResult(planBefore, planSnapshot());
    showToast('Trims applied to the new budget.', 'success');
}

// ── Finishing ──

async function savePlan() {
    var defaultName = (planBase.name || 'My Budget') + ' (plan)';
    var name = prompt('Name for the new budget:', defaultName);
    if (!name) return;
    try {
        var saved = await saveBudgetToDb({ name: name, data: gatherCalculatorData(), summary: buildSummary() });
        currentEditingBudget = saved;
        isEditMode = true;
        isDirty = false;
        setText('calculatorTitle', 'Editing: ' + saved.name);
        setEscrowTitle(saved.name);
        planBase = null;
        planBuilt = false;
        showToast('Saved "' + name + '". Your original budget is unchanged.', 'success');
        showScreen('calculatorScreen');
        window.scrollTo(0, 0);
    } catch (e) {
        showToast(isNetworkError(e) ? "You're offline, so this couldn't be saved. Try again when you're back online." : "Couldn't save: " + e.message, 'error');
    }
}

function editPlanBudget() {
    showScreen('calculatorScreen');
    window.scrollTo(0, 0);
}

// Back to the original budget, as it was before planning
function discardPlan() {
    if (!planBase) return;
    if (planBuilt && !confirm('Throw away this plan and go back to your original budget?')) return;
    loadBudgetDataIntoCalculator({ data: planBase.data });
    currentEditingBudget = planBase.budget;
    isEditMode = planBase.editMode;
    setText('calculatorTitle', currentEditingBudget ? 'Editing: ' + currentEditingBudget.name : 'Create New Budget');
    setEscrowTitle(currentEditingBudget ? currentEditingBudget.name : '');
    isDirty = false;
    planBase = null;
    planBuilt = false;
    planChanges = [];
    showScreen('calculatorScreen');
    window.scrollTo(0, 0);
}

// Leaving the budget ends the plan
function resetPlan() {
    planBase = null;
    planBefore = null;
    planBuilt = false;
    planChanges = [];
}

document.getElementById('planScreen').addEventListener('click', function (e) {
    var t = e.target.closest('[data-plan-add], [data-plan-remove], [data-plan-apply-cuts]');
    if (!t) return;
    if (t.dataset.planAdd) addPlanChange(t.dataset.planAdd);
    else if (t.dataset.planRemove) removePlanChange(parseInt(t.dataset.planRemove, 10));
    else applyPlanCuts();
});
document.getElementById('planChanges').addEventListener('input', onPlanInput);
document.getElementById('planChanges').addEventListener('change', onPlanInput);
