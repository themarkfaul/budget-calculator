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
    delete from public.household_shares where shared_with_email = lower(auth.jwt() ->> 'email');
    delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- 9. Sharing with a spouse or partner.
--    An owner adds someone's email; that person can then see and edit all of the owner's budgets
--    (but not delete them). Emails come from the signed-in user's verified login (auth.jwt()).
create table public.household_shares (
    owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    owner_email text not null default lower(auth.jwt() ->> 'email'),
    shared_with_email text not null check (shared_with_email = lower(trim(shared_with_email)) and shared_with_email like '%_@_%'),
    created_at timestamptz default now(),
    primary key (owner_id, shared_with_email)
);

alter table public.household_shares enable row level security;

create policy "Owners see who they share with"
    on public.household_shares for select
    using (owner_id = auth.uid());

create policy "Owners share their own budgets"
    on public.household_shares for insert
    with check (owner_id = auth.uid() and owner_email = lower(auth.jwt() ->> 'email'));

create policy "Owners stop sharing"
    on public.household_shares for delete
    using (owner_id = auth.uid());

create policy "People see who shares with them"
    on public.household_shares for select
    using (shared_with_email = lower(auth.jwt() ->> 'email'));

create policy "People can remove a share made to them"
    on public.household_shares for delete
    using (shared_with_email = lower(auth.jwt() ->> 'email'));

create index household_shares_email_idx on public.household_shares(shared_with_email);

create policy "People can view budgets shared with them"
    on public.budgets for select
    using (exists (select 1 from public.household_shares s
                   where s.owner_id = budgets.user_id
                     and s.shared_with_email = lower(auth.jwt() ->> 'email')));

create policy "People can edit budgets shared with them"
    on public.budgets for update
    using (exists (select 1 from public.household_shares s
                   where s.owner_id = budgets.user_id
                     and s.shared_with_email = lower(auth.jwt() ->> 'email')))
    with check (exists (select 1 from public.household_shares s
                        where s.owner_id = budgets.user_id
                          and s.shared_with_email = lower(auth.jwt() ->> 'email')));
