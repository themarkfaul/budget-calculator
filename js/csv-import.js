// Bank / card CSV import. Runs entirely in the browser: the file is read locally,
// sorted into budget categories with keyword rules, reviewed, then applied.
// Relies on app.html globals: showScreen, calculateAll, formatAllInputs, escapeHtml,
// formatCurrency, val, isDirty.

var IMPORT_CATEGORIES = [
    { group: 'Spending', options: [
        ['groceries', 'Groceries'], ['gasoline', 'Gasoline'], ['eatingOut', 'Eating Out'],
        ['entertainment', 'Entertainment'], ['shopping', 'Shopping/Clothes'], ['hobbies', 'Hobbies'],
        ['tools', 'Tools/Equipment'], ['miscSpending', 'Miscellaneous']
    ] },
    { group: 'Utilities', options: [
        ['internet', 'Internet'], ['phone', 'Phone'], ['tv', 'TV/Streaming'],
        ['gas', 'Gas Utility'], ['electric', 'Electric'], ['water', 'Water']
    ] },
    { group: 'Other', options: [['skip', "Don't import"]] }
];

// Keywords matched as whole words in the lowercased description, apostrophes removed.
// First match wins, so more specific entries come before broader ones
// (e.g. "costco gas" before "costco", "uber eats" before "uber", "fios" before "verizon").
var IMPORT_RULES = compileImportRules([
    ['skip', ['payment', 'autopay', 'auto pay', 'thank you', 'transfer', 'xfer', 'zelle', 'venmo', 'cash app',
        'deposit', 'payroll', 'direct dep', 'atm', 'withdrawal', 'mortgage', 'loan pmt', 'loan payment', 'rent',
        'interest paid', 'irs', 'state farm', 'geico', 'progressive', 'allstate', 'liberty mutual', 'usaa']],
    ['gasoline', ['costco gas', 'sams club fuel', 'kroger fuel', 'shell', 'exxon', 'exxonmobil', 'mobil', 'bp',
        'chevron', 'marathon', 'speedway', 'sunoco', 'circle k', 'wawa', 'sheetz', 'quiktrip', 'qt', 'valero',
        'citgo', 'kwik', 'phillips 66', 'conoco', 'caseys', 'pilot', 'loves travel', 'thorntons', 'racetrac',
        'murphy usa', 'murphy express', 'gas station', 'fuel']],
    ['eatingOut', ['uber eats', 'ubereats', 'doordash', 'grubhub', 'postmates', 'mcdonalds', 'starbucks',
        'chick-fil-a', 'chickfila', 'wendys', 'taco bell', 'chipotle', 'subway', 'dominos', 'pizza', 'panera',
        'dunkin', 'burger king', 'kfc', 'arbys', 'sonic drive', 'panda express', 'five guys', 'skyline chili',
        'raising canes', 'culvers', 'cracker barrel', 'applebees', 'olive garden', 'outback', 'texas roadhouse',
        'buffalo wild', 'jimmy johns', 'potbelly', 'qdoba', 'noodles', 'zaxbys', 'popeyes', 'whataburger',
        'waffle house', 'ihop', 'dennys', 'red robin', 'chilis', 'longhorn', 'cheesecake factory', 'restaurant',
        'grill', 'cafe', 'bistro', 'diner', 'tavern', 'pub', 'brewing', 'coffee', 'bakery', 'tst*']],
    ['groceries', ['kroger', 'aldi', 'publix', 'safeway', 'whole foods', 'trader joes', 'costco', 'meijer', 'h-e-b',
        'heb', 'food lion', 'giant eagle', 'giant food', 'wegmans', 'sams club', 'instacart', 'albertsons',
        'sprouts', 'winco', 'piggly wiggly', 'hy-vee', 'fresh market', 'lidl', 'harris teeter', 'stop & shop',
        'shoprite', 'food city', 'ingles', 'save a lot', 'grocery', 'supermarket']],
    ['tv', ['netflix', 'hulu', 'disney+', 'disneyplus', 'disney plus', 'hbo', 'max.com', 'peacock', 'paramount',
        'youtube tv', 'youtubetv', 'sling', 'directv', 'dish network', 'apple tv', 'espn+', 'espn plus',
        'prime video', 'philo', 'fubo']],
    ['internet', ['fios', 'comcast', 'xfinity', 'spectrum', 'charter comm', 'cox comm', 'frontier', 'google fiber',
        'windstream', 'metronet', 'starlink', 'centurylink', 'brightspeed', 'optimum', 'mediacom']],
    ['phone', ['verizon', 't-mobile', 'tmobile', 'at&t', 'att', 'sprint', 'cricket', 'mint mobile', 'visible',
        'boost mobile', 'us cellular', 'google fi', 'consumer cellular', 'straight talk', 'tracfone']],
    ['electric', ['kentucky utilities', 'lg&e', 'lg and e', 'duke energy', 'aep', 'kentucky power', 'dominion energy',
        'xcel', 'pg&e', 'con ed', 'coned', 'fpl', 'georgia power', 'entergy', 'ameren', 'consumers energy',
        'dte energy', 'electric', 'power co', 'energy co', 'blue grass energy']],
    ['gas', ['columbia gas', 'atmos', 'delta natural gas', 'natural gas', 'spire', 'nicor', 'piedmont natural',
        'gas company', 'gas co']],
    ['water', ['kentucky american', 'american water', 'water co', 'water company', 'water dept', 'water works',
        'waterworks', 'sewer', 'sanitation', 'aqua america']],
    ['tools', ['home depot', 'lowes', 'harbor freight', 'menards', 'ace hardware', 'tractor supply',
        'northern tool', 'true value', 'hardware']],
    ['hobbies', ['hobby lobby', 'michaels', 'joann', 'guitar center', 'bass pro', 'cabelas', 'dicks sporting',
        'academy sports', 'rei', 'golf galaxy', 'scheels', 'game stop', 'gamestop']],
    ['entertainment', ['amc', 'regal', 'cinemark', 'cinema', 'theater', 'theatre', 'ticketmaster', 'stubhub',
        'seatgeek', 'steam', 'playstation', 'xbox', 'nintendo', 'spotify', 'apple music', 'audible', 'bowling',
        'topgolf', 'golf', 'museum', 'zoo', 'concert', 'eventbrite']],
    ['shopping', ['amazon', 'amzn', 'target', 'walmart', 'wal-mart', 'best buy', 'kohls', 'macys', 'tj maxx',
        'tjmaxx', 'marshalls', 'old navy', 'gap', 'nike', 'ebay', 'etsy', 'homegoods', 'ross', 'dillards',
        'nordstrom', 'shein', 'temu', 'belk', 'jcpenney', 'ulta', 'sephora', 'bath & body', 'apple store',
        'dollar general', 'dollar tree', 'family dollar', 'five below']]
]);

