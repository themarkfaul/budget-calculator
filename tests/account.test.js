// Delete Account: password check, the database call, and error handling.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load-app');

let w, calls;

// Stand-in Supabase that records what the app asks for
function fakeSupabase({ passwordOk = true, rpcError = null } = {}) {
    calls = [];
    w.supabase = {
        auth: {
            getUser: async () => ({ data: { user: { id: 'u1', email: 'me@example.com' } } }),
            signInWithPassword: async (args) => {
                calls.push(['signIn', args.email, args.password]);
                return passwordOk ? { data: {}, error: null } : { data: null, error: { message: 'Invalid login credentials' } };
            },
            signOut: async (opts) => { calls.push(['signOut', opts && opts.scope]); return { error: null }; }
        },
        rpc: async (name) => { calls.push(['rpc', name]); return { data: null, error: rpcError }; }
    };
}

beforeEach(() => {
    w = loadApp();
    // jsdom doesn't draw dialogs, so stand in for open/close
    const dlg = w.document.getElementById('deleteAccountDialog');
    dlg.showModal = function () { this.open = true; };
    dlg.close = function () { this.open = false; };
});

function submit() {
    return w.handleDeleteAccount({ preventDefault() {} });
}

test('Delete Account opens a confirmation that asks for the password', () => {
    fakeSupabase();
    w.openDeleteAccount();
    assert.equal(w.document.getElementById('deleteAccountDialog').open, true);
    assert.equal(w.document.getElementById('deleteAccountPassword').value, '');
    w.closeDeleteAccount();
    assert.equal(w.document.getElementById('deleteAccountDialog').open, false);
});

test('an empty password does nothing', async () => {
    fakeSupabase();
    w.openDeleteAccount();
    await submit();
    assert.deepEqual(calls, []);
    assert.match(w.document.getElementById('deleteAccountError').textContent, /Enter your password/);
});

test('a wrong password stops before anything is deleted', async () => {
    fakeSupabase({ passwordOk: false });
    w.openDeleteAccount();
    w.document.getElementById('deleteAccountPassword').value = 'wrong';
    await submit();
    assert.equal(calls.some(c => c[0] === 'rpc'), false);
    assert.match(w.document.getElementById('deleteAccountError').textContent, /password is incorrect/);
    assert.equal(w.document.getElementById('deleteAccountBtn').disabled, false);
});

test('the right password deletes the account, then signs out', async () => {
    fakeSupabase();
    w.openDeleteAccount();
    w.document.getElementById('deleteAccountPassword').value = 'secret';
    await submit();
    assert.deepEqual(calls.map(c => c.join(' ')), [
        'signIn me@example.com secret',
        'rpc delete_account',
        'signOut local'
    ]);
    assert.equal(w.document.getElementById('deleteAccountError').textContent, '');
});

test('a database error is shown and the button comes back', async () => {
    fakeSupabase({ rpcError: { message: 'function delete_account() does not exist' } });
    w.openDeleteAccount();
    w.document.getElementById('deleteAccountPassword').value = 'secret';
    await submit();
    assert.match(w.document.getElementById('deleteAccountError').textContent, /does not exist/);
    assert.equal(w.document.getElementById('deleteAccountBtn').disabled, false);
    assert.equal(calls.some(c => c[0] === 'signOut'), false);
});
