// Grey suggested values in empty calculator fields, and how the user accepts them.
// The behaviour is a per-user setting (⚙️ Settings), saved with their sign-in:
//   'tap'     - (default) click into an empty field and a "Use 60" button appears; tap it or press
//               Enter to accept. Leaving without typing sets the field to 0, so it's clearly not accepted.
//   'leave'   - Enter, Tab or clicking into another field accepts the suggestion. Type 0 to skip a bill.
//   'prefill' - new blank budgets start with the suggestions already filled in.

var SUGGESTION_MODES = ['tap', 'leave', 'prefill'];
var suggestionMode = 'tap';

// Tabs whose fields are personal enough that a new budget shouldn't be pre-filled with examples
var NO_PREFILL_CONTAINERS = ['incomeTab', 'educationTab', 'escrowScreen'];

function setSuggestionMode(mode) {
    suggestionMode = SUGGESTION_MODES.indexOf(mode) >= 0 ? mode : 'tap';
}

// The suggested number for a field, or null. Comes from its grey placeholder;
// text placeholders like "Monthly $" or "Person 1 name" aren't suggestions.
function suggestionFor(input) {
    if (!input || input.tagName !== 'INPUT' || input.getAttribute('inputmode') !== 'decimal') return null;
    var v = parseFloat(String(input.placeholder || '').replace(/,/g, ''));
    return isNaN(v) || v <= 0 ? null : v;
}

function isMoneyInput(input) {
    return !input.hasAttribute('data-percent') && !input.hasAttribute('data-plain');
}

function suggestionLabel(input, v) {
    if (input.hasAttribute('data-percent')) return v + '%';
    if (input.hasAttribute('data-plain')) return String(v);
    return '$' + formatMoneyValue(v);
}

// Puts the suggestion in the field and recalculates, as if the user had typed it
function acceptSuggestion(input) {
    var v = suggestionFor(input);
    if (v === null) return false;
    var focused = document.activeElement === input;
    input.value = isMoneyInput(input) && !focused ? formatMoneyValue(v) : String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideSuggestionChip();
    return true;
}

// ── "Use 60" button under the focused field ──

function suggestionChip() {
    var chip = document.getElementById('suggestionChip');
    if (chip) return chip;
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'suggestionChip';
    chip.className = 'suggestion-chip';
    chip.tabIndex = -1;   // Tab goes to the next field; keyboard users press Enter instead
    // mousedown would take focus away from the field before the click lands
    chip.addEventListener('mousedown', function (e) { e.preventDefault(); });
    chip.addEventListener('click', function () {
        if (chip.forInput) acceptSuggestion(chip.forInput);
    });
    return chip;
}

function showSuggestionChip(input) {
    var v = suggestionFor(input);
    if (v === null || input.value.trim() !== '') { hideSuggestionChip(); return; }
    var chip = suggestionChip();
    chip.textContent = 'Use ' + suggestionLabel(input, v);
    chip.forInput = input;
    input.after(chip);
    chip.style.display = '';
}

function hideSuggestionChip() {
    var chip = document.getElementById('suggestionChip');
    if (chip) { chip.style.display = 'none'; chip.forInput = null; }
}

// ── Field events (delegated, so fields added later for new earners or children work too) ──

function onSuggestionFocus(e) {
    if (suggestionFor(e.target) !== null) showSuggestionChip(e.target);
}

function onSuggestionInput(e) {
    var chip = document.getElementById('suggestionChip');
    if (!chip || chip.forInput !== e.target) return;
    if (e.target.value.trim() === '') showSuggestionChip(e.target);
    else hideSuggestionChip();
}

function onSuggestionBlur(e) {
    var input = e.target;
    if (suggestionFor(input) === null) return;
    hideSuggestionChip();
    if (input.value.trim() !== '') return;
    if (suggestionMode === 'leave') {
        acceptSuggestion(input);
    } else {
        // Show a real 0 so the grey example doesn't look like it was accepted
        input.value = '0';
    }
}

function onSuggestionKeydown(e) {
    if (e.key !== 'Enter' || suggestionFor(e.target) === null || e.target.value.trim() !== '') return;
    e.preventDefault();
    acceptSuggestion(e.target);
}

function setupSuggestions(container) {
    container = container || document.getElementById('calculatorScreen');
    container.addEventListener('focusin', onSuggestionFocus);
    container.addEventListener('focusout', onSuggestionBlur);
    container.addEventListener('input', onSuggestionInput);
    container.addEventListener('keydown', onSuggestionKeydown);
    updateMortgageRateSuggestion();
}

// 'prefill' setting: fill a new blank budget's empty fields with their suggestions
function prefillSuggestions() {
    var inputs = document.querySelectorAll('#calculatorScreen input[inputmode="decimal"]');
    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var skip = NO_PREFILL_CONTAINERS.some(function (id) {
            var box = document.getElementById(id);
            return box && box.contains(input);
        });
        var v = suggestionFor(input);
        if (skip || v === null || input.value.trim() !== '') continue;
        input.value = isMoneyInput(input) ? formatMoneyValue(v) : String(v);
    }
    calculateAll();
}

// The mortgage rate suggestion is today's Freddie Mac average for the loan term entered
// (or the term's own suggestion when it's empty)
function updateMortgageRateSuggestion() {
    var rateInput = document.getElementById('mortgageRate');
    var termInput = document.getElementById('mortgageTerm');
    if (!rateInput || !termInput) return;
    var term = val('mortgageTerm') || parseFloat(termInput.placeholder) || 30;
    var market = marketRateFor(term);
    if (!market) return;
    var text = String(market.rate);
    if (rateInput.placeholder !== text) {
        rateInput.placeholder = text;
        var chip = document.getElementById('suggestionChip');
        if (chip && chip.forInput === rateInput) showSuggestionChip(rateInput);
    }
}

// ── Settings dialog ──

function openSettings() {
    var radios = document.querySelectorAll('input[name="suggestionMode"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === suggestionMode;
    document.getElementById('settingsError').textContent = '';
    document.getElementById('settingsDialog').showModal();
}

function closeSettings() {
    document.getElementById('settingsDialog').close();
}

async function handleSaveSettings(evt) {
    evt.preventDefault();
    var picked = document.querySelector('input[name="suggestionMode"]:checked');
    var mode = picked ? picked.value : 'tap';
    var btn = document.getElementById('settingsSaveBtn');
    btn.disabled = true;
    try {
        await saveUserSettings({ suggestionMode: mode });
        setSuggestionMode(mode);
        closeSettings();
        showToast('Settings saved.', 'success');
    } catch (e) {
        document.getElementById('settingsError').textContent = "Couldn't save settings: " + e.message;
    }
    btn.disabled = false;
}