function compileImportRules(rules) {
    return rules.map(function (rule) {
        var escaped = rule[1].map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
        return [rule[0], new RegExp('(?:^|[^a-z0-9])(?:' + escaped.join('|') + ')(?![a-z0-9])')];
    });
}

// Bank-provided category text (Chase, Discover, Capital One, ...) used when no rule matches
var IMPORT_BANK_CATEGORY_RULES = [
    ['skip', /payment|credit|transfer|income|fees? & adj/],
    ['groceries', /grocer|supermarket/],
    ['gasoline', /gas|fuel|automotive/],
    ['eatingOut', /restaurant|dining|food ?& ?drink|fast food/],
    ['entertainment', /entertainment|recreation/],
    ['shopping', /shopping|merchandise|clothing/],
    ['tools', /home improvement|hardware/],
    ['hobbies', /hobb|sporting/]
];

var importState = null;
var IMPORT_MEMORY_KEY = 'csvImportMerchantCategories';

function openCsvImport() {
    var input = document.getElementById('csvFileInput');
    input.value = '';
    input.click();
}

function handleCsvFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
        try {
            startImportReview(file.name, String(reader.result));
        } catch (e) {
            alert(e.message);
        }
    };
    reader.onerror = function () { alert('That file could not be read.'); };
    reader.readAsText(file);
}

