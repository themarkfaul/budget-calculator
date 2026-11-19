// Grey suggested values: accepting them, typing 0, the per-user setting, and the live mortgage rate.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, setField, newBudget } = require('./load-app');

let w;
before(() => { w = loadApp(); w.setupSuggestions(); });
beforeEach(() => { w.setSuggestionMode('tap'); newBudget(w); });

const field = id => w.document.getElementById(id);
const chip = () => w.document.getElementById('suggestionChip');
const chipShown = () => !!chip() && chip().style.display !== 'none';
function enter(el) {
    el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

test('a typed 0 stays 0 instead of bringing the grey suggestion back', () => {
    const tv = field('tv');
    tv.focus();
    tv.value = '0';
    tv.blur();
    assert.equal(tv.value, '0');
    assert.equal(w.formatMoneyValue(''), '');
    assert.equal(w.formatMoneyValue('1234.5'), '1,234.50');
});

test('tap mode: clicking into an empty field shows a "Use" button that fills it in', () => {
    const tv = field('tv');
    tv.focus();
    assert.ok(chipShown());
    assert.equal(chip().textContent, 'Use $60');
    chip().click();
    assert.equal(tv.value, '60');
    assert.ok(!chipShown());
    assert.equal(w.val('tv'), 60);
});

test('tap mode: Enter accepts; leaving without typing sets 0', () => {
    const tv = field('tv');
    tv.focus();
    enter(tv);
    assert.equal(tv.value, '60');

    const phone = field('phone');
    phone.focus();
    phone.blur();
    assert.equal(phone.value, '0');
    assert.equal(w.val('phone'), 0);
});

test('typing hides the button, and a typed value is never replaced', () => {
    const tv = field('tv');
    tv.focus();
    tv.value = '45';
    tv.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.ok(!chipShown());
    enter(tv);
    tv.blur();
    assert.equal(tv.value, '45');
});

test('leave mode: Tab or clicking away accepts the suggestion', () => {
    w.setSuggestionMode('leave');
    const tv = field('tv');
    tv.focus();
    tv.blur();
    assert.equal(tv.value, '60');
    const rate = field('carRate');
    rate.focus();
    rate.blur();
    assert.equal(rate.value, '7');
});

test('prefill mode: new blank budgets start with suggestions, except income and education', () => {
    w.setSuggestionMode('prefill');
    newBudget(w);
    assert.equal(field('tv').value, '60');
    assert.equal(field('houseValue').value, '350,000');
    assert.equal(field('netPay_' + w.getEarnerIndices()[0]).value, '');
    assert.equal(w.document.querySelector('#educationTab input[id^="tuition_"]').value, '');
    // Other modes leave new budgets empty
    w.setSuggestionMode('tap');
    newBudget(w);
    assert.equal(field('tv').value, '');
});

test('unknown or missing setting falls back to the default', () => {
    w.setSuggestionMode(undefined);
    assert.equal(w.suggestionMode, 'tap');
    w.setSuggestionMode('nonsense');
    assert.equal(w.suggestionMode, 'tap');
});

test('mortgage rate suggestion is the current market average for the loan term', () => {
    // Test rates: 30-year 7.28, 15-year 6.6; the empty term uses its own suggestion (30)
    w.calculateAll();
    assert.equal(field('mortgageRate').placeholder, '7.28');
    setField(w, 'mortgageTerm', '15');
    assert.equal(field('mortgageRate').placeholder, '6.6');
    setField(w, 'mortgageTerm', '30');
    assert.equal(field('mortgageRate').placeholder, '7.28');
    const rate = field('mortgageRate');
    rate.focus();
    assert.equal(chip().textContent, 'Use 7.28%');
    enter(rate);
    assert.equal(rate.value, '7.28');
});

test('text fields like names have no suggestion', () => {
    const name = field('earnerName_' + w.getEarnerIndices()[0]);
    assert.equal(w.suggestionFor(name), null);
    name.focus();
    assert.ok(!chipShown());
});
