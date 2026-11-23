// Invites: a friend invite uses the phone's share sheet when there is one, otherwise a dialog;
// a spouse invite names the email address their budgets were shared with.
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load-app');

let w, dlg;
before(() => {
    w = loadApp();
    dlg = w.document.getElementById('inviteDialog');
    dlg.showModal = function () { this.open = true; };
    dlg.close = function () { this.open = false; };
});
beforeEach(() => {
    dlg.open = false;
    delete w.navigator.share;
});

test('the friend invite describes the app and links to it', () => {
    const msg = w.inviteMessage('friend');
    assert.equal(msg.subject, 'Try My Budget AI');
    assert.match(msg.text, /take-home pay/);
    assert.equal(w.appLink(), w.location.origin + '/');
});

test('with a share sheet, a friend invite uses it with the message and link', async () => {
    let shared = null;
    w.navigator.share = async data => { shared = data; };
    await w.sendInvite('friend');
    assert.equal(shared.url, w.appLink());
    assert.match(shared.text, /My Budget AI/);
    assert.equal(dlg.open, false);
});

test('closing the share sheet does nothing; other share failures fall back to the dialog', async () => {
    w.navigator.share = async () => { const e = new Error('closed'); e.name = 'AbortError'; throw e; };
    await w.sendInvite('friend');
    assert.equal(dlg.open, false);
    w.navigator.share = async () => { throw new Error('not allowed'); };
    await w.sendInvite('friend');
    assert.equal(dlg.open, true);
});

test('without a share sheet, the dialog shows an editable message with the link', async () => {
    await w.sendInvite('friend');
    assert.equal(dlg.open, true);
    assert.match(w.document.getElementById('inviteText').value, /Take a look: http/);
});

test('a spouse invite names the email to sign up with and always uses the dialog', async () => {
    w.navigator.share = async () => { throw new Error('should not be used'); };
    await w.sendInvite('spouse', 'pat@example.com');
    assert.equal(dlg.open, true);
    assert.match(w.document.getElementById('inviteTitle').textContent, /pat@example\.com/);
    assert.match(w.document.getElementById('inviteText').value, /Create an account with this email address \(pat@example\.com\)/);
});