// ── Parsing ──

function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field); field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
            row = [];
        } else {
            field += c;
        }
    }
    row.push(field);
    if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
    return rows;
}

function parseAmount(str) {
    var s = String(str || '').trim();
    if (!s) return NaN;
    var negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[()$,\s+-]/g, '');
    if (!/^\d*\.?\d+$/.test(s)) return NaN;
    var n = parseFloat(s);
    return negative ? -n : n;
}

function parseDate(str) {
    var s = String(str || '').trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        var year = +m[3];
        if (year < 100) year += 2000;
        return new Date(year, +m[1] - 1, +m[2]);
    }
    return null;
}

function findColumn(headers, patterns) {
    for (var p = 0; p < patterns.length; p++) {
        for (var i = 0; i < headers.length; i++) {
            if (patterns[p].test(headers[i])) return i;
        }
    }
    return -1;
}

// Work out which columns hold the date, description and amount(s)
function detectColumns(rows) {
    var first = rows[0];
    var hasHeader = !first.some(function (cell) { return parseDate(cell) || !isNaN(parseAmount(cell)); });

    if (hasHeader) {
        var headers = first.map(function (h) { return h.trim().toLowerCase(); });
        var cols = {
            hasHeader: true,
            date: findColumn(headers, [/trans.*date/, /^date$/, /date/]),
            description: findColumn(headers, [/^description$/, /description/, /payee/, /merchant/, /^name$/, /memo/]),
            amount: findColumn(headers, [/^amount$/, /amount/]),
            debit: findColumn(headers, [/debit/, /withdrawal/]),
            credit: findColumn(headers, [/credit/, /deposit/]),
            category: findColumn(headers, [/category/])
        };
        if (cols.date < 0 || cols.description < 0 || (cols.amount < 0 && cols.debit < 0)) {
            throw new Error("This file's columns weren't recognized. It needs a date, a description, and an amount (or debit/credit) column.");
        }
        if (cols.amount >= 0) { cols.debit = -1; cols.credit = -1; }
        return cols;
    }

    // No header row (e.g. Wells Fargo): find columns by their contents
    var sample = rows.slice(0, 20);
    var cols = { hasHeader: false, date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1 };
    var longest = 0;
    for (var c = 0; c < first.length; c++) {
        var dates = 0, amounts = 0, length = 0;
        for (var r = 0; r < sample.length; r++) {
            var cell = sample[r][c] || '';
            if (parseDate(cell)) dates++;
            else if (!isNaN(parseAmount(cell))) amounts++;
            length += cell.length;
        }
        if (cols.date < 0 && dates > sample.length / 2) cols.date = c;
        else if (cols.amount < 0 && amounts > sample.length / 2) cols.amount = c;
        else if (length > longest) { longest = length; cols.description = c; }
    }
    if (cols.date < 0 || cols.amount < 0 || cols.description < 0) {
        throw new Error("This file's columns weren't recognized. It needs a date, a description, and an amount column.");
    }
    return cols;
}

function readTransactions(rows, cols) {
    var data = cols.hasHeader ? rows.slice(1) : rows;
    var parsed = [];
    var unreadable = 0;
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var date = parseDate(row[cols.date]);
        var amount;
        if (cols.amount >= 0) {
            amount = parseAmount(row[cols.amount]);
        } else {
            var debit = parseAmount(row[cols.debit]);
            var credit = parseAmount(row[cols.credit]);
            // Debit/credit layouts: purchases are debits; treat credits as negative
            amount = !isNaN(debit) && debit !== 0 ? Math.abs(debit) : (!isNaN(credit) ? -Math.abs(credit) : NaN);
        }
        if (!date || isNaN(amount) || amount === 0) { unreadable++; continue; }
        parsed.push({
            date: date,
            amount: amount,
            description: String(row[cols.description] || '').trim(),
            bankCategory: cols.category >= 0 ? String(row[cols.category] || '').trim() : ''
        });
    }

    // Purchases are whichever sign most rows have (cards and banks disagree on this)
    var negatives = parsed.filter(function (t) { return t.amount < 0; }).length;
    var purchaseSign = cols.amount >= 0 && negatives > parsed.length / 2 ? -1 : 1;
    var purchases = [], credits = 0;
    for (var j = 0; j < parsed.length; j++) {
        var spend = parsed[j].amount * purchaseSign;
        if (spend > 0) { parsed[j].amount = spend; purchases.push(parsed[j]); }
        else credits++;
    }
    return { purchases: purchases, credits: credits, unreadable: unreadable };
}

