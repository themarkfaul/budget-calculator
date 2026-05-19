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
        user_id: user.id,
        name: budget.name,
        data: budget.data,
        summary: budget.summary,
        updated_at: new Date().toISOString()
    };

    if (budget.id) {
        var result = await supabase
            .from('budgets')
            .update(row)
            .eq('id', budget.id)
            .select()
            .single();
        if (result.error) throw result.error;
        return result.data;
    } else {
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
