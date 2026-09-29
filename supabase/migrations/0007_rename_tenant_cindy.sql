-- The space was created as 'cyndi' / 'Cyndi' by mistake; the name is Cindy.
-- Tenant ids are referenced (without ON UPDATE CASCADE) by profiles and every
-- business table, so add the new id, move every reference, then drop the old one.

insert into public.tenants (id, name, theme)
select 'cindy', 'Cindy', theme from public.tenants where id = 'cyndi'
on conflict (id) do update set name = excluded.name;

update public.profiles set tenant = 'cindy' where tenant = 'cyndi';

do $$
declare
  t text;
begin
  foreach t in array array['products', 'clients', 'sales', 'payments', 'quotes']
  loop
    execute format('update public.%I set tenant = ''cindy'' where tenant = ''cyndi'';', t);
  end loop;
end $$;

delete from public.tenants where id = 'cyndi';

notify pgrst, 'reload schema';
