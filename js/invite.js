// Invites: tell a friend about the app, or let a spouse know their budgets are shared.
// The invite goes out from the user's own phone or email: the phone's share sheet (Messages, Mail,
// WhatsApp, ...) where there is one, otherwise a dialog with Email, Text and Copy buttons.
// Nothing is sent through our servers, and the app never sees who it goes to.

function appLink() {
    return location.origin + '/';
}

// { subject, text } for an invite. kind: 'friend' or 'spouse' (email: the address they were shared with)
function inviteMessage(kind, email) {
    if (kind === 'spouse') {
        return {
            subject: 'I shared our budgets with you on My Budget AI',
            text: 'I shared our budgets with you on My Budget AI, so we can plan together. Create an account with this email address (' +
                email + ') and our budgets will show up in your list:'
        };
    }
    return {
        subject: 'Try My Budget AI',
        text: "I've been using My Budget AI to plan our monthly budget. It works out your take-home pay, sets aside money for big yearly bills, and helps plan for things like a new house or college. Take a look:"
    };
}

var inviteState = null;

async function sendInvite(kind, email) {
    var msg = inviteMessage(kind, email);
    // Phones (and some computers) have a built-in share sheet. A spouse invite uses the dialog
    // instead, so the Email button can fill in the address they were shared with.
    if (navigator.share && kind === 'friend') {
        try {
            await navigator.share({ title: msg.subject, text: msg.text, url: appLink() });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;   // the user closed the share sheet
            // Otherwise fall through to the dialog
        }
    }
    openInviteDialog(kind, email);
}

function openInviteDialog(kind, email) {
    var msg = inviteMessage(kind, email);
    inviteState = { kind: kind, email: email || '' };
    setText('inviteTitle', kind === 'spouse' ? '📨 Let ' + email + ' know' : '📨 Invite a friend');
    document.getElementById('inviteText').value = msg.text + ' ' + appLink();
    document.getElementById('inviteError').textContent = '';
    document.getElementById('inviteDialog').showModal();
}

function closeInvite() {
    document.getElementById('inviteDialog').close();
}

function inviteText() {
    return document.getElementById('inviteText').value.trim();
}

function inviteByEmail() {
    var subject = inviteMessage(inviteState.kind, inviteState.email).subject;
    location.href = 'mailto:' + encodeURIComponent(inviteState.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(inviteText());
}

function inviteByText() {
    // "sms:?&body=" works on both iPhone and Android
    location.href = 'sms:?&body=' + encodeURIComponent(inviteText());
}

async function copyInvite() {
    var text = inviteText();
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        // Older browsers: select the text so the user can copy it themselves
        var box = document.getElementById('inviteText');
        box.focus();
        box.select();
        try { document.execCommand('copy'); } catch (err) {
            document.getElementById('inviteError').textContent = 'Select the message above and copy it.';
            return;
        }
    }
    showToast('Copied. Paste it into a message or email.', 'success');
}
