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
    var result = await supabase.auth.signOut();
    if (result.error) throw result.error;
    window.location.href = '/';
}

async function getUser() {
    var result = await supabase.auth.getUser();
    return result.data.user;
}

async function requireAuth() {
    var user = await getUser();
    if (!user) {
        window.location.href = '/';
        return null;
    }
    return user;
}
