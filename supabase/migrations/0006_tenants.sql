-- Multi-tenant: several independent business spaces ("tenants") in one app.
-- Every business row carries its tenant, and RLS only lets a user touch rows of
-- their own tenant. A 'superadmin' profile (tenant = null) can reach every tenant.

create table if not exists public.tenants (
  id text primary key,
  name text not null,
  theme text not null default 'green'
);
alter table public.tenants enable row level security;

insert into public.tenants (id, name, theme) values
  ('elkin', 'Elkin Olivo', 'green'),
  ('cyndi', 'Cyndi', 'pink')
on conflict (id) do nothing;

alter table public.profiles add column if not exists tenant text references public.tenants(id);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('superadmin', 'admin', 'user'));

create or replace function public.is_superadmin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select role = 'superadmin' from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.current_tenant()
returns text language sql security definer set search_path = public stable as $$
  select tenant from public.profiles where user_id = auth.uid();
$$;

create or replace function public.can_access_tenant(t text)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_superadmin() or (t is not null and t = public.current_tenant());
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select role in ('admin', 'superadmin') from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.perm(tab text)
returns text language sql security definer set search_path = public stable as $$
  select case
    when p.role in ('admin', 'superadmin') then 'edit'
    else coalesce(p.perms ->> tab, 'none')
  end
  from public.profiles p
  where p.user_id = auth.uid();
$$;

drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select" on public.tenants
  for select to authenticated using (public.can_access_tenant(id));

-- profiles: own row; admins see their tenant's accounts; superadmin sees all.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin() or (public.is_admin() and tenant = public.current_tenant()));

do $$
declare
  t text;
  cond text;
begin
  foreach t in array array['products', 'clients', 'sales', 'payments', 'quotes']
  loop
    execute format('alter table public.%I add column if not exists tenant text references public.tenants(id);', t);
    execute format('create index if not exists %I on public.%I (tenant);', t || '_tenant_idx', t);
    execute format('drop policy if exists "read_all" on public.%I;', t);
    execute format('drop policy if exists "write_insert" on public.%I;', t);
    execute format('drop policy if exists "write_update" on public.%I;', t);
    execute format('drop policy if exists "write_delete" on public.%I;', t);
    execute format('create policy "read_all" on public.%I for select to authenticated using (public.can_access_tenant(tenant) and (public.perm(''dashboard'') <> ''none'' or public.perm(%L) <> ''none'' or public.perm(''quotes'') <> ''none''));', t, t);
    cond := case when t = 'quotes' then 'public.perm(''quotes'') = ''edit''' else 'public.is_admin()' end;
    execute format('create policy "write_insert" on public.%I for insert to authenticated with check (public.can_access_tenant(tenant) and %s);', t, cond);
    execute format('create policy "write_update" on public.%I for update to authenticated using (public.can_access_tenant(tenant) and %s) with check (public.can_access_tenant(tenant) and %s);', t, cond, cond);
    execute format('create policy "write_delete" on public.%I for delete to authenticated using (public.can_access_tenant(tenant) and %s);', t, cond);
  end loop;
end $$;

-- The original OP account supervises every space.
update public.profiles set role = 'superadmin', tenant = null where username = 'alejocc';

notify pgrst, 'reload schema';
