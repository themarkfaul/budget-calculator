-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Create the budgets table
create table public.budgets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    data jsonb default '{}'::jsonb,
    summary jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.budgets enable row level security;

-- 3. Users can only see their own budgets
create policy "Users can view their own budgets"
    on public.budgets for select
    using (auth.uid() = user_id);

-- 4. Users can insert their own budgets
create policy "Users can insert their own budgets"
    on public.budgets for insert
    with check (auth.uid() = user_id);

-- 5. Users can update their own budgets
create policy "Users can update their own budgets"
    on public.budgets for update
    using (auth.uid() = user_id);

-- 6. Users can delete their own budgets
create policy "Users can delete their own budgets"
    on public.budgets for delete
    using (auth.uid() = user_id);

-- 7. Index for fast lookups by user
create index budgets_user_id_idx on public.budgets(user_id);

-- 8. Account deletion (required by the App Store and Google Play).
--    Lets a signed-in user delete their own sign-in account and budgets, and nothing else.
--    Runs with elevated rights (security definer) because the browser can't touch auth.users.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Not signed in';
    end if;
    delete from public.budgets where user_id = auth.uid();
    delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