// ── Categorizing ──

// Strip bank boilerplate such as Wells Fargo's "PURCHASE AUTHORIZED ON 09/14" or
// "RECURRING PAYMENT AUTHORIZED ON 09/01" (which would otherwise trip the "payment" skip rule)
function cleanDescription(description) {
    return description
        .replace(/^\s*(recurring payment|purchase|purchase return) authorized on \d{1,2}\/\d{1,2}\s*/i, '')
        .replace(/^\s*(pos purchase|pos debit|debit card purchase|dbt crd|checkcard \d{4})\s*-?\s*/i, '')
        .trim();
}

function merchantKey(description) {
    var s = cleanDescription(description).toUpperCase()
        .replace(/^(SQ|TST|SP|PY|PP|DD|PAYPAL)\s?\*\s?/, '')
        .replace(/\s{2,}.*$/, '')
        .replace(/[^A-Z0-9&'.+ -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Drop store numbers and reference codes (any word containing a digit)
    var words = s.split(' ').filter(function (w) { return w && !/\d/.test(w); });
    // Two words keeps "HOME DEPOT" but drops trailing city names, so one store stays one row
    return words.slice(0, 2).join(' ') || description.trim().toUpperCase();
}

function categorize(description, bankCategory, remembered, key) {
    if (remembered[key]) return remembered[key];
    var text = cleanDescription(description).toLowerCase().replace(/['’]/g, '');
    for (var i = 0; i < IMPORT_RULES.length; i++) {
        if (IMPORT_RULES[i][1].test(text)) return IMPORT_RULES[i][0];
    }
    var bank = bankCategory.toLowerCase();
    if (bank) {
        for (var j = 0; j < IMPORT_BANK_CATEGORY_RULES.length; j++) {
            if (IMPORT_BANK_CATEGORY_RULES[j][1].test(bank)) return IMPORT_BANK_CATEGORY_RULES[j][0];
        }
    }
    return 'miscSpending';
}

function loadRememberedCategories() {
    try { return JSON.parse(localStorage.getItem(IMPORT_MEMORY_KEY)) || {}; }
    catch (e) { return {}; }
}

function rememberCategories(merchants) {
    try {
        var remembered = loadRememberedCategories();
        for (var i = 0; i < merchants.length; i++) {
            if (merchants[i].changed) remembered[merchants[i].key] = merchants[i].category;
        }
        localStorage.setItem(IMPORT_MEMORY_KEY, JSON.stringify(remembered));
    } catch (e) { /* storage unavailable; corrections just won't be remembered */ }
}

// ── Review screen ──

function startImportReview(fileName, text) {
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('That file has no transactions in it.');
    var cols = detectColumns(rows);
    var result = readTransactions(rows, cols);
    if (result.purchases.length === 0) throw new Error('No purchases were found in that file.');

    var remembered = loadRememberedCategories();
    var byKey = {};
    var merchants = [];
    var minDate = result.purchases[0].date, maxDate = minDate;
    for (var i = 0; i < result.purchases.length; i++) {
        var t = result.purchases[i];
        if (t.date < minDate) minDate = t.date;
        if (t.date > maxDate) maxDate = t.date;
        var key = merchantKey(t.description);
        if (!byKey[key]) {
            byKey[key] = { key: key, count: 0, total: 0, category: categorize(t.description, t.bankCategory, remembered, key), changed: false };
            merchants.push(byKey[key]);
        }
        byKey[key].count++;
        byKey[key].total += t.amount;
    }
    merchants.sort(function (a, b) { return b.total - a.total; });

    var days = (maxDate - minDate) / 86400000 + 1;
    importState = { merchants: merchants };

    document.getElementById('importMonths').value = Math.max(1, Math.round(days / 30.44 * 10) / 10);
    var info = escapeHtml(fileName) + ': ' + result.purchases.length + ' purchases from ' +
        minDate.toLocaleDateString() + ' to ' + maxDate.toLocaleDateString() + '.';
    if (result.credits) info += ' Skipped ' + result.credits + ' payments, refunds and credits.';
    if (result.unreadable) info += ' Skipped ' + result.unreadable + ' unreadable rows.';
    document.getElementById('importFileInfo').innerHTML = info;

    renderImportMerchants();
    renderImportTotals();
    showScreen('importScreen');
    window.scrollTo(0, 0);
}

function categorySelectHtml(index, selected) {
    var html = '<select onchange="changeImportCategory(' + index + ', this.value)">';
    for (var g = 0; g < IMPORT_CATEGORIES.length; g++) {
        html += '<optgroup label="' + IMPORT_CATEGORIES[g].group + '">';
        var options = IMPORT_CATEGORIES[g].options;
        for (var o = 0; o < options.length; o++) {
            html += '<option value="' + options[o][0] + '"' + (options[o][0] === selected ? ' selected' : '') + '>' + options[o][1] + '</option>';
        }
        html += '</optgroup>';
    }
    return html + '</select>';
}

function renderImportMerchants() {
    var merchants = importState.merchants;
    var html = '';
    for (var i = 0; i < merchants.length; i++) {
        var m = merchants[i];
        html += '<div class="import-row' + (m.category === 'skip' ? ' import-row-skipped' : '') + '">' +
            '<div class="import-merchant"><div class="import-merchant-name">' + escapeHtml(m.key) + '</div>' +
            '<div class="import-merchant-meta">' + m.count + (m.count === 1 ? ' purchase' : ' purchases') +
            ' · $' + formatCurrency(m.total) + '</div></div>' +
            categorySelectHtml(i, m.category) + '</div>';
    }
    document.getElementById('importMerchants').innerHTML = html;
}

function importMonths() {
    var months = parseFloat(document.getElementById('importMonths').value);
    return months > 0 ? months : 1;
}

// Monthly amount per budget field, rounded to whole dollars
function importMonthlyTotals() {
    var totals = {};
    var months = importMonths();
    for (var i = 0; i < importState.merchants.length; i++) {
        var m = importState.merchants[i];
        if (m.category === 'skip') continue;
        totals[m.category] = (totals[m.category] || 0) + m.total;
    }
    for (var field in totals) totals[field] = Math.round(totals[field] / months);
    return totals;
}

function renderImportTotals() {
    var totals = importMonthlyTotals();
    var html = '';
    for (var g = 0; g < IMPORT_CATEGORIES.length; g++) {
        var options = IMPORT_CATEGORIES[g].options;
        for (var o = 0; o < options.length; o++) {
            var field = options[o][0];
            if (!totals[field]) continue;
            html += '<div class="import-total"><span>' + options[o][1] + '</span><span>$' +
                formatCurrency(totals[field]) + '/mo</span></div>';
        }
    }
    document.getElementById('importTotals').innerHTML = html ||
        '<div class="import-total"><span>Nothing selected to import</span></div>';
}

function changeImportCategory(index, category) {
    var m = importState.merchants[index];
    m.category = category;
    m.changed = true;
    renderImportMerchants();
    renderImportTotals();
}

function cancelImport() {
    importState = null;
    showScreen('calculatorScreen');
}

function applyImport() {
    var totals = importMonthlyTotals();
    var add = document.getElementById('importApplyMode').value === 'add';
    for (var field in totals) {
        var input = document.getElementById(field);
        if (!input) continue;
        input.value = String(add ? val(field) + totals[field] : totals[field]);
    }
    rememberCategories(importState.merchants);
    importState = null;
    isDirty = true;
    calculateAll();
    formatAllInputs();
    showScreen('calculatorScreen');
}
