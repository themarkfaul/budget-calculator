// The user's own order for the budget list. Press and hold a budget (or click and hold with a mouse),
// then drag it up or down, like rearranging apps on a phone's home screen.
// Saved with the account's settings (user_metadata.budgetOrder = [budget ids]), so it's the same on
// every device. Budgets not in the saved order (new ones) go at the end; with no saved order yet,
// the list keeps the newest-first order it loads in.

var budgetOrder = [];
var HOLD_MS = 400;          // how long to hold before the budget lifts
var HOLD_SLOP = 8;          // moving more than this before then is a scroll, not a hold
var dragState = null;
var suppressNextClick = false;

function setBudgetOrder(order) {
    budgetOrder = Array.isArray(order) ? order.filter(function (id) { return typeof id === 'string'; }) : [];
}

// Budgets in the user's order; ones not in it keep their loaded order, after the ordered ones
function orderBudgets(list) {
    if (!budgetOrder.length) return list.slice();
    var rank = {};
    budgetOrder.forEach(function (id, i) { rank[id] = i; });
    return list.map(function (b, i) { return { b: b, i: i }; }).sort(function (x, y) {
        var rx = rank[x.b.id], ry = rank[y.b.id];
        if (rx === undefined && ry === undefined) return x.i - y.i;
        if (rx === undefined) return 1;
        if (ry === undefined) return -1;
        return rx - ry;
    }).map(function (x) { return x.b; });
}

// Moves the budget at index `from` to `to`, then saves the order
async function moveBudget(from, to) {
    if (from === to || from < 0 || to < 0 || from >= budgets.length || to >= budgets.length) return;
    var moved = budgets.splice(from, 1)[0];
    budgets.splice(to, 0, moved);
    budgetOrder = budgets.map(function (b) { return b.id; });
    displayBudgets();
    try {
        await saveUserSettings({ budgetOrder: budgetOrder });
        if (currentUser) currentUser.user_metadata = Object.assign({}, currentUser.user_metadata, { budgetOrder: budgetOrder });
    } catch (e) {
        showToast(isNetworkError(e) ? "You're offline, so the new order is only on this device until you move a budget again online."
            : "Couldn't save the new order: " + e.message, 'error');
    }
}

// ── Press, hold and drag ──

function onBudgetPointerDown(e) {
    var item = e.target.closest('.budget-item');
    if (!item || e.target.closest('.delete-btn') || budgets.length < 2) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelBudgetDrag();
    dragState = { item: item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
    dragState.timer = setTimeout(function () { liftBudget(e.clientY); }, HOLD_MS);
}

function liftBudget(y) {
    if (!dragState) return;
    var item = dragState.item;
    hideBudgetActions();   // the buttons under a selected budget would get in the way
    document.querySelectorAll('.budget-item.selected').forEach(function (el) { el.classList.remove('selected'); });
    selectedBudget = null;
    selectedBudgetIndex = -1;
    dragState.active = true;
    dragState.from = parseInt(item.dataset.index, 10);
    dragState.pointerStart = y;
    dragState.offsetStart = item.offsetTop;
    try { item.setPointerCapture(dragState.pointerId); } catch (err) { /* pointer already gone */ }
    item.classList.add('budget-dragging');
    document.getElementById('budgetList').classList.add('budget-list-dragging');
    if (navigator.vibrate) navigator.vibrate(15);
}

function onBudgetPointerMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    if (!dragState.active) {
        // Moved before the hold finished: the user is scrolling or swiping
        if (Math.abs(e.clientY - dragState.startY) > HOLD_SLOP || Math.abs(e.clientX - dragState.startX) > HOLD_SLOP) cancelBudgetDrag();
        return;
    }
    e.preventDefault();
    var item = dragState.item;
    var list = document.getElementById('budgetList');
    // Swap with a neighbor once the finger passes its middle
    var prev = item.previousElementSibling, next = item.nextElementSibling;
    var itemMiddle = dragState.offsetStart + (e.clientY - dragState.pointerStart) + item.offsetHeight / 2;
    if (prev && prev.classList.contains('budget-item') && itemMiddle < prev.offsetTop + prev.offsetHeight / 2) list.insertBefore(item, prev);
    else if (next && next.classList.contains('budget-item') && itemMiddle > next.offsetTop + next.offsetHeight / 2) list.insertBefore(next, item);
    // Follow the finger, from wherever the item now sits in the list
    item.style.transform = 'translateY(' + (dragState.offsetStart + (e.clientY - dragState.pointerStart) - item.offsetTop) + 'px)';
    // Scroll when dragging near the top or bottom of the screen
    if (e.clientY < 70) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
}

function onBudgetPointerUp(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    if (!dragState.active) { cancelBudgetDrag(); return; }
    var items = Array.from(document.querySelectorAll('#budgetList .budget-item'));
    var to = items.indexOf(dragState.item);
    var from = dragState.from;
    suppressNextClick = true;   // the release would otherwise also select the budget
    setTimeout(function () { suppressNextClick = false; }, 400);
    cancelBudgetDrag();
    if (to !== from) moveBudget(from, to);
    else displayBudgets();
}

function cancelBudgetDrag() {
    if (!dragState) return;
    clearTimeout(dragState.timer);
    dragState.item.classList.remove('budget-dragging');
    dragState.item.style.transform = '';
    document.getElementById('budgetList').classList.remove('budget-list-dragging');
    dragState = null;
}

(function setupBudgetDrag() {
    var list = document.getElementById('budgetList');
    list.addEventListener('pointerdown', onBudgetPointerDown);
    list.addEventListener('pointermove', onBudgetPointerMove);
    list.addEventListener('pointerup', onBudgetPointerUp);
    list.addEventListener('pointercancel', function (e) { if (dragState && !dragState.active) cancelBudgetDrag(); else onBudgetPointerUp(e); });
    // While a budget is lifted, a finger drag moves it instead of scrolling the page
    list.addEventListener('touchmove', function (e) { if (dragState && dragState.active) e.preventDefault(); }, { passive: false });
    list.addEventListener('contextmenu', function (e) { if (e.target.closest('.budget-item')) e.preventDefault(); });
    list.addEventListener('click', function (e) {
        if (suppressNextClick) { e.stopPropagation(); e.preventDefault(); suppressNextClick = false; }
    }, true);
})();
