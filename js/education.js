// Education tab: people and their yearly school costs.

// ── Child Management ──

function addChild(name) {
    var idx = childCount;
    childCount++;
    var container = document.getElementById('childrenContainer');
    var block = document.createElement('div');
    block.className = 'earner-block';
    block.id = 'child_' + idx;
    block.innerHTML =
        '<div class="earner-header">' +
            '<h2>🎓</h2>' +
            '<input type="text" class="earner-name-input" id="childName_' + idx + '" placeholder="Person ' + (idx + 1) + ' name">' +
            '<button class="remove-earner-btn" onclick="removeChildBlock(' + idx + ')">✕ Remove</button>' +
        '</div>' +
        '<div class="input-group">' +
            '<div class="input-field"><label for="tuition_' + idx + '">Tuition (Annual)</label>' +
            '<input type="text" inputmode="decimal" id="tuition_' + idx + '" placeholder="9386"></div>' +
            '<div class="input-field"><label for="lunch_' + idx + '">Lunch/Meals (Annual)</label>' +
            '<input type="text" inputmode="decimal" id="lunch_' + idx + '" placeholder="1235"></div>' +
            '<div class="input-field"><label for="afterschool_' + idx + '">Afterschool Program (Annual)</label>' +
            '<input type="text" inputmode="decimal" id="afterschool_' + idx + '" placeholder="0"></div>' +
        '</div>' +
        '<div class="earner-subtotal">Monthly Cost: $<span id="childResult_' + idx + '">0.00</span></div>';
    container.appendChild(block);
    document.getElementById('childName_' + idx).value = name || '';

    var inputs = block.querySelectorAll('input[inputmode="decimal"]');
    for (var i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener('input', calculateAll);
    }
    setupMoneyFormatting(block);

    updateChildRemoveButtons();
    isDirty = true;
    return idx;
}

function removeChildBlock(idx) {
    var block = document.getElementById('child_' + idx);
    if (block) block.remove();
    updateChildRemoveButtons();
    isDirty = true;
    calculateAll();
}

function updateChildRemoveButtons() {
    var blocks = document.querySelectorAll('#childrenContainer .earner-block');
    var btns = document.querySelectorAll('#childrenContainer .remove-earner-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].style.display = blocks.length > 1 ? 'inline-block' : 'none';
    }
}

function getChildIndices() {
    var blocks = document.querySelectorAll('#childrenContainer .earner-block');
    var indices = [];
    for (var i = 0; i < blocks.length; i++) {
        var id = blocks[i].id.replace('child_', '');
        indices.push(parseInt(id));
    }
    return indices;
}


function calculateEducation() {
    var indices = getChildIndices();
    var totalAnnual = 0;

    for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        var tuition = val('tuition_' + idx);
        var lunch = val('lunch_' + idx);
        var afterschool = val('afterschool_' + idx);
        var childAnnual = tuition + lunch + afterschool;
        setText('childResult_' + idx, formatCurrency(childAnnual / 12));
        totalAnnual += childAnnual;
    }

    var monthly = totalAnnual / 12;
    setText('educationResult', formatCurrency(monthly));
    return monthly;
}

