// Formatting and small DOM helpers used throughout the app.

function formatCurrency(amount) {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function val(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var raw = el.value.replace(/,/g, '');
    return parseFloat(raw) || 0;
}

function parseMoney(str) {
    return parseFloat(String(str || '0').replace(/[$,]/g, '')) || 0;
}

function formatMoneyValue(value) {
    var num = parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num) || num === 0) return '';
    var parts = num.toFixed(2).split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (parts[1] === '00') return whole;
    return whole + '.' + parts[1];
}

function setupMoneyFormatting(container) {
    var inputs = (container || document).querySelectorAll('input[inputmode="decimal"]:not([data-percent]):not([data-plain])');
    for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].dataset.moneyBound) continue;
        inputs[i].dataset.moneyBound = '1';
        inputs[i].addEventListener('focus', function () {
            var raw = this.value.replace(/,/g, '');
            if (raw !== this.value) this.value = raw;
        });
        inputs[i].addEventListener('blur', function () {
            this.value = formatMoneyValue(this.value);
        });
    }

    var pctInputs = (container || document).querySelectorAll('input[data-percent]');
    for (var j = 0; j < pctInputs.length; j++) {
        if (pctInputs[j].dataset.percentBound) continue;
        pctInputs[j].dataset.percentBound = '1';
        pctInputs[j].addEventListener('blur', function () {
            var v = parseFloat(this.value);
            if (!isNaN(v) && v > 100) this.value = '100';
        });
    }
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}

