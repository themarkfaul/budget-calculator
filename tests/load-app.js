// Loads the real app.html and the app's own scripts into a simulated browser (jsdom),
// so tests exercise exactly the code that's deployed. Supabase is replaced with a
// stand-in that never touches the network, and the startup script (main.js) is skipped.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

// Scripts in the order app.html loads them, minus Supabase setup and startup
const APP_SCRIPTS = [
    'js/auth.js', 'js/db.js', 'js/tax-limits.js', 'js/mortgage-rates.js', 'js/mortgage-market.js',
    'js/mortgage-handoff.js', 'js/csv-import.js', 'js/state.js', 'js/helpers.js', 'js/screens.js',
    'js/income.js', 'js/education.js', 'js/other-expenses.js', 'js/budget-editor.js', 'js/calculations.js'
];

// Fixed rates so tests don't change every week when the workflow updates js/mortgage-rates.js
const TEST_MORTGAGE_RATES = {
    source: 'test', sourceUrl: 'https://example.com', asOf: '2026-10-01', rate30: 7.28, rate15: 6.6
};

function loadApp() {
    const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');   // the tests load scripts themselves
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/app.html' });
    const w = dom.window;

    w.eval(`var supabase = { auth: {}, from: function () { throw new Error('no database in tests'); } };`);
    for (const file of APP_SCRIPTS) {
        w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8') + '\n//# sourceURL=' + file);
    }
    w.MORTGAGE_RATES = TEST_MORTGAGE_RATES;
    w.alert = () => {};
    w.confirm = () => true;
    return w;
}

// Sets a field the way typing would, then recalculates
function setField(w, id, value) {
    const el = w.document.getElementById(id);
    if (!el) throw new Error('No field with id ' + id);
    if (el.type === 'checkbox') el.checked = value;
    else el.value = String(value);
    w.calculateAll();
}

// Fresh, empty budget with one income earner and one education person
function newBudget(w) {
    w.startBlankBudget();
}

// Money text like "$1,234.56" or "-$866.50" → number
function money(text) {
    return parseFloat(String(text).replace(/[$,]/g, ''));
}

function text(w, id) {
    return w.document.getElementById(id).textContent;
}

// Copies data out of the simulated browser so deepEqual compares contents only
// (arrays and objects made inside jsdom have different prototypes from Node's)
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = { loadApp, setField, newBudget, money, text, plain };
