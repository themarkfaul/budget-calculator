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
