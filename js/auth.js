async function signUp(email, password) {
    var result = await supabase.auth.signUp({ email: email, password: password });
    if (result.error) throw result.error;
    return result.data;
}

async function signIn(email, password) {
    var result = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw result.error;
    return result.data;
}

// Emails a link to reset-password.html, where the user chooses a new password.
// Supabase only allows redirects listed under Authentication → URL Configuration.
async function sendPasswordReset(email) {
    var result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
    });
    if (result.error) throw result.error;
}

async function updatePassword(newPassword) {
    var result = await supabase.auth.updateUser({ password: newPassword });
    if (result.error) throw result.error;
    return result.data;
}

async function signOut() {
    if (typeof clearBudgetCaches === 'function') clearBudgetCaches();
    var result = await supabase.auth.signOut();
    if (result.error) throw result.error;
    window.location.href = '/';
}

// Permanently deletes the signed-in user's account and all their budgets.
// Re-checks the password first, so someone holding an unlocked phone can't do it.
// The delete itself runs in the database function delete_account() (see supabase-schema.sql),
// because the browser isn't allowed to remove sign-in accounts directly.
async function deleteAccount(password) {
    var user = await getUser();
    if (!user) throw new Error('You are signed out. Sign in again and retry.');

    var check = await supabase.auth.signInWithPassword({ email: user.email, password: password });
    if (check.error) throw new Error('That password is incorrect.');

    var result = await supabase.rpc('delete_account');
    if (result.error) throw result.error;

    if (typeof clearBudgetCaches === 'function') clearBudgetCaches();
    // The account is gone, so the server may reject sign-out; clearing the local session is enough.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { /* already invalid */ }
}

// Saves the user's app settings (like how suggested values work) with their sign-in,
// so they follow the user to every device.
async function saveUserSettings(settings) {
    var result = await supabase.auth.updateUser({ data: settings });
    if (result.error) throw result.error;
    return result.data;
}

async function getUser() {
    var result = await supabase.auth.getUser();
    return result.data.user;
}

// With no connection the server can't confirm the sign-in, so use the one saved on this device
async function offlineUser() {
    if (navigator.onLine) return null;
    try {
        var session = (await supabase.auth.getSession()).data.session;
        if (session && session.user) return session.user;
    } catch (e) { /* fall through to the stored copy */ }
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (/^sb-.*-auth-token$/.test(key)) {
                var stored = JSON.parse(localStorage.getItem(key));
                if (stored && stored.user) return stored.user;
            }
        }
    } catch (e) { /* storage unavailable */ }
    return null;
}

async function requireAuth() {
    var user = null;
    try { user = await getUser(); } catch (e) { /* offline */ }
    if (!user) user = await offlineUser();
    if (!user) {
        window.location.href = '/';
        return null;
    }
    return user;
}
