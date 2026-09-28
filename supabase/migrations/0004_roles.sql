-- Roles & per-tab permissions.
-- role: 'admin' (everything) | 'user' (per-tab none/view/edit, edit only on quotes)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.perm(tab text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p.role = 'admin' then 'edit'
    else coalesce(p.perms ->> tab, 'none')
  end
  from public.profiles p
  where p.user_id = auth.uid();
$$;

-- profiles: everyone reads their own row, admins read all. Writes only via service role (API).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Business tables: any logged-in user may read; only admins may write,
-- except quotes which follow the user's 'quotes' permission.
do $$
declare
  t text;
begin
  foreach t in array array['products', 'clients', 'sales', 'payments', 'quotes']
  loop
    execute format('drop policy if exists "authenticated_full_access" on public.%I;', t);
    execute format('drop policy if exists "read_all" on public.%I;', t);
    execute format('drop policy if exists "write_insert" on public.%I;', t);
    execute format('drop policy if exists "write_update" on public.%I;', t);
    execute format('drop policy if exists "write_delete" on public.%I;', t);
    execute format('create policy "read_all" on public.%I for select to authenticated using (public.perm(''dashboard'') <> ''none'' or public.perm(%L) <> ''none'' or public.perm(''quotes'') <> ''none'');', t, t);
  end loop;
end $$;

do $$
declare
  t text;
  cond text;
begin
  foreach t in array array['products', 'clients', 'sales', 'payments', 'quotes']
  loop
    cond := case when t = 'quotes' then 'public.perm(''quotes'') = ''edit''' else 'public.is_admin()' end;
    execute format('create policy "write_insert" on public.%I for insert to authenticated with check (%s);', t, cond);
    execute format('create policy "write_update" on public.%I for update to authenticated using (%s) with check (%s);', t, cond, cond);
    execute format('create policy "write_delete" on public.%I for delete to authenticated using (%s);', t, cond);
  end loop;
end $$;

-- Existing account becomes admin.
insert into public.profiles (user_id, username, role, perms)
select id, 'alejocc', 'admin', '{}'::jsonb
from auth.users where email = 'alejocc@users.crediventas.internal'
on conflict (user_id) do update set role = 'admin';

notify pgrst, 'reload schema';
