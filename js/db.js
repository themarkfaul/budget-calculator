async function loadBudgets() {
    var result = await supabase
        .from('budgets')
        .select('*')
        .order('updated_at', { ascending: false });

    if (result.error) throw result.error;
    return result.data;
}

async function saveBudgetToDb(budget) {
    var user = await getUser();
    if (!user) throw new Error('Not authenticated');

    var row = {
        name: budget.name,
        data: budget.data,
        summary: budget.summary,
        updated_at: new Date().toISOString()
    };

    if (budget.id) {
        // Never change the owner on update: a spouse saving a shared budget keeps it the owner's.
        // If the budget was saved by someone else since it was opened (updated_at moved on),
        // stop with a conflict so the user can choose; pass budget.overwrite to save anyway.
        var query = supabase.from('budgets').update(row).eq('id', budget.id);
        if (budget.updated_at && !budget.overwrite) query = query.eq('updated_at', budget.updated_at);
        var result = await query.select();
        if (result.error) throw result.error;
        if (!result.data || result.data.length === 0) {
            var conflict = new Error('This budget was changed by someone else since you opened it.');
            conflict.code = 'BUDGET_CONFLICT';
            throw conflict;
        }
        return result.data[0];
    } else {
        row.user_id = user.id;
        var result = await supabase
            .from('budgets')
            .insert(row)
            .select()
            .single();
        if (result.error) throw result.error;
        return result.data;
    }
}

async function deleteBudgetFromDb(budgetId) {
    var result = await supabase
        .from('budgets')
        .delete()
        .eq('id', budgetId);

    if (result.error) throw result.error;
}

// ── Household sharing (table household_shares, see supabase-schema.sql) ──
// Each row lets one person (shared_with_email) see and edit all of the owner's budgets.

async function loadHouseholdShares() {
    var result = await supabase.from('household_shares').select('*').order('created_at');
    if (result.error) throw result.error;
    return result.data;
}

async function addHouseholdShare(email) {
    var result = await supabase.from('household_shares').insert({ shared_with_email: email }).select().single();
    if (result.error) throw result.error;
    return result.data;
}

async function removeHouseholdShare(ownerId, email) {
    var result = await supabase.from('household_shares').delete()
        .eq('owner_id', ownerId).eq('shared_with_email', email);
    if (result.error) throw result.error;
}
